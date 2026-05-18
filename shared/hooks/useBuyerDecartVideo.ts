/**
 * useBuyerDecartVideo
 *
 * Owns the bride's Decart Lucy 2.1 VTON realtime session for the duration
 * of a video call. Encapsulates:
 *
 *   - One-shot token fetch from POST /api/v1/video-calls/decart-token
 *   - getUserMedia for the raw camera (audio stays off — the LiveKit room
 *     owns the mic publish so we don't double up)
 *   - decart.realtime.connect with that raw stream
 *   - Exposes the transformed MediaStream so the caller can wrap it in a
 *     LiveKit LocalVideoTrack and publishTrack() it once. The track object
 *     is intentionally NOT created in this hook — that's LiveKit's job and
 *     keeping the publish step in the caller's hands makes the lifecycle
 *     easier to reason about.
 *   - switchDress(dressId): look up the dress in the preloaded set and
 *     call realtime.set({ image, prompt }). The consultant only sends the
 *     dress id; the bride is the single source of truth for image+prompt
 *     so they never drift.
 *   - clearDress(): no-garment mode. We call setImage(null) with the
 *     existing prompt intact, because Decart's zod schema rejects an
 *     empty prompt string (min:1).
 *
 * Not in scope for this hook:
 *   - Publishing the transformed track to LiveKit. Caller does that.
 *   - Fallback to raw camera on Decart failure. Caller does replaceTrack
 *     on the LocalVideoTrack it owns.
 *   - Pose-warp / PNG overlay path — that's the legacy code path the
 *     `isBuyerDecartEnabled` feature flag swaps out.
 *
 * One-shot: this hook is keyed by `enabled` + `bookingId`. Don't toggle
 * `enabled` mid-call — there's no graceful camera-handover today and
 * the caller is expected to choose its path on mount.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureLiveKitRegistered } from '../livekitInit';
import { isLiveKitNativeSupported } from '../livekitAvailability';
import { fetchDecartToken, type DecartSessionDress, type DecartTokenResponse } from '../api/decartTokens';


export type DecartStatus =
  | 'idle'           // not enabled — caller should use the legacy path
  | 'fetching-token' // network round-trip to backend
  | 'starting'       // getUserMedia + Decart handshake in flight
  | 'connected'      // onRemoteStream has fired; transformedStream is live
  | 'error';         // unrecoverable — caller should fall back to raw camera


export type UseBuyerDecartVideoResult = {
  status: DecartStatus;
  /** Set on transition to 'error'. Human-readable; safe to surface in a
   * discreet toast. */
  errorMessage: string | null;
  /** The Decart-transformed stream. Caller wraps it in a LiveKit
   * LocalVideoTrack and publishes that to the room exactly once. Stays
   * stable across dress switches — only its frames change. */
  transformedStream: any | null;
  /** The raw camera stream we acquired. Caller may use this for the
   * fallback (replaceTrack to this stream when Decart fails) and/or to
   * extract the audio track if it wants to publish mic alongside. */
  rawStream: any | null;
  /** The 4 dresses returned by the backend, in booking order. Caller
   * does not need to load these separately — they were preloaded by the
   * token request. */
  dresses: DecartSessionDress[];
  /** Apply a dress. Looks up `dressId` in the preloaded set, then calls
   * realtime.set with the image + prompt. Returns false if the id is
   * unknown (e.g. catalogue race) so the caller can ignore it. */
  switchDress: (dressId: number) => Promise<boolean>;
  /** Remove any reference image while keeping the last prompt. Used when
   * the consultant taps "No dress" — Decart still bills per second so
   * this isn't free, but the model is at least not actively trying to
   * synthesize a garment. */
  clearDress: () => Promise<void>;
};


type DecartSdk = {
  createDecartClient: (opts: { apiKey: string }) => any;
  models: { realtime: (name: string) => any };
};


function loadDecartSdk(): DecartSdk | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@decartai/sdk');
  } catch {
    return null;
  }
}


function loadWebRtcLazy() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@livekit/react-native-webrtc');
  } catch {
    return null;
  }
}


export function useBuyerDecartVideo({
  enabled,
  bookingId,
}: {
  enabled: boolean;
  bookingId: number | null;
}): UseBuyerDecartVideoResult {
  const [status, setStatus] = useState<DecartStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transformedStream, setTransformedStream] = useState<any | null>(null);
  const [rawStream, setRawStream] = useState<any | null>(null);
  const [dresses, setDresses] = useState<DecartSessionDress[]>([]);

  const realtimeRef = useRef<any>(null);
  const dressMapRef = useRef<Map<number, DecartSessionDress>>(new Map());
  // Tracks whether THIS hook instance is still mounted — async work that
  // resolves after unmount must not touch React state or it'll warn /
  // leak. Refreshed on every effect run for the React 18 strict-mode
  // double-invoke case.
  const mountedRef = useRef(true);

  // Start / teardown the session.
  useEffect(() => {
    if (!enabled || bookingId == null) {
      setStatus('idle');
      return;
    }
    if (!isLiveKitNativeSupported()) {
      setStatus('error');
      setErrorMessage('LiveKit native module unavailable — Decart requires a dev/preview build, not Expo Go.');
      return;
    }

    mountedRef.current = true;
    let cancelled = false;

    const start = async () => {
      try {
        // 1. Fetch token + dresses from backend.
        setStatus('fetching-token');
        let tokenResp: DecartTokenResponse;
        try {
          tokenResp = await fetchDecartToken(bookingId);
        } catch (e: any) {
          throw new Error(`/decart-token failed: ${e?.message || String(e)}`);
        }
        if (cancelled) return;
        const map = new Map<number, DecartSessionDress>();
        for (const d of tokenResp.dresses) map.set(d.id, d);
        dressMapRef.current = map;
        setDresses(tokenResp.dresses);

        // 2. Make sure WebRTC globals are wired BEFORE we touch Decart —
        // Decart looks them up off globalThis at connect time.
        ensureLiveKitRegistered();
        const webrtc = loadWebRtcLazy();
        if (!webrtc?.mediaDevices) {
          throw new Error('LiveKit WebRTC native bridge missing — rebuild the dev client.');
        }
        const sdk = loadDecartSdk();
        if (!sdk) {
          throw new Error('@decartai/sdk failed to require — restart Metro with --clear.');
        }

        // 3. Raw camera at the dimensions Decart's model wants. We do
        // NOT request audio here — LiveKit's auto-audio handles the mic
        // so we'd be fighting for the same device otherwise.
        setStatus('starting');
        const model = sdk.models.realtime(tokenResp.model);
        let raw: any;
        try {
          raw = await webrtc.mediaDevices.getUserMedia({
            audio: false,
            video: {
              frameRate: model.fps,
              width: model.width,
              height: model.height,
              facingMode: 'user',
            },
          });
        } catch (e: any) {
          throw new Error(`Camera permission denied or unavailable: ${e?.message || String(e)}`);
        }
        if (cancelled) {
          try { raw.getTracks?.().forEach((t: any) => t.stop()); } catch {}
          return;
        }
        setRawStream(raw);

        // 4. Decart handshake. The placeholder prompt is required —
        // Decart's zod schema rejects an empty initialState.prompt.text.
        // We pick something neutral so the bride sees herself with no
        // garment overlaid until the consultant taps a dress.
        const client = sdk.createDecartClient({ apiKey: tokenResp.api_key });
        const realtime = await client.realtime.connect(raw, {
          model,
          initialState: {
            prompt: { text: 'person standing in a neutral room', enhance: false },
          },
          onRemoteStream: (s: any) => {
            if (cancelled || !mountedRef.current) return;
            setTransformedStream(s);
            setStatus('connected');
          },
        });
        if (cancelled) {
          try { realtime.disconnect(); } catch {}
          try { raw.getTracks?.().forEach((t: any) => t.stop()); } catch {}
          return;
        }
        realtimeRef.current = realtime;
        realtime.on('error', (err: any) => {
          if (!mountedRef.current) return;
          setStatus('error');
          setErrorMessage(`Decart error: ${err?.message || String(err)}`);
        });
      } catch (e: any) {
        if (cancelled || !mountedRef.current) return;
        setStatus('error');
        setErrorMessage(e?.message || String(e));
      }
    };

    start();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      // Order matters: tear down Decart first so it doesn't try to push
      // frames into a stream whose tracks we've already stopped.
      try { realtimeRef.current?.disconnect(); } catch {}
      realtimeRef.current = null;
      // The raw stream is ours — stop it. The transformed stream is owned
      // by Decart's SDK; the disconnect above releases it.
      setRawStream((s: any) => {
        try { s?.getTracks?.().forEach((t: any) => t.stop()); } catch {}
        return null;
      });
      setTransformedStream(null);
      setDresses([]);
      dressMapRef.current = new Map();
      setStatus('idle');
      setErrorMessage(null);
    };
  }, [enabled, bookingId]);

  // ── public API ─────────────────────────────────────────────────────────

  const switchDress = useCallback(async (dressId: number): Promise<boolean> => {
    const realtime = realtimeRef.current;
    if (!realtime) return false;
    const dress = dressMapRef.current.get(dressId);
    if (!dress) return false;
    try {
      // Image is the dress photo URL (must be publicly fetchable from
      // Decart's side — Supabase public URLs work). Prompt sharpens the
      // generation; when image_url is null we still send a prompt-only
      // request, which is degraded but recoverable.
      await realtime.set({
        prompt: dress.prompt,
        image: dress.image_url || null,
        enhance: false,
      });
      return true;
    } catch {
      // Don't blow up the call over a single switch failure — the consultant
      // can tap again or pick a different dress.
      return false;
    }
  }, []);

  const clearDress = useCallback(async (): Promise<void> => {
    const realtime = realtimeRef.current;
    if (!realtime) return;
    try {
      // setImage(null) wipes the reference while keeping the last prompt
      // — Decart rejects empty prompts so this is the safe "no dress" path.
      await realtime.setImage(null);
    } catch {
      // Swallow — same logic as switchDress.
    }
  }, []);

  return {
    status,
    errorMessage,
    transformedStream,
    rawStream,
    dresses,
    switchDress,
    clearDress,
  };
}
