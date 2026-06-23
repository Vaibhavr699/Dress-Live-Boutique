/**
 * Thin client for the backend's Decart token broker.
 *
 * Mirror of the FastAPI response from
 *   GET /api/v1/video-calls/decart-token?booking_id={id}
 * (see backend/app/api/v1/endpoints/video_calls.py).
 *
 * The bride client never sees the long-lived DECART_API_KEY — only the
 * short-lived `ek_*` token returned here, scoped to lucy-2.1-vton and
 * the booking's session window.
 */

import { api } from './api';


export type DecartSessionDress = {
  /** Internal DB id — matches the dressId echoed back over the LK data
   * channel from the consultant tablet, so the bride can look up which
   * dress just got switched. */
  id: number;
  name: string;
  /** Public/Supabase URL Decart fetches as the garment reference. May be
   * null for catalogue rows missing an image — bride should skip those. */
  image_url: string | null;
  /** Short text description Decart pairs with the reference image. Falls
   * back to the dress name when the backend has no dedicated prompt. */
  prompt: string;
};

export type DecartTokenResponse = {
  /** Short-lived client token, `ek_*`. Hand directly to createDecartClient. */
  api_key: string;
  /** ISO timestamp, ~60 min after issuance. Decart hard-caps TTL at 3600s. */
  expires_at: string;
  /** Echoes lucy-2.1-vton (or whatever the backend has configured). */
  model: string;
  /** Server-enforced max realtime session duration; Decart closes the
   * stream automatically at this point even if our client never does. */
  max_session_seconds: number;
  /** The 4 dresses selected for this booking, preloaded so the bride can
   * cache images before showing "Join" as ready. */
  dresses: DecartSessionDress[];
};


/**
 * Fetch a fresh Decart client token + dress list for a booking.
 *
 * Server-side guards (all return clear error bodies — surface them):
 *   - 401/403 if caller is not the booking's buyer
 *   - 400 if the booking is not a video appointment in `accepted` state
 *   - 402 if the daily Decart budget is exhausted
 *   - 500 if DECART_API_KEY isn't set on the server
 *   - 502 if Decart's upstream is unreachable
 *
 * Caller should call this once on join. Retrying makes a new token —
 * fine, but burns the previous one's TTL window for nothing.
 */
export async function fetchDecartToken(bookingId: number): Promise<DecartTokenResponse> {
  return await api.get(`/video-calls/decart-token?booking_id=${bookingId}`) as DecartTokenResponse;
}
