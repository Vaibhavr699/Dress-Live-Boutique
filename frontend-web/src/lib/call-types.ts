/**
 * Shared types for the call page (bride + consultant variants).
 *
 * Backend source of truth: backend/app/schemas/video_call.py
 *   - LiveKitTokenResponse
 *   - DecartCredentials
 *   - WebJoinResponse
 *   - SessionDress
 */

export type DecartSessionDress = {
  id: number;
  name: string;
  image_url: string | null;
  prompt: string;
};

export type LiveKitTokenResponse = {
  url: string;
  token: string;
  room: string;
  identity: string;
};

export type DecartCredentials = {
  api_key: string;
  expires_at: string;
  model: string;
  max_session_seconds: number;
};

/** Returned by GET /api/v1/video-calls/web-join */
export type WebJoinResponse = {
  livekit: LiveKitTokenResponse;
  decart: DecartCredentials | null;
  dresses: DecartSessionDress[];
  booking_id: number;
  scheduled_for: string | null;
};
