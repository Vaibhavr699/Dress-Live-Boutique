# gpt-image-2 Try-On Prompt (canonical)

This is the locked instruction sent with **every** OpenAI `gpt-image-2` try-on
edit. Inputs: `image=[source_woman, garment_dress]`. Output: one generated image.

It is stored here as the source of truth; the running copy lives as the
`TRYON_PROMPT` constant in `app/services/openai_images.py`. Keep the two in sync.

---

```text
Luxury bridal virtual try-on. Reconstruct, do not create.

Place the exact dress from the garment reference onto the exact woman
from the source image. Produce a result indistinguishable from a real
luxury bridal photoshoot.

LOCKED — DO NOT MODIFY
Face, hair, and dress are read-only regions.

This woman. Same face, identity, skin tone, expression, hair color,
hairstyle, body shape, proportions, pose. No beautification.
No new face. No identity drift.

This dress. Same design, silhouette, fabric, color, embroidery, lace,
beadwork, stitching, train, transparency, all details.
No redesign. No reinterpretation. No simplification.

FIT
Dress worn naturally on this body.
Realistic fabric physics, draping, tension, folds, occlusion, and shadows.
Genuinely worn from within, never pasted, overlaid, or composited.

VOLUME PRESERVATION
Preserve the exact skirt volume, fullness, silhouette, and structure
from the garment reference.
The skirt must maintain the same width, shape, projection, and visual
presence as shown in the reference image.
Do not flatten, compress, collapse, narrow, reduce, or pull the skirt
closer to the body.
Preserve the original bridal silhouette, including any internal structure,
crinoline effect, underskirt volume, architectural shape,
or fabric-supported fullness.
The perceived volume of the lower part of the dress must remain identical
to the garment reference.
When fitting the dress to the woman, adapt the dress to the body
without reducing the original volume of the skirt.
A bridal gown must preserve its original silhouette
before preserving body conformity.

PREMIUM PHOTOGRAPHY DIRECTION
Enhance the photograph, never the woman and never the dress.

Exceptional studio lighting quality. Refined light sculpting on the dress.
Luxury editorial depth. Natural subject separation from background.
Premium fabric texture visibility. Elegant shadow transitions.
Realistic light falloff. High-end optical realism.
Professional medium-format camera look. Clean highlight control.
Rich dynamic range. Natural skin rendering.
Ultra-detailed fabric rendering. Subtle cinematic dimensionality.

The image should feel expensive, elegant, and premium.
Create the wow effect through photography alone.

The result should feel like a premium bridal e-commerce campaign shot for a
high-end fashion catalog — the clean, elevated look of Zara and Zalando lookbooks —
with a medium-format studio camera and even, world-class catalog lighting.

The woman is unchanged. The dress is unchanged. Only the photography is elevated.

BACKGROUND
Replace the original background with a soft, clean white fashion studio backdrop.

Seamless white sweep from wall to floor, no visible horizon line.
Soft, even, diffused lighting; a gentle grounding shadow beneath the subject.
Soft luminous off-white to white tone — never a harsh, flat, or blown-out pure white.
The elegant, minimal, premium look of a high-end fashion catalog.
No people, no objects, no furniture, no lighting equipment, no light stands,
no windows, no patterns, no text.
Lighting and rendering consistent with the premium photography direction above.

Only the background changes.
The woman and dress remain identical.

OUTPUT
This woman. This dress. Soft white studio. Real photoshoot. No visible AI.
```

---

## Notes / implications

- **Image order matters.** `image[0]` = source woman, `image[1]` = garment dress.
  The prompt refers to "source image" and "garment reference" — wire the call so
  the order matches.
- **Background.** This prompt makes `gpt-image-2` produce a soft, clean white
  studio backdrop itself. The fal background-replace step is therefore redundant
  on the OpenAI try-on path and should be skipped to avoid double-processing / a
  conflicting backdrop.
- **Fidelity caveat.** `gpt-image-2` regenerates the scene; it does not preserve
  source pixels byte-for-byte. The LOCKED language minimizes identity/garment
  drift but cannot guarantee zero drift. Acceptable for a premium try-on preview;
  FASHN was more literal for catalog-exact reproduction.
- **Quality.** Sent at `quality="high"` per the design decision.
