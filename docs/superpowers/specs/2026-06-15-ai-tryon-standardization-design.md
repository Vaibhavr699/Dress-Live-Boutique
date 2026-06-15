# AI Try-On — Sub-project 2: Standardization + Setup Wizard (Design)

**Date:** 2026-06-15
**Status:** Approved for implementation
**Depends on:** SP1 (dress images + standardization columns), SP3 (async job backbone)
**Keys:** needs `FAL_API_KEY` to run the real Kontext call. Built full; the fal
HTTP submit is guarded — without the key the standardize job stays `pending`.

## Goal

Boutique enables AI Try-On on a dress, uploads 4 angle photos (+ optional detail
shots + swatch), the backend generates a standardized studio image via FLUX
Kontext Pro (async, on the SP3 backbone), and the boutique Accepts / Regenerates
/ Uploads-manually.

## Backend

### fal Kontext submit (wired into SP3 job_runner)
- `app/services/fal.py` — `submit_kontext(*, image_url, prompt, webhook_url) -> request_id`.
  - `POST https://queue.fal.run/fal-ai/flux-pro/kontext?fal_webhook=<webhook_url>`
  - header `Authorization: Key <FAL_API_KEY>`, body `{prompt, image_url}`.
  - Guarded on `FAL_API_KEY` (raises `ProviderNotConfigured` when unset).
- `job_runner._submit_to_fal` dispatches `kind="standardize"` → `submit_kontext`
  using `input.image_url` (the FRONT angle — Kontext edits a single image) and a
  garment-locking `input.prompt`. The other angles/swatch are stored as
  DressImage rows for reference/history.

### Endpoints (in dresses.py)
- `POST /dresses/{id}/standardize` — partner+boutique scoped. Requires the 4
  required angles present. Creates an AIJob(kind=standardize, provider=fal,
  dress_id), sets `dress.standardization_status="pending"`, submits via
  job_runner, returns the AIJob. (If fal not configured, job stays pending and we
  say so — no crash.)
- `POST /dresses/{id}/standardize/accept` — sets status `approved`, copies the
  standardized image URL into `dress.standardized_image_url` and as a
  `standardized`-role DressImage row.
- `POST /dresses/{id}/standardize/manual` — body `{url}`; status `manual`, sets
  `standardized_image_url` to the uploaded URL.
- Regenerate = call `/standardize` again (status → pending).

### Webhook completion (already in SP3)
The fal webhook marks the AIJob completed with `result.images[0].url`. SP2 adds a
small hook: on a completed `standardize` job, set `dress.standardization_status =
"ready"` and store the result url on the job (boutique then Accepts). This runs
inside the existing fal webhook handler, keyed on `job.kind == "standardize"`.

### Garment-locking prompt (constant)
"Studio ghost-mannequin product photo of this dress on a plain white background.
Do not change the dress color, shape, fabric, lace, embroidery, beading, train,
or length. Centered, even lighting, e-commerce catalog style."

## Frontend (boutique-app/app/add-dress.tsx)

- The "AI TRY ON" service toggle already exists. When selected, replace the single
  AI garment slot with a **4-slot grid** (Front / Back / Left / Right) + optional
  detail slots + a swatch slot, each showing Missing / Uploaded / Replace.
- **Setup completeness** indicator (renamed from "Quality Score"): 4 required =
  25% each → Poor / Good / Excellent.
- On save (AI enabled): upload each slot via `POST /dresses/{id}/images` (SP1),
  then call `POST /dresses/{id}/standardize`.
- **Validation screen**: poll `GET /ai/jobs/{id}` until `ready`; show original vs
  standardized with Accept / Regenerate / Upload-manually buttons.
- Keep it additive: unchecking AI Try-On = today's behavior, untouched.

## Out of scope
- Try-on generation (SP4), finishing/QA (SP5).
- The 3-button validation screen MAY ship as a follow-up screen if add-dress grows
  too large; spec allows either inline or a dedicated `standardize-review` screen.

## Safety & testing
- Backend endpoints verifiable with no key (job stays pending; status transitions
  for accept/manual fully testable).
- When `FAL_API_KEY` lands: real Kontext submit returns a request_id; the existing
  SP3 fal webhook completes the job; the standardize hook flips status to ready.
- No change to existing dresses or the non-AI add-dress path.
