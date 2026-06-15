# AI Try-On Pipeline — Tools per Step (Approach A)

Which tool runs at each step of the production pipeline, and which vendor it belongs to.

**Vendors:** `▣ FASHN` (already have) · `◆ fal.ai` (new) · `● Google/Gemini` (new) · `○ OpenAI` (optional, bake-off only)

---

## Flow

```
STEP 1 — STANDARDIZATION            (per dress · one-time · ~$0.04)
  Boutique's 4 raw angle photos (front/back/left/right) + swatch
        │
        ▼
  ◆ FLUX KONTEXT (fal.ai)   "do not change color/shape/lace/length"
        │
        ▼
  clean studio garment image  ──►  boutique Accept / Regenerate / Upload-manually
        │  approved "standardized_image"
        ▼
STEP 2 — TRY-ON + EDITORIAL         (per customer · ~$0.35–0.50)
  standardized dress  +  customer full-body photo
        │
        ▼
  2a. ▣ FASHN tryon-max     ──►  real dress placed on customer (~$0.30)
        │
        ▼
  2b. ◆ SEGMENTATION (fal)  ──►  mask around dress   🔒 DRESS LOCKED
        │
        ▼
  2c. ◆ FLUX KONTEXT (fal)  ──►  relight · skin · pose · background
      (or ● Nano Banana Pro)     ⚠️ masked dress pixels UNTOUCHABLE
        │                         ↑ bake-off decides Kontext vs Nano Banana
        ▼  3 samples (different seeds)
STEP 3 — FINISHING                  (~$0.05)
  ◆ TOPAZ upscale (fal)     ──►  ~2048px   (NO editing on dress region, ever)
        │
        ▼
STEP 4 — AUTOMATED QA               (~$0.01–0.03)
  ● GEMINI 3.1 Pro          ──►  score vs standardized reference:
      • Dress (STRICT): lace, beading, train, length, color
      • Body  (LOOSE):  not slimmed / reshaped
        │
        ├── pass ──► ✅ ship
        ├── fail ──► 🔁 regenerate (new seed, max N retries)
        └── hero/marketing ──► 👤 human review queue
```

---

## Tool-by-vendor summary

| Vendor | Tool | Step | Status |
|---|---|---|---|
| ▣ FASHN | tryon-max | 2a | Have it · confirm plan allows tryon-max |
| ◆ fal.ai | FLUX Kontext | 1 + 2c | **NEW — the must-have vendor** |
| ◆ fal.ai | Segmentation / mask | 2b | New (same account) |
| ◆ fal.ai | Topaz upscale | 3 | New (same account) |
| ◆ fal.ai | Kling | — | Bake-off only |
| ● Google | Gemini 3.1 Pro (QA) | 4 | New |
| ● Google | Nano Banana | 2c option / Step 1 alt | New (same account) |
| ○ OpenAI | GPT Image | — | Optional · bake-off only (Approach B) |

**Total ≈ $0.25–0.70 per finished image.** Step 1 (standardization) is one-time per dress and amortizes across every customer who tries that dress.

---

## Key design note

The whole point of Approach A is **Step 2b (the mask)**. Once the dress is segmented and locked, the editorial pass in 2c physically cannot alter lace/beading/train — it only repaints background, skin, and lighting. That's what guarantees the "dress 100% locked" rule for heavy-detail wedding gowns, instead of hoping a prompt is respected.
