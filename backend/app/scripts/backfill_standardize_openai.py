"""Backfill `standardized_image_url` for legacy dresses using gpt-image-2 (no fal).

WHY
Old dresses have only a raw `image_url` (the gown on a model with a busy
background). When the gpt-image-2 try-on uses that as the garment reference it
can't cleanly replace the background, so the result looks worse than dresses that
have a clean `standardized_image_url`. This script cleans each old photo into a
plain-background, ghost-mannequin catalog image of the SAME dress with
`openai_images.standardize_garment` and stores it — the OpenAI-only equivalent of
the fal/4-angle standardization.

Unlike the fal backfill this is SYNCHRONOUS (gpt-image-2 has no webhook): submit,
get the cleaned image back in the same call, set `standardized_image_url`. One
pass, no accept step.

REQUIREMENTS
Run where the backend env is configured with an OPENAI_API_KEY whose project has
gpt-image-2 access. Run server-side on Railway, e.g.:

    # 1. Dry-run — list which dresses would be cleaned (no writes / no API calls):
    python -m app.scripts.backfill_standardize_openai

    # 2. Clean a few and inspect the results before doing the whole catalog:
    python -m app.scripts.backfill_standardize_openai --apply --limit 5

    # 3. Run the rest:
    python -m app.scripts.backfill_standardize_openai --apply

Scope flags: --boutique-id N, --limit N, --ai-enabled-only.

Idempotent: dresses that already have a `standardized_image_url` are skipped, so
re-running is safe. Each dress = one gpt-image-2 call (cost + ~30s-2min).
"""

from __future__ import annotations

import argparse

from app.crud.crud_dress import crud_dress
from app.crud.crud_dress_image import crud_dress_image
from app.db.session import SessionLocal
from app.models.dress import Dress
from app.schemas.dress_image import DressImageCreate
from app.services import openai_images


def _source_image(dress: Dress) -> str:
    """The single raw image we clean. Prefer the product photo; fall back to the
    AI-engine path. Mirrors the try-on fallback so we clean whatever the try-on
    would otherwise have used as the garment reference."""
    return (getattr(dress, "image_url", None) or getattr(dress, "ai_model_url", None) or "").strip()


def _candidates(db, *, boutique_id: int | None, ai_enabled_only: bool, limit: int | None):
    """Dresses lacking a standardized image but having a usable source image."""
    q = db.query(Dress).filter(
        (Dress.standardized_image_url.is_(None)) | (Dress.standardized_image_url == "")
    )
    if boutique_id is not None:
        q = q.filter(Dress.boutique_id == boutique_id)
    if ai_enabled_only:
        q = q.filter(Dress.is_ai_enabled.is_(True))
    rows = [d for d in q.order_by(Dress.id.asc()).all() if _source_image(d)]
    return rows[:limit] if limit else rows


def _process_one(db, dress: Dress) -> bool:
    """Clean one dress's image with gpt-image-2 and set standardized_image_url.
    Returns True on success. Never raises — logs and skips on failure so one bad
    image doesn't abort the whole run."""
    src = _source_image(dress)
    try:
        url = openai_images.standardize_garment(image_url=src)
    except Exception as exc:
        print(f"  dress {dress.id}: standardize FAILED — {exc}")
        return False
    crud_dress_image.create(
        db, dress_id=dress.id, obj_in=DressImageCreate(role="standardized", url=url, position=0)
    )
    dress.standardized_image_url = url
    dress.standardization_status = "approved"
    db.add(dress)
    db.commit()
    print(f"  dress {dress.id}: standardized → {url}")
    return True


def main() -> None:
    ap = argparse.ArgumentParser(description="OpenAI-only backfill of standardized dress images.")
    ap.add_argument("--apply", action="store_true", help="Actually clean + write (default: dry-run list).")
    ap.add_argument("--boutique-id", type=int, default=None, help="Only this boutique.")
    ap.add_argument("--ai-enabled-only", action="store_true", help="Only is_ai_enabled dresses.")
    ap.add_argument("--limit", type=int, default=None, help="Cap how many dresses to process.")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        cands = _candidates(
            db, boutique_id=args.boutique_id, ai_enabled_only=args.ai_enabled_only, limit=args.limit
        )
        print(f"Found {len(cands)} legacy dress(es) without a standardized image (with a usable source image).")
        for d in cands:
            print(f"  - dress {d.id} (boutique {d.boutique_id}) src={_source_image(d)[:70]}")

        if not args.apply:
            print("\nDry-run. Re-run with --apply (add --limit 5 to sanity-check a few first).")
            return

        print(f"\nCleaning {len(cands)} dress(es) with gpt-image-2...")
        ok = sum(1 for d in cands if _process_one(db, d))
        print(f"\nDone. Standardized {ok} of {len(cands)}.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
