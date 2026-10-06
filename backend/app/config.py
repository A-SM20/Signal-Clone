import json
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables (e.g. DATABASE_PATH)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_path: str = "./data/signal.db"
    upload_dir: str = "./data/uploads"
    # Env value may be a JSON list or a comma-separated string.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    signing_secret: str = "dev-secret-change-me"
    mock_otp: str = "123456"
    seed_on_empty: bool = True
    sweepers_enabled: bool = True
    ws_idle_timeout_seconds: float = 60
    ws_auth_timeout_seconds: float = 5

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value):
        if isinstance(value, str):
            value = value.strip()
            if value.startswith("["):
                return json.loads(value)
            return [part.strip() for part in value.split(",") if part.strip()]
        return value
