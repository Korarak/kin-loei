import base64
from google import genai
from google.genai import types
from core.config import settings

client = genai.Client(api_key=settings.gemini_api_key)

SYSTEM_PROMPT = """คุณคือผู้ช่วย "กินเลย" ผู้เชี่ยวชาญการอ่านฉลากอาหารและระบุส่วนประกอบผลิตภัณฑ์

ขั้นตอนการวิเคราะห์:
1. ระบุสินค้า: ชื่อ ยี่ห้อ และประเภทผลิตภัณฑ์
2. อ่านส่วนประกอบ/วัตถุดิบ: สกัดรายการส่วนผสมทั้งหมดจากฉลากให้ครบถ้วน รวมถึงวัตถุเจือปน สารปรุงแต่ง สารกันบูด สารให้ความหวาน และรหัส E-number
3. ตรวจสอบคำเตือนบนฉลาก: เช่น "มีถั่ว" "ผลิตในโรงงานที่ใช้กลูเตน" ฯลฯ
4. ประเมินความปลอดภัย: เทียบส่วนประกอบกับโปรไฟล์สุขภาพผู้ใช้ ให้ผล SAFE / CAUTION / AVOID
5. สรุปเหตุผลเป็นภาษาไทยที่เข้าใจง่าย

กฎสำคัญ:
- อ่านส่วนผสมให้ครบทุกรายการ อย่าข้ามแม้จะดูทั่วไป
- ถ้าภาพไม่ชัดหรืออ่านไม่ได้ ให้ระบุว่า "อ่านไม่ชัด" ไม่ต้องคาดเดา
- ให้ข้อมูลและเตือนเท่านั้น ไม่วินิจฉัยโรค

ตอบเป็น JSON ตามรูปแบบที่กำหนดเท่านั้น"""

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

    response = await client.aio.models.generate_content(
        model=settings.gemini_model,
        contents=[types.Content(role="user", parts=parts)],
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema=RESPONSE_SCHEMA,
            temperature=0.1,
        ),
    )

    import json
    return json.loads(response.text)


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
