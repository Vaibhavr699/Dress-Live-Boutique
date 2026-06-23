"""Generic async-job dispatcher for the AI Try-On pipeline.

An `AIJob` row describes one pipeline step (standardize / tryon / editorial /
upscale / qa) to run on an external provider (fal / fashn). This module submits
the job to the provider and records the returned `provider_job_id`; the provider
later calls our webhook, which marks the job completed/failed.

Provider calls are SUBMIT-AND-RETURN (no held HTTP connection). Until an API key
is configured, `submit_job` leaves the job in `pending` and records a clear
"not configured" message — so the whole backbone (create → poll → webhook) is
buildable and testable without keys.
"""

from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.crud.crud_ai_job import crud_ai_job
from app.models.ai_job import AIJob
from app.services import fal as fal_service
from app.services import fashn as fashn_service

logger = logging.getLogger(__name__)


class ProviderNotConfigured(Exception):
    """Raised when a job's provider has no API key / config missing."""


def _webhook_url(path: str, secret: Optional[str]) -> str:
    """Build a provider callback URL. The shared secret is appended as a `secret`
    query param so the (fail-closed) receiver can authenticate the callback —
    fal/FASHN deliver webhooks to a URL and don't support custom request headers,
    so the URL is the only channel for the secret. The secret must be set, or the
    receiver would reject the callback anyway."""
    base = (settings.BACKEND_PUBLIC_URL or "").strip().rstrip("/")
    if not base:
        raise ProviderNotConfigured(
            f"BACKEND_PUBLIC_URL unset — cannot build the {path} webhook callback URL."
        )
    if not secret:
        raise ProviderNotConfigured(
            f"Webhook secret unset — refusing to submit a job whose {path} callback "
            "could not be authenticated."
        )
    return f"{base}/api/v1/webhooks/{path}?secret={secret}"


def _fal_webhook_url() -> str:
    return _webhook_url("fal", settings.FAL_WEBHOOK_SECRET)


def _fashn_webhook_url() -> str:
    return _webhook_url("fashn", settings.FASHN_WEBHOOK_SECRET)


def _submit_to_fal(job: AIJob) -> str:
    """Submit a fal job and return its provider request id.

    Dispatches by `job.kind`. Currently `standardize` (FLUX Kontext Pro). The
    fal service guards on FAL_API_KEY; we additionally need BACKEND_PUBLIC_URL to
    tell fal where to call back. Either missing → ProviderNotConfigured (job
    stays pending, retryable once configured).
    """
    webhook_url = _fal_webhook_url()

    if job.kind == "standardize":
        image_url = (job.input or {}).get("image_url")
        if not image_url:
            raise RuntimeError("standardize job missing input.image_url")
        try:
            return fal_service.submit_kontext(
                image_url=image_url,
                webhook_url=webhook_url,
                prompt=(job.input or {}).get("prompt"),
            )
        except fal_service.ProviderNotConfigured as exc:
            raise ProviderNotConfigured(str(exc))

    if job.kind == "editorial":
        # Approach A editorial pass: segment the subject (sync), then submit the
        # inpaint that polishes the non-dress region (async + webhook).
        tryon_image_url = (job.input or {}).get("image_url")
        if not tryon_image_url:
            raise RuntimeError("editorial job missing input.image_url (tryon output)")
        try:
            # Mask the BACKGROUND (dress/subject protected) for the editorial pass.
            mask_url = fal_service.background_mask_url(image_url=tryon_image_url)
            return fal_service.submit_editorial_inpaint(
                image_url=tryon_image_url,
                mask_url=mask_url,
                webhook_url=webhook_url,
                prompt=(job.input or {}).get("prompt"),
            )
        except fal_service.ProviderNotConfigured as exc:
            raise ProviderNotConfigured(str(exc))

    raise NotImplementedError(f"fal submit for kind={job.kind!r} not wired yet.")


def _submit_to_fashn(job: AIJob) -> str:
    """Submit a FASHN job and return its provider job id.

    `tryon` (Approach A): FASHN tryon-max, async + webhook. The legacy sync
    `run_tryon` (live-call path) is unchanged.
    """
    if job.kind == "tryon":
        person_url = (job.input or {}).get("person_image_url")
        garment_url = (job.input or {}).get("garment_image_url")
        if not person_url or not garment_url:
            raise RuntimeError("tryon job missing person_image_url/garment_image_url")
        webhook_url = _fashn_webhook_url()
        try:
            return fashn_service.submit_tryon_async(
                person_image_url=person_url,
                garment_image_url=garment_url,
                webhook_url=webhook_url,
                model_name=(job.input or {}).get("model_name", "tryon-max"),
            )
        except fashn_service.ProviderNotConfigured as exc:
            raise ProviderNotConfigured(str(exc))

    raise NotImplementedError(f"FASHN submit for kind={job.kind!r} not wired yet.")


_DISPATCH = {
    "fal": _submit_to_fal,
    "fashn": _submit_to_fashn,
}


def submit_job(db: Session, *, job: AIJob) -> AIJob:
    """Submit a pending job to its provider.

    On success: status -> submitted, provider_job_id stored.
    If the provider is not configured yet: job stays `pending` (no error state —
    it can be retried once the key lands), and we log it.
    On a real submit error: status -> failed with the message.
    """
    submit = _DISPATCH.get(job.provider)
    if submit is None:
        return crud_ai_job.mark_failed(
            db, db_obj=job, error=f"Unknown provider: {job.provider!r}"
        )

    try:
        provider_job_id = submit(job)
    except ProviderNotConfigured as exc:
        # Not an error the user caused — keep the job pending so it can be
        # picked up once the key is configured.
        logger.warning("AIJob %s left pending: %s", job.id, exc)
        return job
    except NotImplementedError as exc:
        logger.info("AIJob %s submit not implemented yet: %s", job.id, exc)
        return job
    except Exception as exc:  # pragma: no cover - real provider failures
        logger.exception("AIJob %s submit failed", job.id)
        return crud_ai_job.mark_failed(db, db_obj=job, error=str(exc))

    return crud_ai_job.mark_submitted(db, db_obj=job, provider_job_id=provider_job_id)


# ── Synchronous finishing jobs (upscale, qa) ─────────────────────────────────
# Topaz and Gemini return results immediately, so these jobs go straight from
# pending -> completed (or failed) in one call — no webhook. Used by the SP5
# finishing chain.


def run_sync_job(db: Session, *, job: AIJob) -> AIJob:
    """Run a synchronous provider job to completion. Returns the updated job.

    `upscale` (fal Topaz): input.image_url -> result.images[0].url
    `qa` (gemini): input.image_url + input.reference_url -> result (rubric)
    """
    try:
        if job.kind == "tryon":
            # gpt-image-2 swap engine: synchronous, no webhook. Composite the
            # selected dress onto the customer photo and store the result.
            from app.services import openai_images

            person_url = (job.input or {}).get("person_image_url")
            garment_url = (job.input or {}).get("garment_image_url")
            if not person_url or not garment_url:
                raise RuntimeError(
                    "tryon job missing person_image_url/garment_image_url"
                )
            url = openai_images.run_tryon(
                person_image_url=person_url, garment_image_url=garment_url
            )
            return crud_ai_job.mark_completed(
                db, db_obj=job, result={"images": [{"url": url}]}
            )

        if job.kind == "upscale":
            image_url = (job.input or {}).get("image_url")
            if not image_url:
                raise RuntimeError("upscale job missing input.image_url")
            url = fal_service.upscale_topaz(image_url=image_url)
            return crud_ai_job.mark_completed(
                db, db_obj=job, result={"images": [{"url": url}]}
            )

        if job.kind == "qa":
            from app.services import gemini as gemini_service

            image_url = (job.input or {}).get("image_url")
            reference_url = (job.input or {}).get("reference_url")
            if not image_url or not reference_url:
                raise RuntimeError("qa job missing input.image_url/reference_url")
            rubric = gemini_service.run_qa(image_url=image_url, reference_url=reference_url)
            return crud_ai_job.mark_completed(db, db_obj=job, result=rubric)

        raise NotImplementedError(f"run_sync_job for kind={job.kind!r} not supported.")

    except (fal_service.ProviderNotConfigured,) as exc:
        logger.warning("Sync job %s left pending: %s", job.id, exc)
        return job
    except Exception as exc:
        # gemini ProviderNotConfigured is raised lazily inside the qa branch;
        # treat a missing-key as pending, real errors as failed.
        msg = str(exc)
        if "not configured" in msg:
            logger.warning("Sync job %s left pending: %s", job.id, msg)
            return job
        logger.exception("Sync job %s failed", job.id)
        return crud_ai_job.mark_failed(db, db_obj=job, error=msg)
