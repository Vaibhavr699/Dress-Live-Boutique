import logging
from typing import Any, List, Optional
from urllib.parse import quote, unquote

import httpx

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import settings
from app.core.email import send_email
from app.core.email_templates import paragraph_with_link, render_branded_email
from app.crud.crud_boutique import crud_boutique
from app.crud.crud_booking import crud_booking
from app.crud.crud_dress import crud_dress
from app.models.booking import Booking
from app.models.user import User
from app.schemas.booking import (
    BookingBoutiqueSummary,
    BookingCreate,
    BookingCustomerSummary,
    BookingDressSummary,
    BookingUpdate,
    BookingView,
    PostCallDress,
    PostCallView,
)
from app.services import notifications as notifications_service
from app.utils.email_join_token import mint_join_token

logger = logging.getLogger(__name__)


def _appointment_label(appointment_type: str) -> str:
    return "video call" if appointment_type == "video" else "store visit"


def _partner_user_ids_for_boutique(db: Session, boutique_id: int) -> list[int]:
    rows = (
        db.query(User.id)
        .filter(User.role == "partner", User.boutique_id == boutique_id)
        .all()
    )
    return [r[0] for r in rows]


def _notify_safe(db: Session, **kwargs) -> None:
    """Best-effort dispatch — never let a notification failure break a booking
    write. The endpoint commits before this is called."""
    try:
        notifications_service.dispatch(db, **kwargs)
    except Exception as e:
        logger.warning("notifications.dispatch failed: %s", e)


def _build_web_call_link(booking: Booking) -> Optional[str]:
    """Build the bride's tokenized join link for the Next.js web call
    page. Returns None when `WEB_CALL_BASE_URL` isn't configured (RN-only
    deployments) — callers must skip the email/section in that case."""
    base = (settings.WEB_CALL_BASE_URL or "").strip().rstrip("/")
    if not base:
        return None
    token = mint_join_token(booking_id=booking.id, user_id=booking.user_id)
    return f"{base}/call/{booking.id}?token={token}"


async def _send_video_call_confirmation_email(
    bride_email: str,
    bride_name: Optional[str],
    boutique_name: str,
    scheduled_for: str,
    link: str,
) -> None:
    """Bride email — the boutique has accepted the booking. Includes the
    join CTA button + a plain-text fallback URL for clients that block
    the button.
    """
    title = "Your fitting is confirmed"
    intro = (
        f"{boutique_name} has accepted your request. "
        f"Your virtual fitting is set for {scheduled_for}."
    )
    paragraphs = [
        "When it's time, open this email on a computer with a webcam "
        "(Chrome or Safari work best) and tap the button below. No login "
        "needed — the link signs you in automatically.",
        "Tip: open it a minute early so we can check your camera and mic "
        "before your consultant joins.",
    ]
    html = render_branded_email(
        preheader=f"Your fitting with {boutique_name} is confirmed.",
        title=title,
        intro=intro,
        paragraphs=paragraphs,
        cta_label="Open your fitting",
        cta_url=link,
        footer_note=f"If the button doesn't work, copy this link into your browser:\n{link}",
    )

    greeting = f"Hi {bride_name.split()[0] if bride_name else 'there'},\n\n"
    text = (
        greeting
        + f"{intro}\n\n"
        + "When it's time, open this link on a computer with a webcam "
        f"(Chrome or Safari work best):\n\n{link}\n\n"
        + "No login needed — the link signs you in automatically. Tip: "
        "open it a minute early so we can check your camera and mic.\n\n"
        + "— The Dress Live team"
    )
    await send_email(
        to_email=bride_email,
        subject="Your virtual fitting is confirmed — your join link",
        text=text,
        html=html,
    )


async def _send_video_call_requested_email(
    bride_email: str,
    bride_name: Optional[str],
    boutique_name: str,
    scheduled_for: str,
    link: str,
) -> None:
    """Bride email — booking just created, awaiting boutique acceptance.
    Sends the same JWT join link so she has it ready when she gets the
    confirmation email later.
    """
    title = "We've got your fitting request"
    intro = (
        f"You asked for a virtual fitting with {boutique_name} on "
        f"{scheduled_for}. They'll confirm shortly."
    )
    paragraphs = [
        "We've already prepared your private link below. Save this email — "
        "you'll use the same link when the boutique accepts, and on the "
        "day of your fitting.",
    ]
    html = render_branded_email(
        preheader=f"Your fitting request with {boutique_name} is in.",
        title=title,
        intro=intro,
        paragraphs=paragraphs,
        cta_label="Save your join link",
        cta_url=link,
        footer_note=(
            "The link logs you in automatically — no password needed. "
            "If the boutique hasn't accepted yet, you'll see a friendly "
            '"not yet" message when you open it.'
        ),
    )

    greeting = f"Hi {bride_name.split()[0] if bride_name else 'there'},\n\n"
    text = (
        greeting
        + f"{intro}\n\n"
        + "Save this link — you'll use it to join the fitting from your "
        f"laptop:\n\n{link}\n\n"
        + "The link logs you in automatically. We'll email you again the "
        "moment the boutique accepts.\n\n"
        + "— The Dress Live team"
    )
    await send_email(
        to_email=bride_email,
        subject="We got your fitting request — your join link inside",
        text=text,
        html=html,
    )


async def _send_booking_notification_to_partner(
    partner_email: str,
    partner_name: Optional[str],
    buyer_name: str,
    buyer_email: str,
    boutique_name: str,
    appointment_type: str,
    scheduled_for: str,
    dresses: list,
) -> None:
    type_label = "video call" if appointment_type == "video" else "store visit"
    greeting = partner_name.split()[0] if partner_name else "there"

    dress_lines_text = []
    dress_lines_html = []
    for d in dresses:
        price_str = f" — €{d.price:.2f}" if d.price else ""
        dress_lines_text.append(f"  • {d.name}{price_str}")
        dress_lines_html.append(f"{d.name}{price_str}")

    dresses_text = "\n".join(dress_lines_text) if dress_lines_text else "  (none selected)"
    dresses_html = ", ".join(dress_lines_html) if dress_lines_html else "none selected"

    text = (
        f"Hi {greeting},\n\n"
        f"New {type_label} request for {boutique_name}.\n\n"
        f"Customer: {buyer_name} ({buyer_email})\n"
        f"Scheduled: {scheduled_for}\n"
        f"Type: {type_label}\n\n"
        f"Dresses selected:\n{dresses_text}\n\n"
        "Open the Dress Live partner app to accept or decline.\n\n"
        "— The Dress Live team"
    )

    html = render_branded_email(
        preheader=f"New {type_label} request from {buyer_name}.",
        title="New fitting request",
        intro=(
            f"{buyer_name} has requested a {type_label} "
            f"at {boutique_name} for {scheduled_for}."
        ),
        paragraphs=[
            f"Customer: {buyer_name} ({buyer_email})",
            f"Dresses: {dresses_html}",
            "Open the Dress Live partner app to review the request "
            "and accept or decline.",
        ],
    )

    await send_email(
        to_email=partner_email,
        subject=f"New fitting request from {buyer_name}",
        text=text,
        html=html,
    )


def _enqueue_booking_notification_to_partners(
    bg: BackgroundTasks,
    db: Session,
    booking: Booking,
    buyer: User,
    boutique_name: str,
    dresses: list,
) -> None:
    partner_rows = (
        db.query(User)
        .filter(User.role == "partner", User.boutique_id == booking.boutique_id)
        .all()
    )
    buyer_name = (buyer.full_name or buyer.email or "A customer").strip()
    buyer_email = buyer.email or ""

    for partner in partner_rows:
        if not partner.email:
            continue
        bg.add_task(
            _send_booking_notification_to_partner,
            partner.email,
            partner.full_name,
            buyer_name,
            buyer_email,
            boutique_name,
            booking.appointment_type,
            booking.scheduled_for,
            dresses,
        )


def _enqueue_video_call_requested(
    bg: BackgroundTasks, booking: Booking, boutique_name: str
) -> None:
    """Defer the booking-created email to a FastAPI BackgroundTask.
    Replaces the previous asyncio.create_task fire-and-forget, which
    could be cancelled when the request worker returned (and was the
    most likely cause of "I'm not getting any booking emails").
    """
    if booking.appointment_type != "video":
        return
    if booking.user is None or not booking.user.email:
        logger.warning(
            "skipping booking-requested email for booking %s: bride has no email on file",
            booking.id,
        )
        return
    link = _build_web_call_link(booking)
    if not link:
        # Make the silent-failure mode loud. Saw this in production: emails
        # weren't arriving because WEB_CALL_BASE_URL wasn't set in Railway.
        # Without a log here the only symptom was "no email in inbox".
        logger.warning(
            "skipping booking-requested email for booking %s: WEB_CALL_BASE_URL is not configured "
            "(set it in Railway → backend service → Variables, then redeploy)",
            booking.id,
        )
        return
    bg.add_task(
        _send_video_call_requested_email,
        booking.user.email,
        booking.user.full_name,
        boutique_name,
        booking.scheduled_for,
        link,
    )


def _enqueue_video_call_confirmation(
    bg: BackgroundTasks, booking: Booking, boutique_name: str
) -> None:
    """Same pattern for the post-accept confirmation email."""
    if booking.appointment_type != "video":
        return
    if booking.user is None or not booking.user.email:
        logger.warning(
            "skipping booking-confirmed email for booking %s: bride has no email on file",
            booking.id,
        )
        return
    link = _build_web_call_link(booking)
    if not link:
        logger.warning(
            "skipping booking-confirmed email for booking %s: WEB_CALL_BASE_URL is not configured",
            booking.id,
        )
        return
    bg.add_task(
        _send_video_call_confirmation_email,
        booking.user.email,
        booking.user.full_name,
        boutique_name,
        booking.scheduled_for,
        link,
    )


def _booking_payload(booking: Booking) -> dict[str, Any]:
    return {
        "booking_id": booking.id,
        "appointment_type": booking.appointment_type,
        "scheduled_for": booking.scheduled_for,
        "status": booking.status,
        "location": booking.location,
    }

router = APIRouter()


def _extract_storage_object_path(image_url: Optional[str]) -> Optional[str]:
    if not image_url or not settings.SUPABASE_URL:
        return None
    public_prefix = f"{settings.SUPABASE_URL}/storage/v1/object/public/{settings.SUPABASE_STORAGE_BUCKET}/"
    if image_url.startswith(public_prefix):
        return unquote(image_url.replace(public_prefix, "", 1))
    return None


def _normalize_profile_image_url(image_url: Optional[str]) -> Optional[str]:
    """
    If a stored URL was built with a wrong SUPABASE_URL (e.g. postgresql://...),
    rewrite it to the correct HTTPS Supabase host when possible.
    """
    if not image_url or not settings.POSTGRES_SERVER.endswith(".supabase.co"):
        return image_url

    if image_url.startswith("postgres"):
        marker = "/storage/v1/"
        idx = image_url.find(marker)
        if idx != -1:
            base = f"https://{settings.POSTGRES_SERVER.split('.', 1)[0]}.supabase.co"
            return f"{base}{image_url[idx:]}"
    return image_url


def _sign_profile_image_url(image_url: Optional[str]) -> Optional[str]:
    """
    Return a signed URL for a Supabase storage object (works for private buckets).
    Falls back to the original URL if signing isn't possible.
    """
    image_url = _normalize_profile_image_url(image_url)

    if not image_url or not settings.SUPABASE_URL:
        return image_url
    # If the bucket is public, the stored public URL is already directly usable.
    # (Signing is only needed for private buckets.)
    public_prefix = f"{settings.SUPABASE_URL}/storage/v1/object/public/{settings.SUPABASE_STORAGE_BUCKET}/"
    if image_url.startswith(public_prefix):
        return image_url

    if not settings.SUPABASE_SERVICE_ROLE_KEY:
        return image_url

    object_path = _extract_storage_object_path(image_url)
    if not object_path:
        return image_url

    encoded_path = quote(object_path, safe="/")
    sign_url = f"{settings.SUPABASE_URL}/storage/v1/object/sign/{settings.SUPABASE_STORAGE_BUCKET}/{encoded_path}"
    try:
        response = httpx.post(
            sign_url,
            headers={
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
                "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
                "Content-Type": "application/json",
            },
            json={"expiresIn": 60 * 60 * 24 * 7},
            timeout=10.0,
        )
        if response.status_code not in (200, 201):
            return image_url
        data = response.json()
        signed_path = data.get("signedURL") or data.get("signedUrl") or data.get("signed_url")
        if not signed_path:
            return image_url
        if isinstance(signed_path, str) and signed_path.startswith("http"):
            return signed_path
        # Supabase typically returns `/storage/v1/object/sign/...?...`
        # so we should prefix with the base URL only.
        if isinstance(signed_path, str) and signed_path.startswith("/"):
            return f"{settings.SUPABASE_URL}{signed_path}"
        return f"{settings.SUPABASE_URL}/{signed_path}"
    except Exception:
        return image_url


def _booking_view(booking, *, dresses, user, boutique) -> BookingView:
    """Assemble a BookingView from already-resolved related objects. Shared by
    the single (serialize_booking) and batched (serialize_bookings) paths so
    the field mapping lives in exactly one place."""
    dress_ids = [int(item) for item in booking.selected_dress_ids.split(",") if item]
    return BookingView(
        id=booking.id,
        user_id=booking.user_id,
        boutique_id=booking.boutique_id,
        appointment_type=booking.appointment_type,
        status=booking.status,
        scheduled_for=booking.scheduled_for,
        language=booking.language,
        notes=booking.notes,
        location=booking.location,
        selected_dress_ids=booking.selected_dress_ids,
        dress_ids=dress_ids,
        customer=BookingCustomerSummary(
            id=user.id,
            full_name=user.full_name,
            email=user.email,
            profile_image_url=_sign_profile_image_url(user.profile_image_url),
        ) if user else None,
        dresses=[
            BookingDressSummary(
                id=dress.id,
                name=dress.name,
                price=dress.price,
                colors=dress.colors,
                sizes=dress.sizes,
                image_url=dress.image_url,
            )
            for dress in dresses
        ],
        boutique=BookingBoutiqueSummary(
            id=boutique.id,
            name=boutique.name,
            location=boutique.location,
        ) if boutique else None,
        appointment_fee=booking.appointment_fee,
        is_paid=booking.is_paid,
        video_ring_at=getattr(booking, "video_ring_at", None),
        video_ring_from_user_id=getattr(booking, "video_ring_from_user_id", None),
        created_at=booking.created_at,
        updated_at=booking.updated_at,
    )


def serialize_booking(db: Session, booking) -> BookingView:
    """Single-booking serializer (read_booking / post-call). For lists use
    serialize_bookings — it batches the lookups to avoid an N+1."""
    dress_ids = [int(item) for item in booking.selected_dress_ids.split(",") if item]
    dresses = [d for d in (crud_dress.get(db, id=i) for i in dress_ids) if d]
    boutique = crud_boutique.get(db, id=booking.boutique_id)
    return _booking_view(booking, dresses=dresses, user=booking.user, boutique=boutique)


def serialize_bookings(db: Session, bookings: list) -> List[BookingView]:
    """Batched serializer. The old per-booking path issued one query per dress
    plus a boutique + user load for every booking — O(N×M) round-trips to the
    DB, which got slow as a boutique's history grew. This collapses it to a
    few `IN (...)` queries (dresses, boutiques, users) regardless of N."""
    if not bookings:
        return []

    from app.models.boutique import Boutique
    from app.models.dress import Dress

    parsed_ids: dict[int, list[int]] = {}
    all_dress_ids: set[int] = set()
    for b in bookings:
        ids = [int(item) for item in (b.selected_dress_ids or "").split(",") if item]
        parsed_ids[b.id] = ids
        all_dress_ids.update(ids)

    dress_by_id = (
        {d.id: d for d in db.query(Dress).filter(Dress.id.in_(all_dress_ids)).all()}
        if all_dress_ids else {}
    )
    boutique_ids = {b.boutique_id for b in bookings if b.boutique_id}
    boutique_by_id = (
        {x.id: x for x in db.query(Boutique).filter(Boutique.id.in_(boutique_ids)).all()}
        if boutique_ids else {}
    )
    user_ids = {b.user_id for b in bookings if b.user_id}
    user_by_id = (
        {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}
        if user_ids else {}
    )

    return [
        _booking_view(
            b,
            dresses=[dress_by_id[i] for i in parsed_ids[b.id] if i in dress_by_id],
            user=user_by_id.get(b.user_id),
            boutique=boutique_by_id.get(b.boutique_id),
        )
        for b in bookings
    ]


@router.get("/me", response_model=List[BookingView])
def read_my_bookings(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    bookings = crud_booking.get_multi_by_user(db, user_id=current_user.id)
    return serialize_bookings(db, bookings)


@router.get("/partner", response_model=List[BookingView])
def read_partner_bookings(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    # Boutique staff = the owning partner OR an advisor linked to the boutique.
    # Advisors help run the calendar, so they get the same read access.
    if current_user.role not in ("partner", "advisor"):
        raise HTTPException(status_code=403, detail="Only boutique staff can access partner bookings.")
    if not current_user.boutique_id:
        return []

    bookings = crud_booking.get_multi_by_boutique(db, boutique_id=current_user.boutique_id)
    return serialize_bookings(db, bookings)


@router.get("/{booking_id}", response_model=BookingView)
def read_booking(
    *,
    db: Session = Depends(deps.get_db),
    booking_id: int,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    booking = crud_booking.get(db, id=booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if current_user.role == "buyer":
        if booking.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not allowed to view this booking.")
    elif current_user.role in ("partner", "advisor"):
        if not current_user.boutique_id or booking.boutique_id != current_user.boutique_id:
            raise HTTPException(status_code=403, detail="Not allowed to view this booking.")
    else:
        raise HTTPException(status_code=403, detail="Not allowed to view bookings.")

    return serialize_booking(db, booking)


@router.get("/{booking_id}/post-call", response_model=PostCallView)
def read_post_call(
    *,
    db: Session = Depends(deps.get_db),
    booking_id: int,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """Post-call dress-selection payload for the bride.

    Returned to the bride RN app (and later the web post-call screen)
    after the LiveKit `room_finished` webhook has marked the booking
    `completed`. Lists the 4 dresses she tried so she can tap one and
    hand off to the existing checkout flow.

    Buyer-only. Reachable when the booking is `completed` (the bride
    actually finished the call) OR `accepted` (so the screen can still
    render — useful when the bride opens the link before the webhook
    lands, especially in dev where webhooks may not be set up).
    """
    booking = crud_booking.get(db, id=booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if current_user.role != "buyer":
        raise HTTPException(status_code=403, detail="Not allowed.")
    if booking.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to view this booking.")
    if booking.appointment_type != "video":
        raise HTTPException(status_code=400, detail="This booking is not a video appointment.")

    dress_ids = [int(t) for t in (booking.selected_dress_ids or "").split(",") if t.strip().isdigit()]
    rows = {d.id: d for d in [crud_dress.get(db, id=d) for d in dress_ids] if d}
    dresses = [
        PostCallDress(
            id=rows[did].id,
            name=rows[did].name,
            price=rows[did].price,
            image_url=rows[did].image_url,
            colors=rows[did].colors,
            sizes=rows[did].sizes,
        )
        for did in dress_ids
        if did in rows
    ]

    boutique = crud_boutique.get(db, id=booking.boutique_id)
    duration_seconds: Optional[int] = None
    if booking.started_at and booking.ended_at:
        duration_seconds = max(0, int((booking.ended_at - booking.started_at).total_seconds()))

    return PostCallView(
        booking_id=booking.id,
        status=booking.status,
        boutique=BookingBoutiqueSummary(
            id=boutique.id, name=boutique.name, location=boutique.location
        ) if boutique else None,
        scheduled_for=booking.scheduled_for,
        started_at=booking.started_at,
        ended_at=booking.ended_at,
        duration_seconds=duration_seconds,
        dresses=dresses,
    )


@router.post("/", response_model=BookingView)
async def create_booking(
    *,
    db: Session = Depends(deps.get_db),
    booking_in: BookingCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    if current_user.role != "buyer":
        raise HTTPException(status_code=403, detail="Only buyers can create bookings.")

    dresses = []
    for dress_id in booking_in.dress_ids:
        dress = crud_dress.get(db, id=dress_id)
        if not dress:
            raise HTTPException(status_code=404, detail=f"Dress {dress_id} not found")
        dresses.append(dress)

    boutique_ids = {dress.boutique_id for dress in dresses}
    if len(boutique_ids) != 1:
        raise HTTPException(
            status_code=400,
            detail="All selected dresses must belong to the same boutique.",
        )

    boutique = crud_boutique.get(db, id=dresses[0].boutique_id)
    booking_payload = booking_in
    if booking_in.appointment_type == "in_store" and not booking_in.location:
        booking_payload = booking_in.model_copy(
            update={"location": boutique.location if boutique else "Boutique location to be confirmed"}
        )

    booking = crud_booking.create(
        db,
        user_id=current_user.id,
        boutique_id=dresses[0].boutique_id,
        obj_in=booking_payload,
    )

    # Notify all partners of this boutique that a new booking request landed.
    type_label = _appointment_label(booking.appointment_type)
    buyer_name = (current_user.full_name or current_user.email or "A customer").strip()
    boutique_name = (boutique.name if boutique else "your boutique") or "your boutique"
    buyer_image = (current_user.profile_image_url or "").strip() or None
    boutique_image = None
    if boutique:
        boutique_image = (boutique.header_image_url or boutique.interior_image_url or "").strip() or None

    for partner_id in _partner_user_ids_for_boutique(db, booking.boutique_id):
        _notify_safe(
            db,
            user_id=partner_id,
            kind="booking_request_received",
            title="New booking request",
            body=f"{buyer_name} requested a {type_label} for {booking.scheduled_for}.",
            action_type="booking",
            action_id=booking.id,
            payload=_booking_payload(booking),
            image_url=buyer_image,
        )

    # Also notify the buyer with a confirmation row so they have a paper trail.
    _notify_safe(
        db,
        user_id=current_user.id,
        kind="booking_requested",
        title="Booking request sent",
        body=f"Your {type_label} request to {boutique_name} is pending confirmation.",
        action_type="booking",
        action_id=booking.id,
        payload=_booking_payload(booking),
        image_url=boutique_image,
    )

    # Spec step "Immediate confirmation with the call link" — queue the
    # first of the two bride emails. Uses FastAPI BackgroundTasks (which
    # owns the task lifecycle properly) rather than the previous
    # asyncio.create_task which got orphaned when the request worker
    # returned, dropping the email silently.
    _enqueue_video_call_requested(background_tasks, booking, boutique_name)

    _enqueue_booking_notification_to_partners(
        background_tasks, db, booking, current_user, boutique_name, dresses,
    )

    return serialize_booking(db, booking)


@router.put("/{booking_id}", response_model=BookingView)
async def update_booking(
    *,
    db: Session = Depends(deps.get_db),
    booking_id: int,
    booking_in: BookingUpdate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    booking = crud_booking.get(db, id=booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.status in {"rejected", "completed"}:
        raise HTTPException(
            status_code=400,
            detail="This booking can no longer be updated.",
        )

    if current_user.role in ("partner", "advisor"):
        # Boutique staff (owner or advisor) manage the boutique's bookings the
        # same way — accept/reject/reschedule/complete, scoped to their boutique.
        if not current_user.boutique_id or booking.boutique_id != current_user.boutique_id:
            raise HTTPException(status_code=403, detail="Not allowed to update this booking.")
        if booking_in.status and booking_in.status not in {"accepted", "rejected", "rescheduled", "completed"}:
            raise HTTPException(status_code=400, detail="Boutique staff can only accept, reject, reschedule or complete bookings.")
    elif booking.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to update this booking.")
    else:
        if booking_in.status and booking_in.status not in {"rejected", "rescheduled", "completed"}:
            raise HTTPException(status_code=400, detail="Buyers can only cancel, reschedule, or complete their own bookings.")
        if booking_in.appointment_fee is not None or booking_in.is_paid is not None:
            raise HTTPException(status_code=400, detail="Buyers cannot update payment fields.")

    if booking_in.status == "rescheduled" and not booking_in.scheduled_for:
        raise HTTPException(
            status_code=400,
            detail="A new scheduled_for value is required when rescheduling a booking.",
        )

    booking_payload = booking_in
    if (
        current_user.role in ("partner", "advisor")
        and booking.appointment_type == "in_store"
        and booking_in.status == "rescheduled"
        and booking_in.location is None
    ):
        boutique = crud_boutique.get(db, id=booking.boutique_id)
        booking_payload = booking_in.model_copy(
            update={"location": booking.location or (boutique.location if boutique else None)}
        )

    prev_status = booking.status
    prev_scheduled_for = booking.scheduled_for
    booking = crud_booking.update(db, db_obj=booking, obj_in=booking_payload)

    # Notify the other party of status / schedule changes.
    status_changed = booking_in.status is not None and booking.status != prev_status
    schedule_changed = (
        booking_in.scheduled_for is not None and booking.scheduled_for != prev_scheduled_for
    )
    if status_changed or schedule_changed:
        type_label = _appointment_label(booking.appointment_type)
        acting_role = current_user.role  # 'partner' | 'advisor' (boutique-side) or 'buyer'
        acting_is_boutique = acting_role in ("partner", "advisor")
        buyer_id = booking.user_id
        partner_ids = _partner_user_ids_for_boutique(db, booking.boutique_id)
        # Recipients = "the other side"
        recipients: list[int] = []
        if acting_is_boutique:
            recipients = [buyer_id]
        else:
            recipients = list(partner_ids)

        # Pick a sensible title/body for the most common status transitions.
        if booking.status == "accepted":
            title = "Booking accepted"
            body = f"Your {type_label} is confirmed for {booking.scheduled_for}."
            kind = "booking_accepted"
        elif booking.status == "rejected":
            title = "Booking declined"
            body = f"Your {type_label} request was declined."
            kind = "booking_rejected"
        elif booking.status == "rescheduled":
            title = "Booking rescheduled"
            body = f"New time for your {type_label}: {booking.scheduled_for}."
            kind = "booking_rescheduled"
        elif booking.status == "completed":
            title = "Booking completed"
            body = f"Your {type_label} is marked complete."
            kind = "booking_completed"
        else:
            title = "Booking updated"
            body = f"Your {type_label} was updated. Check the latest details."
            kind = "booking_updated"

        # Rich image: show the *counterparty's* picture to the recipient.
        if acting_is_boutique:
            boutique = crud_boutique.get(db, id=booking.boutique_id)
            recipient_image = None
            if boutique:
                recipient_image = (boutique.header_image_url or boutique.interior_image_url or "").strip() or None
        else:
            recipient_image = (current_user.profile_image_url or "").strip() or None

        for uid in recipients:
            _notify_safe(
                db,
                user_id=uid,
                kind=kind,
                title=title,
                body=body,
                action_type="booking",
                action_id=booking.id,
                payload=_booking_payload(booking),
                image_url=recipient_image,
            )

    # When a partner accepts a VIDEO booking, queue the bride's
    # confirmation email (with the join link CTA). Uses FastAPI
    # BackgroundTasks so the task lifecycle survives past the response —
    # the previous asyncio.create_task was the reason confirmation emails
    # were silently dropping.
    if (
        booking_in.status == "accepted"
        and prev_status != "accepted"
        and booking.appointment_type == "video"
        and current_user.role in ("partner", "advisor")
    ):
        boutique = crud_boutique.get(db, id=booking.boutique_id)
        boutique_name = (boutique.name if boutique else "your boutique") or "your boutique"
        _enqueue_video_call_confirmation(background_tasks, booking, boutique_name)

    return serialize_booking(db, booking)
