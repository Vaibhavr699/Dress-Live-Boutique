# Design: OpenAI gpt-image-2 as the AI Try-On swap engine

**Date:** 2026-06-19
**Status:** Approved (user requested build)

## Goal

Replace FASHN as the primary `tryon` step in the existing AI Try-On pipeline with
OpenAI `gpt-image-2`'s image-edit endpoint. Given the customer's photo and the
selected dress image, `gpt-image-2` composites the real dress onto the person and
produces a luxury-bridal studio result in one call, driven by a fixed locked
prompt (see [gpt-image-2-tryon-prompt.md](../../ai-tryon/gpt-image-2-tryon-prompt.md)).

## Context (existing architecture)

- `AIJob` table + `crud_ai_job` back the whole pipeline. Lifecycle:
  `pending → submitted → completed | failed | canceled`.
- `job_runner.submit_job` = async providers (fal, fashn) that submit + return a
  `provider_job_id` and call back via webhook.
- `job_runner.run_sync_job` = synchronous providers (fal Topaz upscale, gemini
  QA) that run to completion in one call.
- Provider services (`fal.py`, `fashn.py`) use raw `httpx` (no vendor SDK), guard
  on their API key by raising `ProviderNotConfigured`, and on a missing key the
  job is left `pending` (retryable) rather than failed.
- The `tryon` job is created in `app/api/v1/endpoints/ai.py` (~line 1578) with
  `provider="fashn"`, `input={person_image_url, garment_image_url, model_name}`.

## Decisions

1. **Role:** gpt-image-2 *replaces* FASHN as the swap engine. FASHN code stays in
   the tree (legacy live-call path `run_tryon` untouched) but is no longer the
   default for new `tryon` jobs.
2. **Execution:** synchronous. OpenAI's `/v1/images/edits` returns the image
   (base64) in the response — no webhook. Runs via the existing `run_sync_job`
   path, dispatched in a background task so the API returns immediately.
3. **Quality:** `quality="high"` (config-overridable). Customers scrutinize the
   garment closely; fidelity matters more than per-image cost (~$0.21+/image).
4. **Prompt:** one fixed locked `TRYON_PROMPT` for every user (the luxury-bridal
   prompt). Inputs are the only thing that varies (woman + dress).
5. **Background:** the prompt makes gpt-image-2 produce the white-studio backdrop
   itself, so the downstream fal background-replace step is **skipped** on this
   path (avoids double-processing / conflicting backdrop).
6. **No new dependency:** use `httpx` directly (already a dep), matching fal/fashn.

## Components

### 1. Config — `app/core/config.py`
```
OPENAI_API_KEY: Optional[str] = None
OPENAI_IMAGE_MODEL: str = "gpt-image-2"
OPENAI_IMAGE_QUALITY: str = "high"
OPENAI_TIMEOUT_SECONDS: int = 180
```

### 2. New service — `app/services/openai_images.py`
- `class ProviderNotConfigured(Exception)` — raised when `OPENAI_API_KEY` unset.
- `TRYON_PROMPT` — the locked luxury-bridal prompt (verbatim from the doc).
- `run_tryon(*, person_image_url, garment_image_url, quality=None, timeout=None) -> str`:
  1. guard on key (else `ProviderNotConfigured`),
  2. download both images via httpx (bytes + content-type),
  3. POST multipart to `https://api.openai.com/v1/images/edits` with
     `model=gpt-image-2`, `image[]=person`, `image[]=garment` (order: woman
     first, dress second — the prompt references "source image" then "garment
     reference"), `prompt=TRYON_PROMPT`, `quality`, `size=auto`, `n=1`,
  4. read `data[0].b64_json`, decode, `storage.upload_bytes(folder="tryon-openai",
     content_type="image/png")`, return the public URL.
  - Surface OpenAI error bodies on `>=400` (esp. `billing_hard_limit_reached`,
    `403 must be verified`) as `RuntimeError` with the message, so the job
    `error` column is actionable.

### 3. Dispatcher — `app/services/job_runner.py`
- `run_sync_job` gains a `kind="tryon"` + `provider="openai"` branch:
  reads `input.person_image_url` / `input.garment_image_url`, calls
  `openai_images.run_tryon`, then `crud_ai_job.mark_completed(result={"images":
  [{"url": url}]})` (same result shape `_result_image_url` already parses).
  Missing-key → left `pending` (the existing "not configured" handling already
  catches `"not configured"` in the message).

### 4. Entry point — `app/api/v1/endpoints/ai.py` (~1578)
- New `tryon` jobs: `provider="openai"`, `input={person_image_url,
  garment_image_url}` (drop `model_name`, which was FASHN-specific).
- Run via `run_sync_job` in a background task (FastAPI `BackgroundTasks`) so the
  HTTP response returns the `pending` job immediately; the image is produced
  asynchronously and the existing status-poll endpoint surfaces the result.

## Data flow

```
customer photo + dress image
  -> POST /api/v1/.../tryon  (ai.py)
  -> validate person, upload customer photo to storage
  -> crud_ai_job.create(kind=tryon, provider=openai, input={person_url, garment_url})
  -> BackgroundTasks: job_runner.run_sync_job(job)
       -> openai_images.run_tryon(person_url, garment_url)
            -> download both images
            -> POST /v1/images/edits (gpt-image-2, locked prompt, quality=high)
            -> upload result -> public URL
       -> crud_ai_job.mark_completed(result={images:[{url}]})
  -> client polls job status -> gets result image URL
```

## Error handling

- **No key:** `ProviderNotConfigured` → job stays `pending` (retryable once key
  lands). No user-facing error.
- **Billing hard limit / not verified / other 4xx-5xx:** `RuntimeError` with
  OpenAI's message → `mark_failed(error=...)`. Visible in the job row for ops.
- **Timeout:** httpx timeout (`OPENAI_TIMEOUT_SECONDS`, default 180s) →
  `mark_failed`.
- **Empty/malformed response:** explicit `RuntimeError` → `mark_failed`.

## Testing

- **Service unit test (mocked httpx):** `run_tryon` builds the right multipart
  request and returns the uploaded URL; `ProviderNotConfigured` when key unset;
  RuntimeError surfaces OpenAI error body.
- **Live smoke test:** once OpenAI billing limit is raised, run one real
  `gpt-image-2` generation end-to-end (person + dress → result URL) and eyeball
  the output. Blocked today by `billing_hard_limit_reached` (account setting,
  not code).

## Out of scope

- Frontend changes (the existing try-on UI already creates the job + polls).
- Removing FASHN (kept as fallback / legacy live-call path).
- Per-user prompt customization (one locked prompt by design).
