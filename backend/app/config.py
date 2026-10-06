from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables (e.g. DATABASE_PATH)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_path: str = "./data/signal.db"
    upload_dir: str = "./data/uploads"
    cors_origins: list[str] = ["http://localhost:3000"]
    signing_secret: str = "dev-secret-change-me"
    mock_otp: str = "123456"
    seed_on_empty: bool = True
    ws_idle_timeout_seconds: float = 60
    ws_auth_timeout_seconds: float = 5
