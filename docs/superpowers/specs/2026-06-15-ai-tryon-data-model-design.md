# AI Try-On — Sub-project 1: Data Model & Storage (Design)

**Date:** 2026-06-15
**Status:** Approved for implementation
**Scope:** The storage foundation for the AI Try-On standardization pipeline. Pure data plumbing — **no AI calls, no API keys required.**

## Context

The AI Try-On pipeline (full design tracked separately) needs to store, per dress:
- 4 required angle photos (front / back / left / right)
- optional detail photos (lace / embroidery / train / fabric)
- 1 reference color swatch
- 1 standardized (studio) image
- standardization approval state

The current model ([backend/app/models/dress.py](../../../backend/app/models/dress.py)) has only a single `ai_model_url` string, which is insufficient. This sub-project adds the schema + CRUD + endpoints to hold the above. It deliberately does NOT generate the standardized image (that's sub-project 2) or call any AI engine.

## Decisions (locked)

1. **Separate `DressImage` table** (one row per image), NOT a JSON blob — matches existing child-table pattern (`OrderItem`, `ShortlistItem`, `TeamMember`).
2. **Full state machine** for standardization status, NOT a boolean — supports the later Accept / Regenerate / Upload-manually validation screen.

## Schema

### New table `dressimage`
(`Base` auto-names table = lowercase classname → `dressimage`)

| Column | Type | Notes |
|---|---|---|
| id | int PK | |
| dress_id | int FK → dress.id | indexed, `ondelete=CASCADE` |
| role | str | `front`/`back`/`left`/`right`/`detail`/`swatch`/`standardized` |
| url | str | Supabase public URL |
| position | int | ordering within a role (multiple `detail` shots); default 0 |
| created_at | datetime | server default now() |

### New columns on `dress` (additive, nullable — safe migration)

| Column | Type | Default | Notes |
|---|---|---|---|
| standardization_status | str | `'none'` | `none`→`pending`→`ready`→`approved`/`manual` |
| standardized_image_url | str | null | fast pointer to the approved standardized image |

`standardized_image_url` mirrors the approved `standardized` row so the try-on path reads one field cheaply; the row preserves regeneration history.

### State machine
```
none ──uploads complete, Step 1 runs──► pending
pending ──Kontext returns──► ready
ready ──boutique Accept──► approved
ready ──boutique Upload-manually──► manual
ready ──boutique Regenerate──► pending
```
Sub-projects 2–5 key off this column. Sub-project 1 only stores/reads it.

## Components

- `app/models/dress_image.py` — `DressImage` model; register in `app/db/base.py`
- `app/models/dress.py` — add 2 columns + `images` relationship (cascade delete)
- `alembic/versions/<rev>_add_dress_images_and_standardization.py` — create table + 2 columns; working `downgrade`
- `app/schemas/dress_image.py` — `DressImageBase/Create/Read`
- `app/schemas/dress.py` — add `standardization_status`, `standardized_image_url`, `images`
- `app/crud/crud_dress_image.py` — `CRUDDressImage` (create, get_multi_by_dress, get_by_role, remove) mirroring `CRUDDress`
- `app/api/v1/endpoints/dresses.py` — add: attach image, list images, remove image (partner + boutique scoped, reusing `_upload_image_to_storage` with folder `dress-standardization`)

## Out of scope (later sub-projects)
- 4-angle upload wizard UI → SP2
- FLUX Kontext standardization generation → SP2
- Async jobs / webhooks → SP3
- Try-on / QA → SP4/SP5

## Safety & testing
- Migration is additive (new table + nullable columns) → no risk to existing dresses; `downgrade` drops cleanly.
- Existing dresses unaffected: `standardization_status` defaults to `none`; live try-on still falls back to `ai_model_url`/`image_url`.
- Verify `alembic upgrade head` then `downgrade -1` both run.
- Existing role checks (`partner`, boutique-scoped) reused from current dresses.py endpoints.
