from typing import Optional
import httpx

from app.core.config import settings


async def send_email(
    *,
    to_email: str,
    subject: str,
    text: str,
    html: Optional[str] = None,
) -> None:
    """Send a single transactional email via Resend.

    Plain `text` is always required (Resend uses it as the multipart
    alternative for clients that don't render HTML). `html` is optional;
    when present Resend treats it as the primary body.

    No-op in dev if RESEND_API_KEY is unset — the body is printed to
    stdout so local development doesn't need Resend creds. In production
    a missing key would silently swallow every email, which is exactly
    the "I'm not getting any emails" symptom.
    """
    if not settings.RESEND_API_KEY:
        print("INFO: RESEND_API_KEY not set. Email fallback log.")
        print(f"TO: {to_email}")
        print(f"SUBJECT: {subject}")
        print(text)
        return

    payload: dict = {
        "from": settings.EMAIL_FROM,
        "to": [to_email],
        "subject": subject,
        "text": text,
    }
    if html:
        payload["html"] = html

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

