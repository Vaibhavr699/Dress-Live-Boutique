from typing import Optional
import httpx

from app.core.config import settings


async def send_email(*, to_email: str, subject: str, text: str) -> None:
    """
    Sends an email via Resend if configured, otherwise logs to stdout (dev fallback).
    """
    if not settings.RESEND_API_KEY:
        print("INFO: RESEND_API_KEY not set. Email fallback log.")
        print(f"TO: {to_email}")
        print(f"SUBJECT: {subject}")
        print(text)
        return

    payload = {
        "from": settings.EMAIL_FROM,
        "to": [to_email],
        "subject": subject,
        "text": text,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Failed to send email via Resend: {resp.status_code} {resp.text}")

