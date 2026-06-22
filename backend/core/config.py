from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    gemini_api_key: str
    gemini_model: str = "gemini-2.5-flash"

    postgres_db: str = "kinloei"
    postgres_user: str = "kinloei"
    postgres_password: str
    db_host: str = "db"
    db_port: int = 5432

    secret_key: str
    allowed_origins: str = "http://localhost:3000"

    # Admin dashboard credentials
    admin_user: str = "admin"
    admin_password: str = "changeme"

    # Arduino App Lab board URL (port 7000); set ARDUINO_BOARD_URL in .env to override
    arduino_board_url: str = "http://192.168.50.137:7000"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.db_host}:{self.db_port}/{self.postgres_db}"
        )

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
