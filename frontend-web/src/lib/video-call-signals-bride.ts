/**
 * Bride-side wire-format helpers. Counterpart to video-call-signals.ts
 * (consultant-side helpers).
 *
 * Bride needs to:
 *   - PARSE: TryonSwitchMessage (consultant tapped a dress)
 *   - BUILD: DecartSubscribeTokenMessage (sent over data channel so
 *            consultant can subscribe to bride's Decart session)
 *
 * Mirror of shared/videoCallSignals.ts wire formats. Kept separate
 * because the shared/ module imports react-native which Next can't
 * bundle.
 */

export const TRYON_SWITCH_TYPE = "tryon.switch" as const;
export const DECART_SUBSCRIBE_TOKEN_TYPE = "decart.subscribe_token" as const;
export const SCHEMA_VERSION = 1;


// ── DECART_SUBSCRIBE_TOKEN (bride → consultant) ──────────────────────────

export type DecartSubscribeTokenMessage = {
  type: typeof DECART_SUBSCRIBE_TOKEN_TYPE;
  schemaVersion: typeof SCHEMA_VERSION;
  bookingId: number;
  token: string;
};

export function buildDecartSubscribeTokenPayload(params: {
  bookingId: number;
  token: string;
}): Uint8Array {
  const body: DecartSubscribeTokenMessage = {
    type: DECART_SUBSCRIBE_TOKEN_TYPE,
    schemaVersion: SCHEMA_VERSION,
    bookingId: params.bookingId,
    token: params.token,
  };
  return new TextEncoder().encode(JSON.stringify(body));
}


// ── TRYON_SWITCH (consultant → bride) ────────────────────────────────────

export type TryonSwitchMessage = {
  type: typeof TRYON_SWITCH_TYPE;
  schemaVersion: typeof SCHEMA_VERSION;
  bookingId: number;
  /** null means "no dress" — bride clears the reference image. */
  dressId: number | null;
  dressName?: string | null;
};

export function parseTryonSwitchMessageFromBytes(
  payload: Uint8Array,
): TryonSwitchMessage | null {
  let raw: string;
  try {
    raw = new TextDecoder().decode(payload);
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (o.type !== TRYON_SWITCH_TYPE) return null;
  if (o.schemaVersion !== undefined && o.schemaVersion !== SCHEMA_VERSION) return null;
  const bookingId = o.bookingId;
  const dressId = o.dressId;
  if (typeof bookingId !== "number" || !Number.isFinite(bookingId)) return null;
  // dressId can be a number OR null (No-dress). Anything else → drop.
  const isValidDressId = dressId === null || (typeof dressId === "number" && Number.isFinite(dressId));
  if (!isValidDressId) return null;
  const dressName = o.dressName;
  if (dressName != null && typeof dressName !== "string") return null;
  return {
    type: TRYON_SWITCH_TYPE,
    schemaVersion: SCHEMA_VERSION,
    bookingId,
    dressId: dressId as number | null,
    ...(typeof dressName === "string" ? { dressName } : {}),
  };
}
