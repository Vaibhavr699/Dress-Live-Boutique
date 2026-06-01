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

    # Railway / Heroku often expose a single DATABASE_URL. Supabase also works
    # when pasted as DATABASE_URL instead of the four POSTGRES_* fields below.
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
    # Access token TTL for video rooms (minutes). Fittings often run 30–60+ minutes.
    LIVEKIT_TOKEN_TTL_MINUTES: int = 90

    # Public base URL of the Next.js bride web-call app. Used to build the
    # tokenized link sent in confirmation/reminder emails:
    #   {WEB_CALL_BASE_URL}/call/{booking_id}?token=<JWT>
    # Empty in dev = no link is added to emails (RN flow keeps working).
    WEB_CALL_BASE_URL: Optional[str] = None

    # LiveKit signs webhook requests with the same API key/secret as room
    # tokens. The receiver verifies the Authorization header — no extra
    # secret needed. Override per-host only if you split LiveKit projects.

    FASHN_API_KEY: Optional[str] = None
    FASHN_TIMEOUT_SECONDS: int = 120

    # ── Decart realtime VTON (Lucy 2.1) ──────────────────────────────────
    # Server-side only. `DECART_API_KEY` is the long-lived `dct_*` / `sk_*`
    # secret used to mint short-lived per-session client tokens (`ek_*`)
    # that the browser/RN client then hands to Decart's realtime SDK.
    # Never ship `DECART_API_KEY` to a client.
    DECART_API_KEY: Optional[str] = None
    DECART_REALTIME_MODEL: str = "lucy-2.1-vton"
    DECART_API_BASE: str = "https://api.decart.ai/v1"
    # TTL for the per-session client token. Decart hard-caps `expiresIn`
    # at 3600s (1 hour) — values above will 400. This only needs to last
    # long enough for the bride to JOIN; once the realtime SDK has
    # connected, session duration is governed by `maxSessionDuration`
    # below, not by token TTL. Bride pulls a fresh one each click of Join.
    DECART_CLIENT_TOKEN_TTL_MINUTES: int = 60
    # Hard cap for one realtime session, in seconds. Decart enforces this
    # server-side via `constraints.realtime.maxSessionDuration` — even if
    # the room never finishes, Decart will close the stream at this limit.
    DECART_MAX_SESSION_SECONDS: int = 60 * 90  # 90 min
    # Daily USD ceiling across ALL Decart sessions. Once today's estimated
    # spend reaches this, new sessions are refused until UTC midnight.
    # Set 0 to disable the cap.
    DECART_DAILY_BUDGET_USD: float = 100.0
    # Per-booking session-second cap so one runaway client can't drain
    # the daily budget alone. 0 disables.
    DECART_PER_BOOKING_SECONDS_LIMIT: int = 60 * 90  # 90 min
    # Estimated active-render cost ($/s) used by the budget tracker. The
    # actual figure comes from Decart's billing page — tune after first
    # invoices land. Lucy 2.1 VTON pay-as-you-go is roughly $0.02/s.
    DECART_COST_PER_SECOND_USD: float = 0.02

    BODYGRAM_API_KEY: Optional[str] = None
    BODYGRAM_ORG_ID: Optional[str] = None

    # ── Stripe (Connect marketplace) ─────────────────────────────────────
    # Test mode for now. Buyer pays via PaymentSheet → PaymentIntent with
    # transfer_data.destination=boutique.stripe_account_id; platform keeps
    # `PLATFORM_FEE_BPS` basis points as application_fee_amount.
    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_PUBLISHABLE_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None
    # Basis points the platform keeps from each order. 500 = 5%.
    PLATFORM_FEE_BPS: int = 500
    STRIPE_CURRENCY: str = "eur"
    # URLs Stripe redirects the partner back to after Connect onboarding.
    # Stripe rejects custom deep-link schemes for AccountLink, so we point
    # at https landing pages on this backend (see app/main.py) which then
    # best-effort deep-link into the boutique-app via the custom scheme.
    # Override per-environment if the API ever moves domains.
    STRIPE_CONNECT_RETURN_URL: str = (
        "https://dress-live-boutique-production.up.railway.app/stripe-return"
    )
    STRIPE_CONNECT_REFRESH_URL: str = (
        "https://dress-live-boutique-production.up.railway.app/stripe-refresh"
    )

    # ── Stripe Billing (partner subscriptions) ───────────────────────────
    # Recurring Price ids minted in the Stripe dashboard (one per plan).
    # The signup wizard's plan picker maps `monthly|annual` → these.
    # If unset, /partners/subscription/checkout 500s with a clear error.
    STRIPE_PRICE_MONTHLY: Optional[str] = None
    STRIPE_PRICE_ANNUAL: Optional[str] = None

    # Testing-only: skip partner subscription gating everywhere. When True,
    # require_active_subscription() waves every partner through and the
    # /subscription/status endpoint reports "active", so the apps behave as
    # if subscribed (no 402, no /subscribe bounce). MUST stay False in prod.
    SUBSCRIPTION_BYPASS: bool = False

    # ── RunPod GPU inference ─────────────────────────────────────────────
    # Off by default so a misconfigured deploy can't burn credits. Flip
    # RUNPOD_ENABLED=true only after the budget guard has been verified.
    RUNPOD_ENABLED: bool = False
    RUNPOD_API_KEY: Optional[str] = None
    RUNPOD_ENDPOINT_ID: Optional[str] = None
    # Hard daily ceiling. Once today's estimated spend reaches this, the
    # backend refuses further RunPod calls until UTC midnight and falls
    # back to the free OpenCV path. Set 0 to disable the daily cap.
    RUNPOD_DAILY_BUDGET_USD: float = 2.0
    # Per-video-call cap so one runaway client can't drain the daily
    # budget alone. 0 disables.
    RUNPOD_PER_BOOKING_CALL_LIMIT: int = 30
    # Estimated cost we attribute to each successful RunPod invocation.
    # Used only by the budget tracker — we don't bill users; update if
    # you switch GPU tier or model. CatVTON on RTX 4090 ≈ $0.002/call
    # blended (warm + cold).
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

        # Some deployments accidentally set SUPABASE_URL to a Postgres connection string.
        # Normalize it back to the expected HTTPS Supabase project URL.
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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8  # 8 days

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
