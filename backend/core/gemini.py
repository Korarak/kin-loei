import base64
import json
import logging
import httpx
from google import genai
from google.genai import types
from core.config import settings  # still needed for gemini_api_key

logger = logging.getLogger(__name__)

client = genai.Client(api_key=settings.gemini_api_key)

# Fallback chain — ตรงตามสูตร TS OCR reference
# skip to next model เฉพาะ quota (429) หรือ server error (5xx) เท่านั้น
MODELS = [
    "gemini-3-flash-preview"
]


SYSTEM_PROMPT = """คุณเป็น AI ที่เชี่ยวชาญการอ่านฉลากอาหารและวิเคราะห์ความปลอดภัยของผลิตภัณฑ์สำหรับผู้มีโรคประจำตัวหรือแพ้อาหาร
ตอบเป็น JSON เท่านั้น ห้ามมี markdown หรือข้อความอื่นนอก JSON

กรุณาอ่านและวิเคราะห์ข้อมูลต่อไปนี้ให้ครบถ้วน:

1. ชื่อสินค้า (product_name) — ชื่อเต็มของผลิตภัณฑ์บนฉลาก
2. ยี่ห้อ (brand) — ชื่อบริษัท/แบรนด์
3. ประเภทสินค้า (product_type) — เช่น บะหมี่กึ่งสำเร็จรูป, ขนมขบเคี้ยว, เครื่องดื่ม
4. ส่วนประกอบทั้งหมด (ingredients) — อ่านให้ครบทุกรายการตามที่ระบุบนฉลาก รวมถึงสารปรุงแต่ง สารกันบูด สารให้ความหวาน รหัส E-number
5. วัตถุเจือปน (additives) — เฉพาะรายการที่เป็น food additive / สารเคมีเจือปน
6. คำเตือนสารก่อภูมิแพ้บนฉลาก (label_allergen_warnings) — เช่น "มีถั่ว" "ผลิตในโรงงานที่ใช้กลูเตน"
7. ส่วนผสมที่ต้องระวัง (flagged_ingredients) — เทียบกับโปรไฟล์สุขภาพผู้ใช้ที่ได้รับมา ระบุ name/reason/severity
8. สถานะ (status) — SAFE / CAUTION / AVOID โดยพิจารณาจากโปรไฟล์สุขภาพของผู้ใช้เป็นหลัก
9. สรุป (summary) — 1-2 ประโยค ภาษาไทย อธิบายเหตุผลหลักของสถานะ
10. คำแนะนำ (recommendation) — คำแนะนำเฉพาะสำหรับผู้ใช้คนนี้
11. ข้อจำกัดความรับผิดชอบ (disclaimer) — ระบุว่าเป็นข้อมูลเบื้องต้น ควรปรึกษาแพทย์

กฎสำคัญ:
- อ่านส่วนผสมให้ครบทุกรายการ ห้ามข้ามแม้จะดูทั่วไป
- ถ้าภาพไม่ชัดแต่อ่านชื่อสินค้า/ยี่ห้อได้บ้าง → ให้ระบุ product_name และ brand ที่มองเห็น, ตั้ง ingredients = [], summary = "อ่านส่วนประกอบจากภาพไม่ชัด ระบบกำลังค้นหาข้อมูลเพิ่มเติม", status = "CAUTION"
- ถ้าภาพไม่ชัดและอ่านอะไรไม่ได้เลย → summary = "อ่านไม่ชัด กรุณาถ่ายใหม่", status = "CAUTION"
- ให้ข้อมูลและเตือนเท่านั้น ห้ามวินิจฉัยโรค
- โรคประจำตัวของผู้ใช้มีผลโดยตรงต่อ status เช่น ผู้ป่วยเบาหวานพบน้ำตาลสูง → AVOID"""

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "status": {"type": "string", "enum": ["SAFE", "CAUTION", "AVOID"]},
        "product_name": {"type": "string"},
        "brand": {"type": "string"},
        "product_type": {"type": "string"},
        "ingredients": {
            "type": "array",
            "items": {"type": "string"}
        },
        "additives": {
            "type": "array",
            "items": {"type": "string"}
        },
        "label_allergen_warnings": {
            "type": "array",
            "items": {"type": "string"}
        },
        "flagged_ingredients": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "reason": {"type": "string"},
                    "severity": {"type": "string", "enum": ["high", "medium", "low"]}
                },
                "required": ["name", "reason", "severity"]
            }
        },
        "summary": {"type": "string"},
        "recommendation": {"type": "string"},
        "disclaimer": {"type": "string"}
    },
    "required": ["status", "ingredients", "flagged_ingredients", "summary", "recommendation", "disclaimer"]
}


def _is_retryable(exc: Exception) -> bool:
    err = str(exc).lower()
    status = getattr(exc, "status_code", None) or getattr(exc, "code", None) or 0
    return (
        status in (429, 500, 502, 503)
        or "429" in err
        or "quota" in err
        or "resource exhausted" in err
        or "rate limit" in err
        or "500" in err
        or "502" in err
        or "503" in err
    )


async def analyze_food(
    image_b64: str | None,
    image_mime: str | None,
    text_input: str | None,
    health_profile: dict,
) -> dict:
    parts = []

    if image_b64 and image_mime:
        parts.append(types.Part.from_bytes(
            data=base64.b64decode(image_b64),
            mime_type=image_mime,
        ))

    profile_text = _build_profile_text(health_profile)

    user_message = f"{profile_text}\n\n"
    if text_input:
        user_message += f"ข้อมูลเพิ่มเติม: {text_input}\n\n"
    user_message += "กรุณาวิเคราะห์และตอบเป็น JSON ตามรูปแบบที่กำหนด"

    parts.append(types.Part.from_text(text=user_message))

    last_error: Exception | None = None

    for model_name in MODELS:
        try:
            logger.info("[Gemini] trying %s", model_name)
            response = await client.aio.models.generate_content(
                model=model_name,
                contents=[types.Content(role="user", parts=parts)],
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    response_mime_type="application/json",
                    response_schema=RESPONSE_SCHEMA,
                    temperature=0.1,
                ),
            )
            result = json.loads(response.text)
            logger.info("[Gemini] success with %s", model_name)
            return result

        except Exception as e:
            last_error = e
            logger.warning("[Gemini] %s failed: %.120s", model_name, str(e))
            if _is_retryable(e):
                continue  # quota / server error — try next model
            break  # auth / bad request — don't bother trying other models

    raise last_error or RuntimeError("All Gemini models exhausted")


_SEARCH_GROUNDING_MODELS = [
    "gemini-2.0-flash",
    "gemini-2.5-flash-preview",
    "gemini-2.5-flash-preview-05-20",
]

_SEARCH_JSON_TEMPLATE = (
    '{{"found": true, "search_method": "{method}",'
    ' "ingredients_from_web": ["..."],'
    ' "additives_from_web": ["..."],'
    ' "label_accuracy": "ตรงกัน | ไม่ตรงกัน | ไม่พบข้อมูล",'
    ' "label_vs_reference": "รายละเอียด หรือ null",'
    ' "authority_warnings": ["คำเตือนจาก อย./สคบ. ถ้ามี"],'
    ' "recall_history": ["ประวัติเรียกคืนสินค้า ถ้ามี"],'
    ' "health_insights": "ข้อมูลเชิงสุขภาพ หรือ null",'
    ' "sources": ["แหล่งอ้างอิง"]}}'
)

_NOT_FOUND_JSON = (
    '{{"found": false, "search_method": "{method}",'
    ' "ingredients_from_web": [], "additives_from_web": [],'
    ' "label_accuracy": "ไม่พบข้อมูล", "label_vs_reference": null,'
    ' "authority_warnings": [], "recall_history": [],'
    ' "health_insights": null, "sources": []}}'
)


def _build_search_prompt_grounding(name: str, brand: str, ptype: str, ing: str) -> str:
    found = _SEARCH_JSON_TEMPLATE.format(method="google_grounding")
    nf    = _NOT_FOUND_JSON.format(method="google_grounding")
    return (
        f"ค้นหาข้อมูลผลิตภัณฑ์นี้จากเว็บ:\n"
        f"ชื่อสินค้า: {name}\nยี่ห้อ: {brand}\nประเภท: {ptype}\n"
        f"ส่วนผสมที่อ่านได้จากภาพ: {ing}\n\n"
        f"ค้นหาส่วนประกอบทั้งหมด รวมถึงวัตถุเจือปน คำเตือน ประวัติการเรียกคืนสินค้า\n"
        f"ตอบเป็น JSON เท่านั้น รูปแบบ: {found}\n"
        f"ถ้าไม่พบข้อมูล: {nf}"
    )


def _build_search_prompt_ddg(name: str, brand: str, ing: str, web: str) -> str:
    found = _SEARCH_JSON_TEMPLATE.format(method="duckduckgo")
    return (
        f"วิเคราะห์ผลการค้นหาเหล่านี้:\n"
        f"สินค้า: {name} โดย {brand}\n"
        f"ส่วนผสมที่อ่านได้จากภาพ: {ing}\n\n"
        f"ผลการค้นหา:\n{web}\n\n"
        f"ตอบเป็น JSON เท่านั้น รูปแบบ: {found}"
    )


def _build_search_prompt_knowledge(name: str, brand: str, ing: str) -> str:
    found = _SEARCH_JSON_TEMPLATE.format(method="gemini_knowledge")
    nf    = _NOT_FOUND_JSON.format(method="gemini_knowledge")
    return (
        f"คุณรู้จักผลิตภัณฑ์นี้ไหม: {name} โดย {brand}\n\n"
        f"ถ้ารู้จัก บอกข้อมูลจาก training data:\n"
        f"- ส่วนประกอบทั้งหมด (ingredients_from_web)\n"
        f"- วัตถุเจือปน / E-number (additives_from_web)\n"
        f"- คำเตือน สารก่อภูมิแพ้ กลุ่มที่ควรระวัง (authority_warnings)\n"
        f"- ข้อมูลเชิงสุขภาพ (health_insights)\n\n"
        f"ส่วนผสมที่อ่านได้จากภาพ (อาจไม่ครบ): {ing}\n\n"
        f"ตอบเป็น JSON เท่านั้น รูปแบบ: {found}\n"
        f"ถ้าไม่รู้จัก: {nf}"
    )


def _parse_json(text: str) -> dict | None:
    text = text.strip()
    start = text.find("{")
    end   = text.rfind("}") + 1
    if start == -1 or end <= start:
        return None
    try:
        return json.loads(text[start:end])
    except json.JSONDecodeError:
        return None


async def _ddg_search(query: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as http:
            r = await http.get(
                "https://api.duckduckgo.com/",
                params={"q": query, "format": "json", "no_redirect": "1", "no_html": "1"},
                headers={"User-Agent": "Mozilla/5.0 KinLoei/1.0"},
            )
            if r.status_code == 200:
                d = r.json()
                parts = []
                if d.get("AbstractText"):
                    parts.append(f"Abstract: {d['AbstractText']} ({d.get('AbstractSource','')})")
                for t in (d.get("RelatedTopics") or [])[:5]:
                    if isinstance(t, dict) and t.get("Text"):
                        parts.append(f"- {t['Text']}")
                if parts:
                    return "\n".join(parts)
    except Exception as e:
        logger.warning("[DDG] failed: %.80s", str(e))
    return None


async def _call_gemini_text(prompt: str, use_grounding: bool = False) -> dict | None:
    models = _SEARCH_GROUNDING_MODELS if use_grounding else MODELS
    for model_name in models:
        try:
            cfg = types.GenerateContentConfig(temperature=0.1)
            if use_grounding:
                cfg = types.GenerateContentConfig(
                    tools=[types.Tool(google_search=types.GoogleSearch())],
                    temperature=0.1,
                )
            else:
                cfg = types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1,
                )
            resp = await client.aio.models.generate_content(
                model=model_name, contents=prompt, config=cfg,
            )
            data = _parse_json(resp.text)
            if data:
                logger.info("[Search] OK via %s (grounding=%s)", model_name, use_grounding)
                return data
        except Exception as e:
            logger.warning("[Search] %s failed: %.100s", model_name, str(e))
            continue
    return None


async def search_product_info(
    product_name: str,
    brand: str,
    product_type: str,
    ingredients: list[str],
) -> dict | None:
    if not product_name or product_name.lower() in ("unknown", "ไม่ทราบ", ""):
        return None

    b   = brand or "ไม่ระบุ"
    pt  = product_type or "ไม่ระบุ"
    ing = ", ".join(ingredients[:20]) if ingredients else "ไม่ระบุ (อ่านจากภาพไม่ชัด)"

    # Pass 1 — Google Search Grounding
    logger.info("[Search] Pass1 grounding: %s", product_name)
    data = await _call_gemini_text(
        _build_search_prompt_grounding(product_name, b, pt, ing),
        use_grounding=True,
    )
    if data:
        return data

    # Pass 2 — DuckDuckGo Instant Answer → Gemini
    logger.info("[Search] Pass2 DDG: %s", product_name)
    web = await _ddg_search(f"{product_name} {b} ingredients warnings")
    if not web:
        web = await _ddg_search(f"{product_name} {b} ส่วนประกอบ")
    if web:
        data = await _call_gemini_text(
            _build_search_prompt_ddg(product_name, b, ing, web),
        )
        if data:
            return data

    # Pass 3 — Gemini knowledge (training data recall)
    logger.info("[Search] Pass3 Gemini knowledge: %s", product_name)
    data = await _call_gemini_text(
        _build_search_prompt_knowledge(product_name, b, ing),
    )
    if data:
        return data

    logger.info("[Search] all passes exhausted for: %s", product_name)
    return None


def _build_profile_text(profile: dict) -> str:
    lines = ["โปรไฟล์สุขภาพของผู้ใช้:"]
    if profile.get("conditions"):
        lines.append(f"- โรคประจำตัว: {', '.join(profile['conditions'])}")
    if profile.get("allergies"):
        lines.append(f"- อาหารที่แพ้: {', '.join(profile['allergies'])}")
    if profile.get("avoid_ingredients"):
        lines.append(f"- ส่วนผสมที่ต้องเลี่ยง: {', '.join(profile['avoid_ingredients'])}")
    if profile.get("notes"):
        lines.append(f"- หมายเหตุ: {profile['notes']}")
    if len(lines) == 1:
        lines.append("- ไม่มีข้อมูลสุขภาพพิเศษ")
    return "\n".join(lines)
