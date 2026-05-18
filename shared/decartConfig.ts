/**
 * Decart Lucy 2.1 VTON — feature flag for the bride video call.
 *
 * Why a flag at all:
 *   The bride's video-call screen has a battle-tested AR pose-warp +
 *   PNG-overlay path that the boutique already relies on. Until the
 *   Decart-transformed pipeline has been verified in a real call, we
 *   keep both paths in the binary and switch between them via this flag
 *   so a regression doesn't take live fittings offline.
 *
 * How to flip it:
 *   - Local dev:    add EXPO_PUBLIC_DECART_BUYER_ENABLED=true to .env
 *   - EAS builds:   add the same key under the `env` block in eas.json
 *                   for the profile you're building (see frontend-app/eas.json)
 *   - In-call test: rebuild the dev client and the new path engages
 *                   on join. There's no in-app toggle on purpose —
 *                   swapping the published track at runtime mid-call
 *                   is more risk than the optionality is worth.
 *
 * Once a real fitting confirms Decart works end-to-end, flip the default
 * to true in this file and delete the pose-warp path in a follow-up.
 *
 * Safe default: OFF — preserves today's behavior for anyone running the
 * current binary without setting the env var.
 */

const TRUTHY = /^(1|true|yes|on)$/i;

export function isBuyerDecartEnabled(): boolean {
  const raw = process.env.EXPO_PUBLIC_DECART_BUYER_ENABLED;
  if (typeof raw !== 'string') return false;
  return TRUTHY.test(raw.trim());
}
