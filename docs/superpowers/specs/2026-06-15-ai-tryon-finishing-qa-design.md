# AI Try-On — Sub-project 5: Finishing + QA (Design)

**Date:** 2026-06-15
**Status:** Approved for implementation
**Depends on:** SP1-SP4. Keys now available: FAL + Gemini (+ FASHN).

## Goal

After the editorial image (SP4), finish and quality-gate it:
1. **Upscale** to ~2048px (Topaz via fal).
2. **QA** with Gemini against a structured rubric (dress strict / body loose).
3. **Auto-regenerate** if QA score < threshold (new seed, max N retries).
4. **Human-review queue** for hero/marketing images.

## Sync vs async (key difference from SP4)

Topaz (fal sync) and Gemini QA (REST) return results IMMEDIATELY — no webhook.
So `upscale` and `qa` AIJobs are completed inline by the job_runner (status goes
straight pending→completed in one call), unlike tryon/editorial which wait on a
webhook. They are still AIJob rows for uniformity, retries, and debuggability.

## Chain (extends SP4)

```
... editorial completed (webhook)
      -> upscale job (fal Topaz, sync)        -> 2048px image
      -> qa job (Gemini, sync)                -> rubric JSON + pass/fail
            pass -> head.result.final_image_url = upscaled url; head completed
            fail & attempts < N -> regenerate: new editorial job (new seed)
            fail & attempts >= N -> head.result.needs_review = true (queue)
      hero flag on head -> always needs_review = true (even on pass)
```

The chaining lives in `_on_job_completed` (editorial->upscale->qa) and a small
`_run_finishing_and_qa` helper. Because upscale/qa are sync, the editorial
webhook handler runs them in sequence and updates the head job before returning.

## QA rubric (Gemini structured output)

`responseMimeType=application/json` + `responseSchema`:
```
{
  dress: { color_match, lace_intact, length_correct, no_distortion, score 0-100 },
  body:  { proportions_consistent, not_reshaped, score 0-100 },
  overall_pass: bool, notes: string
}
```
Compare output image vs the dress.standardized_image_url reference. Threshold:
`dress.score >= QA_DRESS_THRESHOLD` (default 75) AND `body.not_reshaped`.

## Schema

Reuse `aijob` (kinds `upscale`, `qa`). Add to head-job result JSON (no schema
change needed): `final_image_url`, `qa` (the rubric), `needs_review` (bool).
Add one column for queue querying: `aijob.needs_review` (bool, default false,
indexed) so the human-review queue is a cheap indexed filter.

## Services (key-guarded)
- `fal.submit_topaz_upscale(*, image_url) -> upscaled_url`  (sync)
- `gemini.run_qa(*, image_url, reference_url) -> dict`       (sync REST)

## Config
- `GEMINI_API_KEY`, `GEMINI_QA_MODEL` (default a current Gemini vision model),
  `QA_DRESS_THRESHOLD` (default 75), `TRYON_MAX_REGEN` (default 2).

## Endpoints (human-review queue)
- `GET  /ai/review-queue` — partner/boutique-scoped: head jobs with
  needs_review=true for the partner's dresses.
- `POST /ai/jobs/{id}/review` — body {approved: bool}: clears needs_review;
  on approve keeps final_image_url, on reject can trigger a regenerate.

## Out of scope
- "3 samples per try-on, QA picks best" — v1 does 1 sample + regenerate-on-fail.
  Multi-sample is a later enhancement (loop in the head job).
- Frontend for the review queue — endpoints only; UI is a follow-up.

## Safety & testing
- Sync provider calls guarded on keys; without keys the job records a clear
  not-configured error (QA/upscale skipped, head still surfaces editorial image).
- Full chain testable with mocked provider functions.
- Additive migration (one nullable bool column).
