import base64
import json
import logging
from google import genai
from google.genai import types
from core.config import settings  # still needed for gemini_api_key

logger = logging.getLogger(__name__)

client = genai.Client(api_key=settings.gemini_api_key)

# Fallback chain — ตรงตามสูตร TS OCR reference
# skip to next model เฉพาะ quota (429) หรือ server error (5xx) เท่านั้น
MODELS = [
    "gemini-3-flash-preview",
    "gemini-2.5-flash-preview-05-20",
    "gemini-2.5-flash-preview",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
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
- ถ้าภาพไม่ชัดหรืออ่านไม่ได้ ให้ summary = "อ่านไม่ชัด กรุณาถ่ายใหม่" และ status = "CAUTION"
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
