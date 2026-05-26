import logging
from typing import Any, Optional
from datetime import datetime, timedelta
import hashlib
import secrets
import re
from urllib.parse import quote, unquote
from uuid import uuid4
import mimetypes

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.api import deps
from app.core.config import settings
from app.core.email import send_email
from app.core.email_templates import render_branded_email
from app.crud.crud_boutique import crud_boutique
from app.crud.crud_user import crud_user
from app.models.user import User
from app.schemas.boutique import BoutiqueCreate
from app.schemas.user import User as UserSchema, UserCreate, UserUpdate
from app.services import bodygram as bodygram_service

logger = logging.getLogger(__name__)

router = APIRouter()


class PasswordChangePayload(BaseModel):
    current_password: str
    new_password: str


class PasswordOtpSendPayload(BaseModel):
    email: Optional[str] = None


class PasswordOtpVerifyPayload(BaseModel):
    code: str
    new_password: str


class DeleteAccountPayload(BaseModel):
    password: str
    email: Optional[str] = None


class MeasurementScanPayload(BaseModel):
    height_cm: float
    weight_kg: float
    front_image_data_url: str
    age: int
    gender: str  # "male" | "female"
    side_image_data_url: Optional[str] = None


class MeasurementManualPayload(BaseModel):
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    bust_cm: Optional[float] = None
    waist_cm: Optional[float] = None
    hips_cm: Optional[float] = None
    shoulder_cm: Optional[float] = None
    arm_length_cm: Optional[float] = None


class PasswordResetOtpSendPayload(BaseModel):
    email: str


class PasswordResetConfirmPayload(BaseModel):
    email: str
    code: str
    new_password: str


def _ensure_supabase_storage_config() -> None:
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=500,
            detail="Supabase Storage is not configured. Add SUPABASE_SERVICE_ROLE_KEY to backend/.env.",
        )


def _build_storage_headers(content_type: Optional[str] = None) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY or "",
    }
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def _extract_storage_object_path(image_url: Optional[str]) -> Optional[str]:
    if not image_url or not settings.SUPABASE_URL:
        return None

    public_prefix = f"{settings.SUPABASE_URL}/storage/v1/object/public/{settings.SUPABASE_STORAGE_BUCKET}/"
    if not image_url.startswith(public_prefix):
        return None

    return unquote(image_url.replace(public_prefix, "", 1))


async def _delete_storage_object(image_url: Optional[str]) -> None:
    object_path = _extract_storage_object_path(image_url)
    if not object_path:
        return

    encoded_path = quote(object_path, safe="/")
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.delete(
            f"{settings.SUPABASE_URL}/storage/v1/object/{settings.SUPABASE_STORAGE_BUCKET}/{encoded_path}",
            headers=_build_storage_headers(),
        )
        if response.status_code not in (200, 204, 404):
            print(f"WARNING: Failed to delete Supabase object {object_path}: {response.text}")

# Accept BOTH `/users` and `/users/` so clients that include a trailing
# slash (the two RN apps both POST to `/users/`) don't get a 307
# redirect. The redirect was working server-side but some clients drop
# the JSON body or fail the CORS preflight on the follow-up request,
# which made signup silently 422 from the user's perspective.
@router.post("/", response_model=UserSchema, include_in_schema=False)
@router.post("", response_model=UserSchema)
async def create_user(
    request: Request,
    db: Session = Depends(deps.get_db),
) -> Any:
    """
    Create new user.
    """
    try:
        body = await request.json()
        if body.get("boutique_info") and not body.get("role"):
            body["role"] = "partner"

        if body.get("role") == "partner":
            boutique_info = body.get("boutique_info")
            if not boutique_info or not boutique_info.get("name"):
                raise HTTPException(
                    status_code=422,
                    detail="Partner registrations require boutique_info with a name.",
                )

        # Partner signup from boutique-app sends phone/address inside boutique_info only.
        # UserCreate reads top-level phone/address, so copy them before validation.
        boutique_info_raw = body.get("boutique_info")
        if isinstance(boutique_info_raw, dict):

            def _strip_str(value: Any) -> str:
                if value is None:
                    return ""
                return str(value).strip()

            if not _strip_str(body.get("phone")) and _strip_str(boutique_info_raw.get("phone")):
                body["phone"] = _strip_str(boutique_info_raw.get("phone"))
            if not _strip_str(body.get("address")) and _strip_str(boutique_info_raw.get("address")):
                body["address"] = _strip_str(boutique_info_raw.get("address"))
            if not _strip_str(boutique_info_raw.get("location")) and _strip_str(
                boutique_info_raw.get("address")
            ):
                boutique_info_raw["location"] = _strip_str(boutique_info_raw.get("address"))

        print(f"DEBUG: Parsed JSON: {body}")
        user_in = UserCreate(**body)
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raw_body = await request.body()
        print(f"DEBUG: Validation/Parsing failed.")
        print(f"DEBUG: Content-Type: {request.headers.get('content-type')}")
        print(f"DEBUG: Raw Body: {raw_body}")
        raise HTTPException(status_code=422, detail=str(e))

    user = crud_user.get_by_email(db, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this username already exists in the system.",
        )

    if user_in.role == "partner" and user_in.boutique_info:
        boutique = crud_boutique.create(
            db,
            obj_in=BoutiqueCreate(
                name=user_in.boutique_info.name,
                description=user_in.boutique_info.description,
                location=user_in.boutique_info.location,
            ),
        )
        user_in.boutique_id = boutique.id

    user = crud_user.create(db, obj_in=user_in)

    # Send a welcome email (best-effort).
    try:
        if user.email:
            greeting_name = (user.full_name or "").strip().split()[0] if user.full_name else "there"
            role = (user.role or "").strip().lower()

            if role == "partner":
                boutique_name = ""
                if user_in.boutique_info:
                    boutique_name = user_in.boutique_info.name or ""
                await send_email(
                    to_email=user.email,
                    subject="Welcome to Dress Live — your boutique is live",
                    text=(
                        f"Hi {greeting_name},\n\n"
                        f"Welcome to Dress Live! Your boutique{(' ' + boutique_name) if boutique_name else ''} "
                        "is now set up.\n\n"
                        "Here's what to do next:\n"
                        "1. Upload your dress catalogue from the Dress Live partner app\n"
                        "2. Set your availability for virtual fittings\n"
                        "3. Wait for brides to book — you'll get a notification and email for every request\n\n"
                        "When a bride books a fitting, you'll see their details and selected "
                        "dresses right in the app. Accept the booking and join the video call "
                        "at the scheduled time.\n\n"
                        "— The Dress Live team"
                    ),
                    html=render_branded_email(
                        preheader=f"Your boutique is live on Dress Live.",
                        title=f"Welcome, {greeting_name}",
                        intro=(
                            f"Your boutique{(' ' + boutique_name) if boutique_name else ''} "
                            "is now set up on Dress Live. You're ready to start receiving "
                            "virtual fitting requests from brides."
                        ),
                        paragraphs=[
                            "Upload your dress catalogue from the partner app, "
                            "and brides will be able to browse and shortlist your designs.",
                            "When a bride books a fitting, you'll receive a notification "
                            "with her details and the dresses she'd like to try. Accept "
                            "the booking, and join the video call at the scheduled time — "
                            "she'll see herself in your dresses through our AI try-on.",
                        ],
                        footer_note="If you didn't create this account, ignore this email — nothing else happens.",
                    ),
                )
            else:
                await send_email(
                    to_email=user.email,
                    subject="Welcome to Dress Live",
                    text=(
                        f"Hi {greeting_name},\n\n"
                        "Welcome to Dress Live. You can now browse boutiques, "
                        "shortlist dresses, and book live virtual fittings with "
                        "real consultants.\n\n"
                        "If you didn't create this account, ignore this email.\n\n"
                        "— Dress Live"
                    ),
                    html=render_branded_email(
                        preheader="Welcome to live virtual fittings on Dress Live.",
                        title=f"Welcome, {greeting_name}",
                        intro=(
                            "Your Dress Live account is ready. Browse boutiques, "
                            "shortlist the dresses you'd love to try, and book a "
                            "live video fitting with a real consultant."
                        ),
                        paragraphs=[
                            "Pick up to 4 dresses for each fitting — your consultant "
                            "switches between them in real time while you see "
                            "yourself wearing each one through the app's AI try-on.",
                        ],
                        footer_note="If you didn't create this account, ignore this email — nothing else happens.",
                    ),
                )
    except Exception as exc:
        logger.warning("welcome email failed for user %s: %s", user.id, exc)
    return user


@router.post("/password-reset/otp")
async def send_password_reset_otp(
    payload: PasswordResetOtpSendPayload,
    db: Session = Depends(deps.get_db),
) -> Any:
    """
    Send a 6-digit OTP to the user's email for password reset.
    This endpoint is unauthenticated (forgot password).
    """
    email = (payload.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email.")

    user = crud_user.get_by_email(db, email=email)
    # Always return success to avoid user enumeration.
    if not user:
        return {"success": True, "expires_in_seconds": 600}

    code = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = datetime.utcnow() + timedelta(minutes=10)
    crud_user.update(
        db,
        db_obj=user,
        obj_in={
            "password_otp_hash": _hash_otp(code),
            "password_otp_expires_at": expires_at.isoformat(),
        },
    )

    await send_email(
        to_email=user.email,
        subject="Your Dress Live password reset code",
        text=(
            f"Your password reset code is {code}.\n\n"
            "It expires in 10 minutes. If you didn't request this, ignore this email."
        ),
        html=render_branded_email(
            preheader="Password reset code inside.",
            title="Password reset code",
            intro=f"Your one-time code is {code}.",
            paragraphs=[
                "Type it into the Dress Live app to set a new password. "
                "The code expires in 10 minutes.",
            ],
            footer_note="If you didn't request a reset, ignore this email — your password stays the same.",
        ),
    )

    return {"success": True, "expires_in_seconds": 600}


@router.put("/password-reset/confirm", response_model=UserSchema)
async def confirm_password_reset(
    payload: PasswordResetConfirmPayload,
    db: Session = Depends(deps.get_db),
) -> Any:
    """
    Verify a 6-digit OTP and set a new password (forgot password).
    """
    email = (payload.email or "").strip().lower()
    code = _normalize_otp(payload.code)

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email.")
    if len(code) != 6:
        raise HTTPException(status_code=400, detail="Invalid verification code.")
    if not payload.new_password or len(payload.new_password.strip()) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")

    user = crud_user.get_by_email(db, email=email)
    if not user or not user.password_otp_hash or not user.password_otp_expires_at:
        raise HTTPException(status_code=400, detail="Verification code is invalid. Please resend the code.")

    try:
        expires_at = datetime.fromisoformat(user.password_otp_expires_at)
    except Exception:
        raise HTTPException(status_code=400, detail="Verification code is invalid. Please resend the code.")

    if datetime.utcnow() > expires_at:
        raise HTTPException(status_code=400, detail="Verification code expired. Please resend the code.")
    if _hash_otp(code) != user.password_otp_hash:
        raise HTTPException(status_code=400, detail="Incorrect verification code.")

    user = crud_user.update(
        db,
        db_obj=user,
        obj_in={
            "password": payload.new_password,
            "password_otp_hash": None,
            "password_otp_expires_at": None,
        },
    )
    return user

@router.get("/me", response_model=UserSchema)
def read_user_me(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Get current user.
    """
    return current_user


@router.put("/me", response_model=UserSchema)
async def update_user_me(
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Update current user profile.
    """
    body = await request.json()
    body.pop("role", None)
    body.pop("boutique_id", None)
    body.pop("is_active", None)
    body.pop("is_superuser", None)
    body.pop("password", None)
    next_email = body.get("email")
    if isinstance(next_email, str):
        normalized_email = next_email.strip().lower()
        body["email"] = normalized_email
        if normalized_email and normalized_email != (current_user.email or "").strip().lower():
            existing = crud_user.get_by_email(db, email=normalized_email)
            if existing and existing.id != current_user.id:
                raise HTTPException(
                    status_code=400,
                    detail="The user with this email already exists in the system.",
                )
    user_in = UserUpdate(**body)
    user = crud_user.update(db, db_obj=current_user, obj_in=user_in)
    return user


@router.post("/me/profile-image", response_model=UserSchema)
async def upload_user_profile_image(
    file: UploadFile = File(...),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Upload current user profile image to Supabase Storage.
    """
    _ensure_supabase_storage_config()

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    extension = mimetypes.guess_extension(file.content_type) or ".jpg"
    object_path = f"users/{current_user.id}/{uuid4().hex}{extension}"
    encoded_path = quote(object_path, safe="/")

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{settings.SUPABASE_URL}/storage/v1/object/{settings.SUPABASE_STORAGE_BUCKET}/{encoded_path}",
            headers={
                **_build_storage_headers(file.content_type),
                "x-upsert": "true",
            },
            content=file_bytes,
        )

    if response.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail="Could not upload profile image to Supabase Storage.")

    previous_image_url = current_user.profile_image_url
    public_url = (
        f"{settings.SUPABASE_URL}/storage/v1/object/public/"
        f"{settings.SUPABASE_STORAGE_BUCKET}/{encoded_path}"
    )
    user = crud_user.update(
        db,
        db_obj=current_user,
        obj_in={"profile_image_url": public_url},
    )

    if previous_image_url and previous_image_url != public_url:
        await _delete_storage_object(previous_image_url)

    return user


@router.delete("/me/profile-image", response_model=UserSchema)
async def delete_user_profile_image(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Remove current user profile image.
    """
    previous_image_url = current_user.profile_image_url
    user = crud_user.update(
        db,
        db_obj=current_user,
        obj_in={"profile_image_url": None},
    )
    if previous_image_url:
        try:
            _ensure_supabase_storage_config()
            await _delete_storage_object(previous_image_url)
        except HTTPException:
            pass

    return user


@router.put("/me/password", response_model=UserSchema)
async def update_user_password(
    payload: PasswordChangePayload,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Update current user password.
    """
    authenticated_user = crud_user.authenticate(
        db,
        email=current_user.email,
        password=payload.current_password,
    )
    if not authenticated_user:
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from the current password.")

    user = crud_user.update(
        db,
        db_obj=current_user,
        obj_in={"password": payload.new_password},
    )
    return user


def _normalize_otp(code: str) -> str:
    return re.sub(r"\D", "", code or "").strip()


def _hash_otp(code: str) -> str:
    # Tied to backend SECRET_KEY so leaked DB doesn't leak raw OTP
    return hashlib.sha256(f"{settings.SECRET_KEY}:{code}".encode("utf-8")).hexdigest()


@router.post("/me/password/otp")
async def send_password_change_otp(
    payload: PasswordOtpSendPayload,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Send an OTP code to the current user's email for password change verification.
    """
    if payload.email and payload.email != current_user.email:
        raise HTTPException(status_code=400, detail="Email does not match the signed-in user.")

    code = f"{secrets.randbelow(10000):04d}"  # 4-digit like your design
    expires_at = datetime.utcnow() + timedelta(minutes=10)

    user = crud_user.update(
        db,
        db_obj=current_user,
        obj_in={
            "password_otp_hash": _hash_otp(code),
            "password_otp_expires_at": expires_at.isoformat(),
        },
    )

    await send_email(
        to_email=current_user.email,
        subject="Your Dress Live verification code",
        text=f"Your verification code is {code}. It expires in 10 minutes.",
        html=render_branded_email(
            preheader="Verification code inside.",
            title="Verification code",
            intro=f"Your one-time code is {code}.",
            paragraphs=["Enter it in the app to confirm the action. The code expires in 10 minutes."],
            footer_note="If you didn't request this, ignore the email.",
        ),
    )

    return {"success": True, "expires_in_seconds": 600}


@router.put("/me/password/otp", response_model=UserSchema)
async def verify_password_change_otp(
    payload: PasswordOtpVerifyPayload,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Verify OTP and update current user password.
    """
    code = _normalize_otp(payload.code)
    if len(code) != 4:
        raise HTTPException(status_code=400, detail="Invalid verification code.")

    if not payload.new_password or len(payload.new_password.strip()) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")

    if not current_user.password_otp_hash or not current_user.password_otp_expires_at:
        raise HTTPException(status_code=400, detail="No verification code requested. Please resend the code.")

    try:
        expires_at = datetime.fromisoformat(current_user.password_otp_expires_at)
    except Exception:
        raise HTTPException(status_code=400, detail="Verification code is invalid. Please resend the code.")

    if datetime.utcnow() > expires_at:
        raise HTTPException(status_code=400, detail="Verification code expired. Please resend the code.")

    if _hash_otp(code) != current_user.password_otp_hash:
        raise HTTPException(status_code=400, detail="Incorrect verification code.")

    user = crud_user.update(
        db,
        db_obj=current_user,
        obj_in={
            "password": payload.new_password,
            "password_otp_hash": None,
            "password_otp_expires_at": None,
        },
    )
    return user


def _measurements_dict(user: User) -> dict:
    return {
        "height_cm": user.height_cm,
        "weight_kg": user.weight_kg,
        "bust_cm": user.bust_cm,
        "waist_cm": user.waist_cm,
        "hips_cm": user.hips_cm,
        "shoulder_cm": user.shoulder_cm,
        "arm_length_cm": user.arm_length_cm,
        "measurements_source": user.measurements_source,
    }


@router.get("/me/measurements")
def get_measurements(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    return _measurements_dict(current_user)


@router.post("/me/measurements/scan")
async def scan_measurements(
    payload: MeasurementScanPayload,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    if not (settings.BODYGRAM_API_KEY or "").strip() or not (settings.BODYGRAM_ORG_ID or "").strip():
        raise HTTPException(status_code=503, detail="AI measurement scan is not configured.")

    try:
        measurements = await bodygram_service.run_scan(
            api_key=settings.BODYGRAM_API_KEY,
            org_id=settings.BODYGRAM_ORG_ID,
            height_cm=payload.height_cm,
            weight_kg=payload.weight_kg,
            front_image_data_url=payload.front_image_data_url,
            age=payload.age,
            gender=payload.gender,
            side_image_data_url=payload.side_image_data_url,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    update_data = {
        "height_cm": payload.height_cm,
        "weight_kg": payload.weight_kg,
        "measurements_source": "bodygram",
        **{k: v for k, v in measurements.items() if v is not None},
    }
    user = crud_user.update(db, db_obj=current_user, obj_in=update_data)
    return _measurements_dict(user)


@router.put("/me/measurements")
def update_measurements(
    payload: MeasurementManualPayload,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    update_data["measurements_source"] = "manual"
    user = crud_user.update(db, db_obj=current_user, obj_in=update_data)
    return _measurements_dict(user)


@router.delete("/me")
async def delete_user_me(
    payload: DeleteAccountPayload,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Delete current user.
    """
    if payload.email and payload.email != current_user.email:
        raise HTTPException(status_code=400, detail="Email confirmation does not match the signed-in user.")

    authenticated_user = crud_user.authenticate(
        db,
        email=current_user.email,
        password=payload.password,
    )
    if not authenticated_user:
        raise HTTPException(status_code=400, detail="Password is incorrect.")

    crud_user.remove(db, id=current_user.id)
    return {"success": True}
