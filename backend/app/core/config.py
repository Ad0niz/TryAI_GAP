from functools import lru_cache
from typing import List
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("dev_settings.txt", ".env"),  # later files override earlier ones
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_env: str = "dev"
    api_v1_prefix: str = "/api/v1"
    cors_origins: str = "http://localhost:5173"
    log_level: str = "INFO"
    web_app_url: str = "http://localhost:5173"

    # Security
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_ttl_min: int = 15
    refresh_token_ttl_days: int = 30
    magic_link_ttl_min: int = 15
    delegation_ttl_hours: int = 72

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/aiassessment"

    # Freemium
    free_maturity_limit: int = 5

    # Azure Blob
    azure_storage_connection_string: str = ""
    azure_storage_container: str = "evidence"
    local_storage_dir: str = "./_storage"

    # ACS email
    acs_connection_string: str = ""
    acs_sender_address: str = "DoNotReply@yourbrand.example"

    # Stripe
    stripe_secret_key: str = "sk_test_xxx"
    stripe_webhook_secret: str = "whsec_xxx"
    stripe_success_url: str = "http://localhost:5173/payment/success"
    stripe_cancel_url: str = "http://localhost:5173/estimator"

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_dev(self) -> bool:
        return self.app_env.lower() in ("dev", "local", "development")

    @property
    def sync_database_url(self) -> str:
        """Sync URL for Alembic (psycopg for Postgres; sqlite passes through)."""
        url = self.database_url
        if "+asyncpg" in url:
            return url.replace("+asyncpg", "+psycopg")
        if "+aiosqlite" in url:
            return url.replace("+aiosqlite", "")
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
