from typing import List, Optional, Union
from urllib.parse import urlparse

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _postgres_host_from_uri(uri: str) -> Optional[str]:
    normalized = uri.replace("postgresql+psycopg2://", "postgresql://", 1)
    return urlparse(normalized).hostname


class Settings(BaseSettings):
    PROJECT_NAME: str = "Dress Live Boutique API"
    BACKEND_CORS_ORIGINS: List[str] = []

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        return v

    POSTGRES_SERVER: Optional[str] = None
    POSTGRES_USER: Optional[str] = None
    POSTGRES_PASSWORD: Optional[str] = None
    POSTGRES_DB: Optional[str] = None
    DATABASE_URL: Optional[str] = None
    SQLALCHEMY_DATABASE_URI: Optional[str] = None
    SUPABASE_URL: Optional[str] = None
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None
    SUPABASE_STORAGE_BUCKET: str = "profile-images"
    RESEND_API_KEY: Optional[str] = None
    EMAIL_FROM: str = "Dress Live <no-reply@dresslive.app>"

    LIVEKIT_URL: Optional[str] = None
    LIVEKIT_API_KEY: Optional[str] = None
    LIVEKIT_API_SECRET: Optional[str] = None
    LIVEKIT_TOKEN_TTL_MINUTES: int = 90

    WEB_CALL_BASE_URL: Optional[str] = None

    APP_PUBLIC_BASE_URL: str = (
        "https://dress-live-boutique-production.up.railway.app"
    )
    TEAM_INVITE_TTL_DAYS: int = 7

    FASHN_API_KEY: Optional[str] = None
    FASHN_TIMEOUT_SECONDS: int = 120
    FASHN_WEBHOOK_SECRET: Optional[str] = None

    FAL_API_KEY: Optional[str] = None
    FAL_WEBHOOK_SECRET: Optional[str] = None
    BACKEND_PUBLIC_URL: Optional[str] = None

    GEMINI_API_KEY: Optional[str] = None
    GEMINI_QA_MODEL: str = "gemini-2.5-flash"

    OPENAI_API_KEY: Optional[str] = None
    OPENAI_IMAGE_MODEL: str = "gpt-image-2"
    OPENAI_IMAGE_QUALITY: str = "high"
    OPENAI_IMAGE_SIZE: str = "1024x1536"  # portrait — full-body bridal; avoid square crop
    OPENAI_TIMEOUT_SECONDS: int = 0  # 0 = no timeout (gpt-image-2 high can run several min)
    # "Be the copilot": expand the locked try-on prompt with a per-dress visual
    # description (vision model) before the edit, mirroring the ChatGPT website's
    # hidden prompt-rewriter. OPENAI_PROMPT_MODEL must be vision-capable.
    OPENAI_TRYON_EXPAND_PROMPT: bool = True
    OPENAI_PROMPT_MODEL: str = "gpt-4.1"
    QA_DRESS_THRESHOLD: int = 75
    TRYON_MAX_REGEN: int = 2

    DECART_API_KEY: Optional[str] = None
    DECART_REALTIME_MODEL: str = "lucy-2.1-vton"
    DECART_API_BASE: str = "https://api.decart.ai/v1"
    DECART_CLIENT_TOKEN_TTL_MINUTES: int = 60
    DECART_MAX_SESSION_SECONDS: int = 60 * 25
    DECART_DAILY_BUDGET_USD: float = 100.0
    DECART_PER_BOOKING_SECONDS_LIMIT: int = 60 * 50
    DECART_COST_PER_SECOND_USD: float = 0.02

    BODYGRAM_API_KEY: Optional[str] = None
    BODYGRAM_ORG_ID: Optional[str] = None

    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_PUBLISHABLE_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None
    PLATFORM_FEE_BPS: int = 500
    STRIPE_CURRENCY: str = "eur"
    STRIPE_CONNECT_RETURN_URL: str = (
        "https://dress-live-boutique-production.up.railway.app/stripe-return"
    )
    STRIPE_CONNECT_REFRESH_URL: str = (
        "https://dress-live-boutique-production.up.railway.app/stripe-refresh"
    )

    STRIPE_PRICE_MONTHLY: Optional[str] = None
    STRIPE_PRICE_ANNUAL: Optional[str] = None

    SUBSCRIPTION_BYPASS: bool = False

    RUNPOD_ENABLED: bool = False
    RUNPOD_API_KEY: Optional[str] = None
    RUNPOD_ENDPOINT_ID: Optional[str] = None
    RUNPOD_DAILY_BUDGET_USD: float = 2.0
    RUNPOD_PER_BOOKING_CALL_LIMIT: int = 30
    RUNPOD_COST_PER_CALL_USD: float = 0.002

    @model_validator(mode="after")
    def assemble_db_connection(self) -> "Settings":
        if self.DATABASE_URL and not self.SQLALCHEMY_DATABASE_URI:
            self.SQLALCHEMY_DATABASE_URI = self.DATABASE_URL

        db_host = self.POSTGRES_SERVER or (
            _postgres_host_from_uri(self.SQLALCHEMY_DATABASE_URI)
            if self.SQLALCHEMY_DATABASE_URI
            else None
        )

        if self.SUPABASE_URL and isinstance(self.SUPABASE_URL, str) and self.SUPABASE_URL.startswith("postgres"):
            if db_host and db_host.endswith(".supabase.co"):
                self.SUPABASE_URL = f"https://{db_host.split('.', 1)[0]}.supabase.co"

        if self.SQLALCHEMY_DATABASE_URI:
            if not self.SUPABASE_URL and db_host and db_host.endswith(".supabase.co"):
                self.SUPABASE_URL = f"https://{db_host.split('.', 1)[0]}.supabase.co"
            return self

        missing = [
            name
            for name, value in (
                ("POSTGRES_SERVER", self.POSTGRES_SERVER),
                ("POSTGRES_USER", self.POSTGRES_USER),
                ("POSTGRES_PASSWORD", self.POSTGRES_PASSWORD),
                ("POSTGRES_DB", self.POSTGRES_DB),
            )
            if not value
        ]
        if missing:
            raise ValueError(
                "Set DATABASE_URL (or SQLALCHEMY_DATABASE_URI), or all of: "
                + ", ".join(missing)
            )

        self.SQLALCHEMY_DATABASE_URI = (
            f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_SERVER}/{self.POSTGRES_DB}"
        )
        if not self.SUPABASE_URL and self.POSTGRES_SERVER.endswith(".supabase.co"):
            self.SUPABASE_URL = f"https://{self.POSTGRES_SERVER.split('.', 1)[0]}.supabase.co"
        return self

    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
