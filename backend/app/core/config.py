from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/.env, found no matter which folder the server is started from
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/dynamic_forms"
    frontend_origin: str = "http://localhost:5173"

    # Auth (JWT)
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 10
    refresh_token_expire_days: int = 7
    # Send the refresh-token cookie over HTTPS only. Keep false for local http://localhost
    cookie_secure: bool = False
    # Role given to new sign-ups (admin, investigator, reviewer)
    default_user_role: str = "investigator"

    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")


settings = Settings()
