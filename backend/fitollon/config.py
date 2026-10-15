from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/.env, wherever the command is run from. On Vercel there is no file; real env vars are used.
ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore", protected_namespaces=())

    database_url: str = "postgresql://fitollon:fitollon@localhost:5433/fitollon"

    # Login for the web app (single user) and the signing key for its session cookie.
    app_password: str = ""
    session_secret: str = ""
    cookie_secure: bool = True

    # Shared secret that Health Auto Export sends as "Authorization: Bearer <token>".
    ingest_token: str = ""

    # Your local timezone, used to decide what "today" means.
    timezone: str = "UTC"

    # AI model. Strands makes the provider swappable: "openai" or "anthropic".
    model_provider: Literal["openai", "anthropic"] = "openai"
    model_id: str = ""
    model_params: dict[str, Any] = Field(default_factory=dict)
    openai_api_key: str = ""
    anthropic_api_key: str = ""

    @property
    def sqlalchemy_url(self) -> str:
        url = self.database_url
        for prefix in ("postgresql://", "postgres://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix) :]
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
