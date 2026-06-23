# AI Try-On — Sub-project 3: Async Job Infrastructure (Design)

**Date:** 2026-06-15
**Status:** Approved for implementation
**Scope:** A generic job table + webhook backbone for all multi-step AI calls
(standardize, tryon, editorial, upscale, qa). Everything downstream (SP2 wizard,
SP4 try-on, SP5 finishing/QA) runs on this. Provider calls are **stubbed behind
key guards** until API keys are provided.

## Why this is built before SP2

Decision (2026-06-15): standardization should be async/webhook-based from day one
rather than built inline and refactored later. So the async backbone lands first.

## Core decision (locked)

**One generic `aijob` table** (Option A), not a table per job type. The webhook
receiver, status-poll endpoint, and retry logic are written once; per-type
differences live in JSONB `input`/`result`. Type-safety is recovered via typed
Pydantic schemas per `kind` at the API boundary.

## Schema: new table `aijob`

| Column | Type | Notes |
|---|---|---|
| id | int PK | |
| kind | str, indexed | standardize / tryon / editorial / upscale / qa |
| provider | str | fal / fashn |
| status | str, indexed | pending → submitted → completed / failed / canceled |
| provider_job_id | str, nullable, indexed | opaque id from provider; webhook lookup key |
| input | JSONB | request params |
| result | JSONB, nullable | output (urls, scores) |
| error | text, nullable | failure message |
| attempts | int, default 0 | retry counter |
| dress_id | int FK→dress, nullable, indexed | |
| booking_id | int FK→booking, nullable, indexed | |
| created_at | datetime | server default now() |
| updated_at | datetime | server default now(), onupdate now() |

### Status machine
```
pending ──submit──► submitted ──webhook completed──► completed
                        ├──webhook failed──► failed
                        └──cancel──────────► canceled
```

## Components

- `app/models/ai_job.py` — `AIJob`; register in `app/db/base.py`
- `alembic/versions/<rev>_add_ai_job.py` — create table + indexes + nullable FKs
- `app/schemas/ai_job.py` — `AIJobRead`, `AIJobCreate`, per-kind input models
- `app/crud/crud_ai_job.py` — create, get, get_by_provider_job_id,
  mark_submitted/completed/failed, increment_attempts
- `app/services/job_runner.py` — generic submit dispatcher; routes by provider;
  **stubbed behind key guards** (no key → job stays pending, clear message)
- `app/api/v1/endpoints/webhooks.py` — `POST /webhooks/fal`, `POST /webhooks/fashn`
- `app/api/v1/endpoints/ai.py` — `GET /ai/jobs/{id}` status poll
- `app/core/config.py` — `FAL_API_KEY`, `FAL_WEBHOOK_SECRET` (optional, guarded)

## Out of scope
- Per-kind handler logic (Kontext/try-on) → SP2 / SP4
- Auto-regenerate orchestration → SP5
- Frontend (poll endpoint consumed by SP2)

## Safety & testing
- Additive migration, nullable FKs → no impact on existing tables; verify up/down.
- Webhook handlers best-effort (never raise into provider), mirroring the existing
  LiveKit webhook; unknown provider_job_id → 200 ignored, not 500.
- Stubbed providers → full create-job → poll → `pending` flow testable with NO keys.
