/**
 * Wire-format mirror of shared/videoCallSignals.ts (RN side). Kept as a
 * separate file here because the RN module imports from 'react-native'
 * and 'expo-constants' which Next.js can't bundle. The actual message
 * SHAPE is identical so the two sides interoperate cleanly over the
 * LiveKit data channel.
 *
 * If you change one side, change the other to match.
 */

export const TRYON_SWITCH_TYPE = "tryon.switch" as const;
export const DECART_SUBSCRIBE_TOKEN_TYPE = "decart.subscribe_token" as const;
export const SCHEMA_VERSION = 1;


export type TryonSwitchMessage = {
  type: typeof TRYON_SWITCH_TYPE;
  schemaVersion: typeof SCHEMA_VERSION;
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
    schemaVersion: SCHEMA_VERSION,
    bookingId: params.bookingId,
    dressId: params.dressId,
    ...(params.dressName != null && params.dressName !== ""
      ? { dressName: params.dressName }
      : {}),
  };
  return new TextEncoder().encode(JSON.stringify(body));
}


export type DecartSubscribeTokenMessage = {
  type: typeof DECART_SUBSCRIBE_TOKEN_TYPE;
  schemaVersion: typeof SCHEMA_VERSION;
  bookingId: number;
  token: string;
};

export function parseDecartSubscribeTokenMessage(raw: string): DecartSubscribeTokenMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (o.type !== DECART_SUBSCRIBE_TOKEN_TYPE) return null;
  if (o.schemaVersion !== SCHEMA_VERSION) return null;
  const bookingId = o.bookingId;
  const token = o.token;
  if (typeof bookingId !== "number" || !Number.isFinite(bookingId)) return null;
  if (typeof token !== "string" || !token.trim()) return null;
  return {
    type: DECART_SUBSCRIBE_TOKEN_TYPE,
    schemaVersion: SCHEMA_VERSION,
    bookingId,
    token,
  };
}
