from typing import List, Optional, Union, Any
from pydantic import AnyHttpUrl, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str
    BACKEND_CORS_ORIGINS: List[str] = []

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        return v

    POSTGRES_SERVER: str
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    SQLALCHEMY_DATABASE_URI: Optional[str] = None
    SUPABASE_URL: Optional[str] = None
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None
    SUPABASE_STORAGE_BUCKET: str = "profile-images"
    RESEND_API_KEY: Optional[str] = None
    EMAIL_FROM: str = "Dress Live <no-reply@dresslive.app>"

    LIVEKIT_URL: Optional[str] = None
    LIVEKIT_API_KEY: Optional[str] = None
    LIVEKIT_API_SECRET: Optional[str] = None
    # Access token TTL for video rooms (minutes). Fittings often run 30–60+ minutes.
    LIVEKIT_TOKEN_TTL_MINUTES: int = 90

    RUNPOD_API_KEY: Optional[str] = None
    RUNPOD_TRYON_ENDPOINT_ID: Optional[str] = None
    RUNPOD_TRYON_TIMEOUT_SECONDS: int = 90

    @model_validator(mode="after")
    def assemble_db_connection(self) -> "Settings":
        # Some deployments accidentally set SUPABASE_URL to a Postgres connection string.
        # Normalize it back to the expected HTTPS Supabase project URL.
        if self.SUPABASE_URL and isinstance(self.SUPABASE_URL, str) and self.SUPABASE_URL.startswith("postgres"):
            if self.POSTGRES_SERVER.endswith(".supabase.co"):
                self.SUPABASE_URL = f"https://{self.POSTGRES_SERVER.split('.', 1)[0]}.supabase.co"

        if self.SQLALCHEMY_DATABASE_URI:
            if not self.SUPABASE_URL and self.POSTGRES_SERVER.endswith(".supabase.co"):
                self.SUPABASE_URL = f"https://{self.POSTGRES_SERVER.split('.', 1)[0]}.supabase.co"
            return self

        self.SQLALCHEMY_DATABASE_URI = f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}/{self.POSTGRES_DB}"
        if not self.SUPABASE_URL and self.POSTGRES_SERVER.endswith(".supabase.co"):
            self.SUPABASE_URL = f"https://{self.POSTGRES_SERVER.split('.', 1)[0]}.supabase.co"
        return self

    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8  # 8 days

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()
