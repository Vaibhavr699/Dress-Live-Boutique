from fastapi import FastAPI
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

