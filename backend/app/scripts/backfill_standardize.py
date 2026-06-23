"""Backfill `standardized_image_url` for legacy single-image dresses.

WHY
Old dresses were added with only a legacy `image_url` (no front/back/left/right
angle images), so they never went through Step-1 standardization. The gpt-image-2
try-on (`/ai/tryon`) falls back to that raw `image_url`, which the model can't
cleanly read — producing poor results vs. dresses that have a clean
`standardized_image_url`. This script runs the SAME fal (FLUX Kontext) standardize
pipeline on each such dress using its single existing image, then accepts the
result — exactly what `POST /{id}/standardize` + `/standardize/accept` do in the
UI, but bypassing the 4-angle gate (the pipeline only needs one input image).

QUALITY NOTE
Standardizing from one (possibly on-model) image is less reliable than from 4
clean angles. The result still beats the raw fallback; spot-check the output and
re-shoot the worst offenders with 4 sides.

REQUIREMENTS (server-side)
Run where the backend env is configured: FAL_API_KEY + BACKEND_PUBLIC_URL must be
set (the standardize step is async via fal webhook). Run it on Railway, e.g.:

    # 1. See what would be touched (no writes):
    python -m app.scripts.backfill_standardize

    # 2. Submit standardize jobs, wait for fal webhooks, then accept:
    python -m app.scripts.backfill_standardize --apply --wait

    # Or split the phases (useful if webhooks are slow):
    python -m app.scripts.backfill_standardize --apply           # submit only
    python -m app.scripts.backfill_standardize --accept-ready     # accept later

Scope flags: --boutique-id N, --limit N, --ai-enabled-only.

This is idempotent: dresses that already have `standardized_image_url`, and
dresses with a standardize job already in flight, are skipped.
"""

from __future__ import annotations

import argparse
import time

from app.crud.crud_ai_job import crud_ai_job
from app.crud.crud_dress import crud_dress
from app.crud.crud_dress_image import crud_dress_image
from app.db.session import SessionLocal
from app.models.ai_job import AIJob
from app.models.dress import Dress
from app.schemas.ai_job import AIJobCreate
from app.schemas.dress_image import DressImageCreate
from app.services import job_runner
from app.services.fal import STANDARDIZE_PROMPT

# Job states that mean "a standardize is already in flight" — don't re-submit.
_IN_FLIGHT = ("pending", "submitted")


def _source_image(dress: Dress) -> str:
    """The single image we feed to standardization. Prefer the raw product photo
    (`image_url`); fall back to the AI-engine path. Mirrors the try-on fallback so
    we standardize whatever the try-on would otherwise have used."""
    return (getattr(dress, "image_url", None) or getattr(dress, "ai_model_url", None) or "").strip()


def _result_image_url(result) -> str | None:
    """Extract the standardized image URL from a completed job's result —
    same shape the fal webhook stores / the accept endpoint reads."""
    if not isinstance(result, dict):
        return None
    images = result.get("images")
    if isinstance(images, list) and images and isinstance(images[0], dict):
        return images[0].get("url")
    output = result.get("output")
    if isinstance(output, str):
        return output
    return None


def _candidates(db, *, boutique_id: int | None, ai_enabled_only: bool, limit: int | None):
    """Dresses lacking a standardized image but having a usable source image."""
    q = db.query(Dress).filter(
        (Dress.standardized_image_url.is_(None)) | (Dress.standardized_image_url == "")
    )
    if boutique_id is not None:
        q = q.filter(Dress.boutique_id == boutique_id)
    if ai_enabled_only:
        q = q.filter(Dress.is_ai_enabled.is_(True))
    q = q.order_by(Dress.id.asc())
    rows = [d for d in q.all() if _source_image(d)]
    return rows[:limit] if limit else rows


def _has_inflight_standardize(db, dress_id: int) -> bool:
    return (
        db.query(AIJob)
        .filter(
            AIJob.dress_id == dress_id,
            AIJob.kind == "standardize",
            AIJob.status.in_(_IN_FLIGHT),
        )
        .first()
        is not None
    )


def _latest_completed_standardize(db, dress_id: int) -> AIJob | None:
    return (
        db.query(AIJob)
        .filter(
            AIJob.dress_id == dress_id,
            AIJob.kind == "standardize",
            AIJob.status == "completed",
        )
        .order_by(AIJob.id.desc())
        .first()
    )


def _submit_one(db, dress: Dress) -> AIJob | None:
    """Create + submit a standardize job for a dress from its single image.
    Returns the job, or None if skipped (already in flight)."""
    if _has_inflight_standardize(db, dress.id):
        print(f"  dress {dress.id}: standardize already in flight — skip")
        return None
    job = crud_ai_job.create(
        db,
        obj_in=AIJobCreate(
            kind="standardize",
            provider="fal",
            dress_id=dress.id,
            input={"image_url": _source_image(dress), "prompt": STANDARDIZE_PROMPT, "swatch_url": None},
        ),
    )
    dress.standardization_status = "pending"
    db.add(dress)
    db.commit()
    job = job_runner.submit_job(db, job=job)
    print(f"  dress {dress.id}: submitted standardize job {job.id} (status={job.status})")
    return job


def _accept_one(db, dress: Dress) -> bool:
    """Accept the latest completed standardize job for a dress — replicates
    `POST /{id}/standardize/accept`. Returns True if accepted."""
    job = _latest_completed_standardize(db, dress.id)
    if job is None:
        return False
    url = _result_image_url(job.result)
    if not url:
        print(f"  dress {dress.id}: completed job {job.id} has no result image — skip")
        return False
    crud_dress_image.create(
        db, dress_id=dress.id, obj_in=DressImageCreate(role="standardized", url=url, position=0)
    )
    dress.standardized_image_url = url
    dress.standardization_status = "approved"
    db.add(dress)
    db.commit()
    print(f"  dress {dress.id}: accepted → standardized_image_url set")
    return True


def main() -> None:
    ap = argparse.ArgumentParser(description="Backfill standardized images for legacy dresses.")
    ap.add_argument("--apply", action="store_true", help="Actually submit standardize jobs (default: dry-run list).")
    ap.add_argument("--wait", action="store_true", help="After --apply, poll until fal webhooks land, then accept.")
    ap.add_argument("--accept-ready", action="store_true", help="Accept dresses whose standardize job already completed.")
    ap.add_argument("--boutique-id", type=int, default=None, help="Only this boutique.")
    ap.add_argument("--ai-enabled-only", action="store_true", help="Only is_ai_enabled dresses.")
    ap.add_argument("--limit", type=int, default=None, help="Cap how many dresses to process.")
    ap.add_argument("--wait-timeout", type=int, default=900, help="Max seconds to wait for webhooks (default 900).")
    ap.add_argument("--poll-interval", type=int, default=10, help="Seconds between webhook polls (default 10).")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        # Accept-only phase: pick up dresses already 'ready' from a prior run.
        if args.accept_ready and not args.apply:
            ready = [
                d for d in _candidates(
                    db, boutique_id=args.boutique_id, ai_enabled_only=args.ai_enabled_only, limit=args.limit
                )
                if d.standardization_status == "ready"
            ]
            print(f"Accept phase: {len(ready)} dress(es) ready to accept.")
            accepted = sum(1 for d in ready if _accept_one(db, d))
            print(f"Done. Accepted {accepted}.")
            return

        cands = _candidates(
            db, boutique_id=args.boutique_id, ai_enabled_only=args.ai_enabled_only, limit=args.limit
        )
        print(f"Found {len(cands)} legacy dress(es) without a standardized image (with a usable source image).")
        for d in cands:
            print(f"  - dress {d.id} (boutique {d.boutique_id}) status={d.standardization_status} src={_source_image(d)[:60]}")

        if not args.apply:
            print("\nDry-run. Re-run with --apply (add --wait to accept automatically).")
            return

        print(f"\nSubmitting standardize jobs for {len(cands)} dress(es)...")
        submitted_ids = []
        for d in cands:
            job = _submit_one(db, d)
            if job is not None:
                submitted_ids.append(d.id)

        if not args.wait:
            print(f"\nSubmitted {len(submitted_ids)}. fal will process async via webhook.")
            print("Run with --accept-ready once jobs complete to set standardized_image_url.")
            return

        # Wait for fal webhooks to mark jobs completed, accepting as they land.
        print(f"\nWaiting up to {args.wait_timeout}s for fal to finish, accepting as ready...")
        deadline = time.monotonic() + args.wait_timeout
        pending = set(submitted_ids)
        accepted = 0
        while pending and time.monotonic() < deadline:
            time.sleep(args.poll_interval)
            db.expire_all()  # re-read rows the webhook updated in another session
            for did in list(pending):
                dress = crud_dress.get(db, id=did)
                if dress is None:
                    pending.discard(did)
                    continue
                job = _latest_completed_standardize(db, did)
                if job is not None and _accept_one(db, dress):
                    accepted += 1
                    pending.discard(did)
            print(f"  ... {accepted} accepted, {len(pending)} still processing")

        if pending:
            print(f"\nTimed out with {len(pending)} still processing: {sorted(pending)}")
            print("Re-run with --accept-ready later to finish them.")
        print(f"\nDone. Accepted {accepted} of {len(submitted_ids)} submitted.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
