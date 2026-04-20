/**
 * In-room data messages between advisor and customer (LiveKit publishData).
 * Milestone A: signaling only. Milestone B: AI pipeline consumes the same events.
 */

export const TRYON_SWITCH_TYPE = 'tryon.switch' as const;
export const TRYON_SCHEMA_VERSION = 1;

export type TryonSwitchMessage = {
  type: typeof TRYON_SWITCH_TYPE;
  schemaVersion: typeof TRYON_SCHEMA_VERSION;
  bookingId: number;
  dressId: number;
  dressName?: string | null;
};

export function buildTryonSwitchPayload(params: {
  bookingId: number;
  dressId: number;
  dressName?: string | null;
}): Uint8Array {
  const body: TryonSwitchMessage = {
    type: TRYON_SWITCH_TYPE,
    schemaVersion: TRYON_SCHEMA_VERSION,
    bookingId: params.bookingId,
    dressId: params.dressId,
    ...(params.dressName != null && params.dressName !== ''
      ? { dressName: params.dressName }
      : {}),
  };
  return new TextEncoder().encode(JSON.stringify(body));
}

export function parseTryonSwitchMessage(raw: string): TryonSwitchMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  if (o.type !== TRYON_SWITCH_TYPE) return null;
  const version = o.schemaVersion;
  if (version !== undefined && version !== TRYON_SCHEMA_VERSION) return null;
  const bookingId = o.bookingId;
  const dressId = o.dressId;
  if (typeof bookingId !== 'number' || !Number.isFinite(bookingId)) return null;
  if (typeof dressId !== 'number' || !Number.isFinite(dressId)) return null;
  const dressName = o.dressName;
  if (dressName != null && typeof dressName !== 'string') return null;
  return {
    type: TRYON_SWITCH_TYPE,
    schemaVersion: TRYON_SCHEMA_VERSION,
    bookingId,
    dressId,
    ...(typeof dressName === 'string' ? { dressName } : {}),
  };
}
