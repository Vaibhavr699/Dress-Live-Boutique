# AI Try-On — Sub-project 4: Try-On + Editorial (Approach A) (Design)

**Date:** 2026-06-15
**Status:** Approved for implementation
**Depends on:** SP1, SP2 (standardized_image_url), SP3 (async job backbone)
**Keys:** needs FASHN (tryon-max) + FAL_API_KEY + BACKEND_PUBLIC_URL. Built full;
provider calls key-guarded — jobs stay `pending` without keys.

## Approach A (production default)

Place the real dress on the customer, lock the dress region with a mask, then
beautify everything around it. The dress is never regenerated.

```
customer photo + dress.standardized_image_url
  [1] tryon (fashn, tryon-max)            -> dress placed on customer
        webhook completed -> chain spawns:
  [2] editorial (fal)
        2a BiRefNet segmentation (sync)    -> subject/dress mask
        2b invert mask                      -> "everything except dress"
        2c Kontext/inpaint (async+webhook)  -> relight/skin/background polish
        webhook completed -> FINAL image
```

## Chaining (Option A — in the webhook hook)

`_on_job_completed` already branches on `job.kind`:
- `tryon` completed -> create `editorial` AIJob (parent_job_id = tryon job),
  carrying tryon output url; submit it.
- `editorial` completed -> pipeline done; its result is the final image.

A new self-referential `parent_job_id` column links steps. The app polls the head
`tryon` job; the final result is the editorial job's result (found via the chain
or surfaced onto the head job).

Segmentation is done inside the editorial submit (BiRefNet sync call) to keep the
chain to two webhook hops, then the inpaint is async with a webhook.

## Schema
- add `aijob.parent_job_id` (int, self-FK aijob.id, nullable, indexed).

## Services (all key-guarded, submit-and-webhook)
- `fashn.submit_tryon_async(*, person_image_url, garment_image_url, model_name, webhook_url) -> id`
- `fal.submit_birefnet(*, image_url) -> mask_url`  (sync; small)
- `fal.submit_editorial_inpaint(*, image_url, mask_url, prompt, webhook_url) -> request_id`
- editorial prompt: relight + studio/editorial background + skin/posture polish,
  explicitly NOT touching the dress (it's masked anyway).

## Job runner
- `_submit_to_fashn`: kind=tryon -> submit_tryon_async (model tryon-max).
- `_submit_to_fal`: kind=editorial -> birefnet (sync) -> invert -> inpaint (async).

## Endpoint
- `POST /ai/tryon` (multipart: dress_id, full_body_file, optional booking_id).
  Validates a person is present (reuse `_validate_human_present`). Requires
  `dress.standardized_image_url` (else 400 "standardize this dress first").
  Uploads the customer photo to storage, creates the head `tryon` AIJob, submits.
  Returns AIJobRead. App polls `GET /ai/jobs/{id}`.

## Mask inversion note
BiRefNet returns a subject mask (white = subject incl. dress). For "lock the dress,
repaint around it" the editorial inpaint must edit the COMPLEMENT. Implemented by
requesting the dress region be preserved; for v1 we segment the SUBJECT and inpaint
the background only (mask = inverted subject). Dress-only protection within the
subject is refined in SP5 QA + a future mask op; v1 protects the whole subject,
which already guarantees the dress is untouched.

## Out of scope
- 3 samples/seeds selection, upscale, QA, auto-regenerate -> SP5.
- Frontend surfacing of the editorial result -> wired where try-on is consumed
  (preview + live call already poll/consume a result image); SP4 ships the
  pipeline + endpoint. A thin frontend hook can follow.

## Safety & testing
- Additive migration (nullable self-FK). Verify up/down.
- Full chain testable with no keys: each step stays pending; simulated webhooks
  advance tryon -> editorial -> final.
- Unknown/dup webhooks already handled by SP3.
