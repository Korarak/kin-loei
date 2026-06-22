from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text, select, func
from core.config import settings

engine = create_async_engine(settings.database_url, echo=False, pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Idempotent migration: add auth columns to existing users table
        for stmt in [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(16) NOT NULL DEFAULT 'user'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ",
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users(email) WHERE email IS NOT NULL",
        ]:
            await conn.execute(text(stmt))


async def seed_dev_users():
    """Pre-populate mock users so the admin dashboard is not empty on first run."""
    from core.models import User, Scan
    from core.auth import hash_password

    async with AsyncSessionLocal() as db:
        count = await db.scalar(select(func.count(User.id)))
        if count and count >= 5:
            return

        now = datetime.utcnow()
        mock_users = [
            User(
                device_id="seed-001-somchai-dev2026",
                email="somchai.j@gmail.com",
                password_hash=hash_password("test1234"),
                display_name="สมชาย ใจดี",
                role="user",
                is_active=True,
                health_profile={
                    "conditions": ["เบาหวาน", "ความดันโลหิตสูง"],
                    "allergies": ["กุ้ง", "ถั่วลิสง"],
                    "avoid_ingredients": ["น้ำตาล", "เกลือสูง", "ผงชูรส"],
                    "notes": "แพ้กุ้งรุนแรงมาก ระวังด้วย",
                },
                last_login_at=now - timedelta(hours=2),
                created_at=now - timedelta(days=30),
            ),
            User(
                device_id="seed-002-somying-dev2026",
                email="somying.d@hotmail.com",
                password_hash=hash_password("test1234"),
                display_name="สมหญิง ดีใจ",
                role="user",
                is_active=True,
                health_profile={
                    "conditions": ["ไขมันในเลือดสูง"],
                    "allergies": ["นมวัว", "แลคโตส"],
                    "avoid_ingredients": ["ไขมันทรานส์", "ครีม"],
                    "notes": "",
                },
                last_login_at=now - timedelta(days=1),
                created_at=now - timedelta(days=22),
            ),
            User(
                device_id="seed-003-device-only-dev2026",
                email=None,
                password_hash=None,
                display_name=None,
                role="user",
                is_active=True,
                health_profile={},
                last_login_at=now - timedelta(days=3),
                created_at=now - timedelta(days=15),
            ),
            User(
                device_id="seed-004-prasert-dev2026",
                email="prasert.m@yahoo.co.th",
                password_hash=hash_password("test1234"),
                display_name="ประเสริฐ มานะ",
                role="user",
                is_active=False,
                health_profile={
                    "conditions": ["โรคหัวใจ", "เบาหวาน"],
                    "allergies": ["แป้งสาลี"],
                    "avoid_ingredients": ["กลูเตน", "แป้งขาว"],
                    "notes": "ตรวจฉลากทุกครั้งก่อนรับประทาน",
                },
                last_login_at=now - timedelta(days=10),
                created_at=now - timedelta(days=60),
            ),
            User(
                device_id="seed-005-nongna-dev2026",
                email="nongna.bkk@gmail.com",
                password_hash=hash_password("test1234"),
                display_name="น้องนา กรุงเทพ",
                role="user",
                is_active=True,
                health_profile={
                    "conditions": [],
                    "allergies": ["ไข่"],
                    "avoid_ingredients": ["MSG", "สีผสมอาหาร", "วัตถุกันเสีย"],
                    "notes": "ลูกแพ้ไข่ตั้งแต่เด็ก",
                },
                last_login_at=now - timedelta(minutes=30),
                created_at=now - timedelta(days=7),
            ),
        ]

        for u in mock_users:
            db.add(u)
        await db.flush()

        mock_scans = [
            Scan(
                user_id=mock_users[0].id,
                product_name="มาม่าไก่",
                status="CAUTION",
                result={
                    "status": "CAUTION",
                    "summary": "มีโซเดียมสูงมาก 1,380mg ต่อซอง ควรระวังสำหรับผู้ป่วยความดันโลหิตสูง",
                    "flagged_items": ["โซเดียมสูง 1,380mg", "ผงชูรส"],
                },
                text_input="บะหมี่กึ่งสำเร็จรูป รสไก่",
                created_at=now - timedelta(hours=3),
            ),
            Scan(
                user_id=mock_users[0].id,
                product_name="ข้าวกล้องหุงสุก",
                status="SAFE",
                result={
                    "status": "SAFE",
                    "summary": "ปลอดภัยสำหรับผู้ป่วยเบาหวาน ดัชนีน้ำตาลต่ำ ไม่มีน้ำตาลเพิ่ม",
                    "flagged_items": [],
                },
                text_input="ข้าวกล้อง 100% ไม่มีสารปรุงแต่ง",
                created_at=now - timedelta(hours=5),
            ),
            Scan(
                user_id=mock_users[1].id,
                product_name="นม Maize ข้าวโพด",
                status="AVOID",
                result={
                    "status": "AVOID",
                    "summary": "พบส่วนผสมของนมวัวและครีม อาจก่อให้เกิดอาการแพ้รุนแรง",
                    "flagged_items": ["นมวัว", "ครีม", "แลคโตส"],
                },
                text_input="นมข้าวโพด ส่วนผสม: ข้าวโพด นม ครีม น้ำตาล เกลือ",
                created_at=now - timedelta(days=1),
            ),
            Scan(
                user_id=mock_users[4].id,
                product_name="ขนมปังแซนด์วิช",
                status="AVOID",
                result={
                    "status": "AVOID",
                    "summary": "มีส่วนผสมของไข่ทั้งในแป้งและไส้ครีม ไม่เหมาะสำหรับผู้แพ้ไข่",
                    "flagged_items": ["ไข่ไก่", "ไข่แดง"],
                },
                text_input="ขนมปังแซนด์วิชไส้ครีม",
                created_at=now - timedelta(minutes=45),
            ),
            Scan(
                user_id=mock_users[4].id,
                product_name="ข้าวโพดอบกรอบ",
                status="SAFE",
                result={
                    "status": "SAFE",
                    "summary": "ไม่พบสารก่อภูมิแพ้ที่เกี่ยวข้อง ปลอดภัยสำหรับผู้แพ้ไข่",
                    "flagged_items": [],
                },
                text_input="ข้าวโพดอบเนย ส่วนผสม: ข้าวโพด เนย เกลือ",
                created_at=now - timedelta(hours=1),
            ),
        ]

        for s in mock_scans:
            db.add(s)

        await db.commit()
