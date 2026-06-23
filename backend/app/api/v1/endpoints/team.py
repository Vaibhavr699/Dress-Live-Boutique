from __future__ import annotations

import json
from datetime import datetime, timezone
from html import escape
from typing import Any, List

from fastapi import APIRouter, Depends, Form, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import settings
from app.core.email import send_email
from app.core.email_templates import render_branded_email
from app.core.security import get_password_hash
from app.crud.crud_team_member import crud_team_member
from app.crud.crud_user import crud_user
from app.models.boutique import Boutique
from app.models.team_member import TeamMember
from app.models.user import User
from app.schemas.team_member import (
    TeamMember as TeamMemberSchema,
    TeamMemberInviteCreate,
    TeamMemberUpdate,
)

router = APIRouter()


# ── helpers ──────────────────────────────────────────────────────────────
def _require_partner_boutique(current_user: User) -> int:
    """Team management is partner-only and boutique-scoped. Mirrors the manual
    role/boutique checks used by the dress upload/delete routes rather than the
    subscription gate, so a lapsed subscription doesn't lock a partner out of
    managing their own team."""
    if current_user.role != "partner":
        raise HTTPException(status_code=403, detail="Only partners can manage team members.")
    if not current_user.boutique_id:
        raise HTTPException(status_code=400, detail="Partner account is not linked to a boutique.")
    return current_user.boutique_id


def _owned_member_or_404(db: Session, *, id: int, boutique_id: int) -> TeamMember:
    member = crud_team_member.get(db, id=id)
    if not member or member.boutique_id != boutique_id:
        raise HTTPException(status_code=404, detail="Team member not found.")
    return member


def serialize_member(m: TeamMember) -> dict:
    """ORM row → API dict (decodes the JSON text columns to real lists)."""
    return {
        "id": m.id,
        "boutique_id": m.boutique_id,
        "email": m.email,
        "role": m.role,
        "name": m.name,
        "languages": json.loads(m.languages) if m.languages else [],
        "availability_on": bool(m.availability_on),
        "availability_schedule": json.loads(m.availability_schedule) if m.availability_schedule else [],
        "status": m.status,
        "invited_at": m.invited_at.isoformat() if m.invited_at else None,
        "accepted_at": m.accepted_at.isoformat() if m.accepted_at else None,
    }


def _boutique_name(db: Session, boutique_id: int) -> str:
    boutique = db.query(Boutique).filter(Boutique.id == boutique_id).first()
    return (boutique.name if boutique and boutique.name else "your boutique")


async def _send_invite_email(*, member: TeamMember, boutique_name: str) -> None:
    accept_url = f"{settings.APP_PUBLIC_BASE_URL}/api/v1/team/accept/{member.invite_token}"
    subject = f"You're invited to join {boutique_name} on Dress Live"
    text = (
        f"{boutique_name} has invited you to join their team on Dress Live "
        f"as {member.role}.\n\n"
        f"Accept your invitation and set a password:\n{accept_url}\n\n"
        f"This link expires in {settings.TEAM_INVITE_TTL_DAYS} days."
    )
    html = render_branded_email(
        preheader=f"Join {boutique_name} on Dress Live.",
        title="You're invited",
        intro=(
            f"{boutique_name} has invited you to join their team on Dress Live "
            f"as {member.role}."
        ),
        paragraphs=["Accept the invitation and set your password to get started."],
        cta_label="Accept invitation",
        cta_url=accept_url,
        footer_note=(
            f"This link expires in {settings.TEAM_INVITE_TTL_DAYS} days. "
            "If you weren't expecting this, you can ignore this email."
        ),
    )
    await send_email(to_email=member.email, subject=subject, text=text, html=html)


# ── partner-facing CRUD ──────────────────────────────────────────────────
@router.get("", response_model=List[TeamMemberSchema])
@router.get("/", response_model=List[TeamMemberSchema])
def list_team(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    boutique_id = _require_partner_boutique(current_user)
    members = crud_team_member.get_multi_by_boutique(db, boutique_id=boutique_id)
    return [serialize_member(m) for m in members]


@router.post("", response_model=TeamMemberSchema)
@router.post("/", response_model=TeamMemberSchema)
async def invite_team_member(
    *,
    db: Session = Depends(deps.get_db),
    member_in: TeamMemberInviteCreate,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    boutique_id = _require_partner_boutique(current_user)
    email = member_in.email.strip().lower()
    role = (member_in.role or "").strip()
    if not role:
        raise HTTPException(status_code=400, detail="A role is required.")

    existing = crud_team_member.get_by_boutique_email(db, boutique_id=boutique_id, email=email)
    if existing:
        raise HTTPException(status_code=400, detail="That email is already on your team.")

    member = crud_team_member.create_invite(
        db, boutique_id=boutique_id, email=email, role=role
    )
    try:
        await _send_invite_email(member=member, boutique_name=_boutique_name(db, boutique_id))
    except Exception as exc:
        # The invite row is created either way (it shows as Pending); surface a
        # soft failure so the partner knows the email may not have gone out.
        raise HTTPException(
            status_code=502,
            detail=f"Invite saved, but the email could not be sent: {exc}",
        )
    return serialize_member(member)


# ── advisor self-service (own profile + availability) ────────────────────
# NOTE: declared before the /{id} routes so "me" isn't captured by {id:int}.
@router.get("/me", response_model=TeamMemberSchema)
def read_my_team_member(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.require_advisor),
) -> Any:
    member = crud_team_member.get_by_user_id(db, user_id=current_user.id)
    if not member:
        raise HTTPException(status_code=404, detail="No advisor profile found.")
    return serialize_member(member)


@router.put("/me", response_model=TeamMemberSchema)
def update_my_team_member(
    *,
    db: Session = Depends(deps.get_db),
    member_in: TeamMemberUpdate,
    current_user: User = Depends(deps.require_advisor),
) -> Any:
    member = crud_team_member.get_by_user_id(db, user_id=current_user.id)
    if not member:
        raise HTTPException(status_code=404, detail="No advisor profile found.")
    updates = member_in.model_dump(exclude_unset=True)
    # An advisor controls their own name/languages/availability — never their
    # own role (that stays with the boutique owner).
    updates.pop("role", None)
    if updates.get("availability_schedule") is not None:
        updates["availability_schedule"] = [dict(entry) for entry in updates["availability_schedule"]]
    member = crud_team_member.update(db, db_obj=member, updates=updates)
    return serialize_member(member)


@router.put("/{id}", response_model=TeamMemberSchema)
def update_team_member(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    member_in: TeamMemberUpdate,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    boutique_id = _require_partner_boutique(current_user)
    member = _owned_member_or_404(db, id=id, boutique_id=boutique_id)
    updates = member_in.model_dump(exclude_unset=True)
    # AvailabilityEntry objects → plain dicts for JSON encoding.
    if updates.get("availability_schedule") is not None:
        updates["availability_schedule"] = [
            dict(entry) for entry in updates["availability_schedule"]
        ]
    member = crud_team_member.update(db, db_obj=member, updates=updates)
    return serialize_member(member)


@router.delete("/{id}", response_model=TeamMemberSchema)
def delete_team_member(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    boutique_id = _require_partner_boutique(current_user)
    member = _owned_member_or_404(db, id=id, boutique_id=boutique_id)
    crud_team_member.remove(db, id=member.id)
    return serialize_member(member)


@router.post("/{id}/resend", response_model=TeamMemberSchema)
async def resend_invite(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    boutique_id = _require_partner_boutique(current_user)
    member = _owned_member_or_404(db, id=id, boutique_id=boutique_id)
    if member.status == "active":
        raise HTTPException(status_code=400, detail="This member has already accepted.")
    member = crud_team_member.regenerate_invite(db, db_obj=member)
    await _send_invite_email(member=member, boutique_name=_boutique_name(db, boutique_id))
    return serialize_member(member)


# ── public accept landing (backend-hosted, like /stripe-return) ───────────
def _page(title: str, body_html: str, *, refresh_to: str | None = None) -> str:
    meta = (
        f'<meta http-equiv="refresh" content="1; url={escape(refresh_to)}">'
        if refresh_to
        else ""
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
{meta}
<title>{escape(title)} · Dress Live</title>
<style>
  body {{ font-family: -apple-system, system-ui, sans-serif; background: #FAF7F2; color: #1a1a1a; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 40px; }}
  .card {{ max-width: 380px; width: 100%; background: #fff; border: 1px solid #EFE9E1; padding: 36px 32px; }}
  h1 {{ font-weight: 400; font-size: 22px; letter-spacing: 0.5px; margin: 0 0 8px; }}
  p {{ color: #6b6b6b; font-size: 14px; line-height: 22px; margin: 0 0 18px; }}
  label {{ display: block; font-size: 10px; letter-spacing: 0.6px; text-transform: uppercase; color: #6b6b6b; margin: 16px 0 6px; }}
  input {{ width: 100%; box-sizing: border-box; border: 1px solid #D9D9D9; padding: 12px; font-size: 14px; }}
  button {{ width: 100%; margin-top: 24px; background: #1a1a1a; color: #fff; border: 0; padding: 14px; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; cursor: pointer; }}
  .err {{ color: #B00020; font-size: 13px; margin: 12px 0 0; }}
  .muted {{ font-size: 12px; color: #9b9b9b; }}
  a.btn {{ display: inline-block; background: #1a1a1a; color: #fff; padding: 14px 28px; text-decoration: none; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; }}
</style>
</head>
<body><div class="card">{body_html}</div></body>
</html>"""


def _accept_form_html(*, member: TeamMember, boutique_name: str, error: str | None = None) -> str:
    err_html = f'<p class="err">{escape(error)}</p>' if error else ""
    body = f"""
  <h1>Join {escape(boutique_name)}</h1>
  <p>You've been invited as <strong>{escape(member.role)}</strong>. Set your name and a password to accept.</p>
  <form method="post" action="/api/v1/team/accept/{escape(member.invite_token or '')}">
    <label>Your name</label>
    <input name="name" type="text" value="{escape(member.name or '')}" required>
    <label>Password</label>
    <input name="password" type="password" minlength="8" placeholder="At least 8 characters" required>
    {err_html}
    <button type="submit">Accept invitation</button>
  </form>
  <p class="muted" style="margin-top:18px;">Invited as {escape(member.email)}</p>
"""
    return _page("Accept invitation", body)


def _is_expired(member: TeamMember) -> bool:
    if not member.invite_expires_at:
        return False
    exp = member.invite_expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return exp < datetime.now(timezone.utc)


@router.get("/accept/{token}", response_class=HTMLResponse)
def accept_invite_page(*, db: Session = Depends(deps.get_db), token: str) -> Any:
    member = crud_team_member.get_by_token(db, token)
    if not member:
        return HTMLResponse(
            _page("Invitation not found", "<h1>Invitation not found</h1>"
                  "<p>This invitation link is invalid or has already been used.</p>"),
            status_code=404,
        )
    if member.status == "active":
        return HTMLResponse(
            _page("Already accepted", "<h1>Already accepted</h1>"
                  "<p>This invitation has already been accepted. You can sign in to the "
                  "Dress Live Partner app with your email and password.</p>"),
        )
    if _is_expired(member):
        return HTMLResponse(
            _page("Invitation expired", "<h1>Invitation expired</h1>"
                  "<p>This invitation link has expired. Ask the boutique to resend it.</p>"),
            status_code=410,
        )
    return HTMLResponse(_accept_form_html(member=member, boutique_name=_boutique_name(db, member.boutique_id)))


@router.post("/accept/{token}", response_class=HTMLResponse)
def accept_invite_submit(
    *,
    db: Session = Depends(deps.get_db),
    token: str,
    name: str = Form(...),
    password: str = Form(...),
) -> Any:
    member = crud_team_member.get_by_token(db, token)
    if not member:
        return HTMLResponse(
            _page("Invitation unavailable", "<h1>Invitation unavailable</h1>"
                  "<p>This invitation link is invalid or has already been used.</p>"),
            status_code=404,
        )
    if member.status == "active":
        return HTMLResponse(
            _page("Already accepted", "<h1>Already accepted</h1>"
                  "<p>This invitation has already been accepted. You can sign in to the "
                  "Dress Live Partner app with your email and password.</p>"),
        )
    if _is_expired(member):
        return HTMLResponse(
            _page("Invitation expired", "<h1>Invitation expired</h1>"
                  "<p>This invitation link has expired. Ask the boutique to resend it.</p>"),
            status_code=410,
        )

    name = (name or "").strip()
    boutique_name = _boutique_name(db, member.boutique_id)
    if len(password) < 8 or not name:
        return HTMLResponse(
            _accept_form_html(
                member=member,
                boutique_name=boutique_name,
                error="Enter your name and a password of at least 8 characters.",
            ),
            status_code=400,
        )

    # Create or link the advisor's User account.
    existing = crud_user.get_by_email(db, email=member.email)
    if existing:
        # Don't touch an existing account's password — just attach them to this
        # boutique as an advisor and tell them to use their current credentials.
        existing.boutique_id = member.boutique_id
        if existing.role == "buyer":
            existing.role = "advisor"
        db.add(existing)
        db.commit()
        db.refresh(existing)
        user = existing
        sign_in_note = "Sign in to the Dress Live Partner app with your existing email and password."
    else:
        user = User(
            email=member.email,
            hashed_password=get_password_hash(password),
            full_name=name,
            role="advisor",
            boutique_id=member.boutique_id,
            is_active=True,
            is_superuser=False,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        sign_in_note = "You can now sign in to the Dress Live Partner app with your email and new password."

    if not member.name:
        member.name = name
    crud_team_member.mark_accepted(db, db_obj=member, user_id=user.id)

    body = (
        f"<h1>You're in</h1>"
        f"<p>Welcome to {escape(boutique_name)} on Dress Live. {escape(sign_in_note)}</p>"
        f'<a class="btn" href="dress-live-partner://">Open Dress Live Partner</a>'
    )
    return HTMLResponse(_page("Welcome", body, refresh_to="dress-live-partner://"))
