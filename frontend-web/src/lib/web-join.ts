/**
 * Client for the no-login bride join endpoint.
 *
 * Backend: GET /api/v1/video-calls/web-join?booking_id=&token=
 *   See backend/app/api/v1/endpoints/video_calls.py for behaviour.
 *
 * Auth is purely the JWT in the URL — the bride never has a logged-in
 * session in the browser. The server validates the token, looks up the
 * booking, mints LiveKit + Decart credentials, and returns the dresses.
 *
 * Uses fetch directly (not the lib/api client) because the api client
 * threads a getStoredSession Authorization header in by default, which
 * we explicitly do not want for the bride flow.
 */

import type { WebJoinResponse } from "@/lib/call-types";

const API_PATH = "/api/v1";


function getApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl) {
    const trimmed = envUrl.trim().replace(/\/+$/, "");
    return trimmed.endsWith(API_PATH) ? trimmed : `${trimmed}${API_PATH}`;
  }
  return `http://localhost:8000${API_PATH}`;
}


export class WebJoinError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "WebJoinError";
  }
}


export async function fetchWebJoin(
  bookingId: number,
  token: string,
): Promise<WebJoinResponse> {
  const base = getApiBaseUrl();
  const url = `${base}/video-calls/web-join?booking_id=${encodeURIComponent(
    String(bookingId),
  )}&token=${encodeURIComponent(token)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // ignore — keep the statusText fallback
    }
    throw new WebJoinError(response.status, friendly(response.status, detail));
  }

  return (await response.json()) as WebJoinResponse;
}


function friendly(status: number, detail: string): string {
  if (status === 401) return "This link has expired or is invalid. Ask the boutique to send a fresh one.";
  if (status === 403) return "This link doesn't match the booking.";
  if (status === 404) return "We couldn't find your fitting session.";
  if (status === 400) return detail || "This appointment is not currently joinable.";
  if (status >= 500) return "Something went wrong on our side. Please try again in a moment.";
  return detail || `Request failed (${status}).`;
}
