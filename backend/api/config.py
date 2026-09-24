"""Validated configuration, loaded from the single .env at the repository root."""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _find_root_env() -> Path:
    """The repo root is the folder whose package.json declares npm workspaces."""
    here = Path(__file__).resolve()
    for parent in here.parents:
        pkg = parent / "package.json"
        if pkg.exists() and '"workspaces"' in pkg.read_text(encoding="utf-8"):
            return parent / ".env"
    return Path.cwd() / ".env"


ROOT_ENV = _find_root_env()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_ENV, env_file_encoding="utf-8", extra="ignore")

    NODE_ENV: str = "development"

    # Database
    DB_HOST: str
    DB_PORT: int
    DB_NAME: str
    DB_USER: str
    DB_PASSWORD: str
    DB_SCHEMA: str = "annex-hr"
    DB_SSL: bool = False
    DB_SSL_CA_PATH: str = ""
    DB_POOL_MAX: int = 4

    # API
    API_PORT: int = 8000
    APP_URL: str = "http://localhost:5173"
    CORS_ORIGINS: str = "http://localhost:5173"
    JWT_SECRET: str = Field(min_length=32)
    JWT_EXPIRES_IN: str = "7d"
    COOKIE_NAME: str = "annex_session"
    COOKIE_SECURE: bool = False

    # Demo / seed
    ENABLE_DEMO_LOGIN: bool = False
    SEED_DEFAULT_PASSWORD: str = Field(default="AnnexDemo#2026", min_length=8)

    # Email — provider "auto" tries Resend, then Brevo, then SMTP, then logs to the console.
    EMAIL_PROVIDER: str = "auto"
    EMAIL_FROM_ADDRESS: str = "noreply@annexhr.com"
    EMAIL_FROM_NAME: str = "Annex HR"
    RESEND_API_KEY: str = ""
    BREVO_API_KEY: str = ""
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""

    @field_validator("DB_SCHEMA")
    @classmethod
    def _schema(cls, v: str) -> str:
        if not re.fullmatch(r"[A-Za-z0-9_-]+", v):
            raise ValueError("DB_SCHEMA may only contain letters, digits, _ and -")
        return v

    @property
    def is_prod(self) -> bool:
        return self.NODE_ENV == "production"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def jwt_ttl_seconds(self) -> int:
        m = re.fullmatch(r"(\d+)\s*([smhd]?)", self.JWT_EXPIRES_IN.strip())
        if not m:
            return 7 * 86400
        n, unit = int(m.group(1)), m.group(2) or "s"
        return n * {"s": 1, "m": 60, "h": 3600, "d": 86400}[unit]


@lru_cache
def get_settings() -> Settings:
    try:
        return Settings()  # type: ignore[call-arg]
    except Exception as exc:  # pragma: no cover - start-up guard
        raise SystemExit(f"✖ Invalid environment configuration ({ROOT_ENV}):\n{exc}\nCopy .env.example to .env and fill it in.") from exc


settings = get_settings()
