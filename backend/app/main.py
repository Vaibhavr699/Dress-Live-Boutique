from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from sqlalchemy import text
from starlette.middleware.cors import CORSMiddleware

from app.api.v1.api import api_router
from app.core.config import settings
from app.db.session import engine

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"/api/v1/openapi.json"
)

# Set all CORS enabled origins
if settings.BACKEND_CORS_ORIGINS:
    allow_origins = [str(origin) for origin in settings.BACKEND_CORS_ORIGINS]
    # If wildcard is present, disable credentials so browsers accept `Access-Control-Allow-Origin: *`.
    # We use Bearer tokens (not cookies), so credentials are not required.
    allow_credentials = "*" not in allow_origins
    if "*" in allow_origins:
        allow_origins = ["*"]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    print(f"INFO:     CORS enabled for: {settings.BACKEND_CORS_ORIGINS}")
else:
    print("INFO:     No CORS origins set, middleware skipped.")

app.include_router(api_router, prefix="/api/v1")

@app.on_event("startup")
def backfill_legacy_columns() -> None:
    """Idempotent ALTER TABLEs for columns that predate proper Alembic
    migrations on this codebase. Safe to run every boot — each one is
    `IF NOT EXISTS`. New schema changes should go through Alembic instead;
    this hook is just patching old deployments that were created before
    those columns existed.

    Previously this also called `Base.metadata.create_all(bind=engine)`,
    which silently CREATE-TABLE'd new models on boot. That conflicted with
    Alembic — booting uvicorn before `alembic upgrade head` would create
    the tables, then the migration would fail with "relation already
    exists". Removed; run `alembic upgrade head` to create new tables.
    """
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                ALTER TABLE boutique
                ADD COLUMN IF NOT EXISTS is_visible_to_customers BOOLEAN NOT NULL DEFAULT TRUE
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE "user"
                ADD COLUMN IF NOT EXISTS role VARCHAR NOT NULL DEFAULT 'buyer'
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE "user"
                ADD COLUMN IF NOT EXISTS boutique_id INTEGER NULL
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE "user"
                ADD COLUMN IF NOT EXISTS profile_image_url VARCHAR NULL
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE "user"
                ADD COLUMN IF NOT EXISTS password_otp_hash VARCHAR NULL
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE "user"
                ADD COLUMN IF NOT EXISTS password_otp_expires_at VARCHAR NULL
                """
            )
        )

@app.get("/")
async def root():
    return {"message": "Welcome to the Boutique Portal API. Visit /docs for documentation."}


# ── Stripe Connect onboarding return pages ───────────────────────────────
# Stripe AccountLink rejects custom deep-link schemes (`dress-live-partner://`),
# so we host two https landing pages here. They (a) best-effort deep-link
# back to the boutique-app via the custom scheme, and (b) show a clear
# "you're done, return to the app" message if the deep-link fails (desktop
# browser, app uninstalled, etc.). The boutique-app's earning-wallet polls
# subscription/connect status on focus, so the partner sees their updated
# state the moment they manually re-open the app even if the deep-link
# never fires.

_RETURN_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="1; url=dress-live-partner://stripe-return">
<title>Connected · Dress Live Partner</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #ffffff; color: #1a1a1a; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 40px; }
  .card { max-width: 360px; text-align: center; }
  h1 { font-weight: 400; font-size: 22px; letter-spacing: 1.5px; text-transform: uppercase; margin: 0 0 12px; }
  p { color: #6b6b6b; font-size: 14px; line-height: 22px; margin: 0 0 24px; }
  a.btn { display: inline-block; background: #1a1a1a; color: #ffffff; padding: 14px 28px; text-decoration: none; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; }
</style>
</head>
<body>
  <div class="card">
    <h1>You're connected</h1>
    <p>Your Stripe account is set up. Return to Dress Live Partner to start accepting orders.</p>
    <a class="btn" href="dress-live-partner://stripe-return">Open Dress Live Partner</a>
  </div>
</body>
</html>"""

_REFRESH_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="1; url=dress-live-partner://stripe-refresh">
<title>Re-open the app · Dress Live Partner</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #ffffff; color: #1a1a1a; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 40px; }
  .card { max-width: 360px; text-align: center; }
  h1 { font-weight: 400; font-size: 22px; letter-spacing: 1.5px; text-transform: uppercase; margin: 0 0 12px; }
  p { color: #6b6b6b; font-size: 14px; line-height: 22px; margin: 0 0 24px; }
  a.btn { display: inline-block; background: #1a1a1a; color: #ffffff; padding: 14px 28px; text-decoration: none; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; }
</style>
</head>
<body>
  <div class="card">
    <h1>Your link expired</h1>
    <p>Open Dress Live Partner and tap Connect with Stripe again to start a fresh onboarding session.</p>
    <a class="btn" href="dress-live-partner://stripe-refresh">Open Dress Live Partner</a>
  </div>
</body>
</html>"""


@app.get("/stripe-return", response_class=HTMLResponse)
async def stripe_connect_return() -> str:
    return _RETURN_HTML


@app.get("/stripe-refresh", response_class=HTMLResponse)
async def stripe_connect_refresh() -> str:
    return _REFRESH_HTML

