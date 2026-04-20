from fastapi import FastAPI
from sqlalchemy import text
from starlette.middleware.cors import CORSMiddleware

from app.api.v1.api import api_router
from app.core.config import settings
from app.db.base import Base
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
def ensure_boutique_visibility_column() -> None:
    # Lightweight schema guard for local/dev environments without migrations.
    Base.metadata.create_all(bind=engine)
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

