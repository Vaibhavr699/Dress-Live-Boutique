"use client";

/**
 * Bride's browser-side Decart publisher.
 *
 * The bride opens her email link → /call/[id]?token=… on her laptop.
 * This hook runs Decart Lucy 2.1 VTON in her browser:
 *   1. getUserMedia for camera+mic (browser native; no LiveKit globals
 *      needed since we're already in a browser, not RN).
 *   2. createDecartClient + realtime.connect with the ek_* token from
 *      the backend's /web-join response.
 *   3. Exposes the transformed MediaStream (the bride renders it
 *      fullscreen) AND the subscribeToken (the page broadcasts this
 *      over the LiveKit data channel so the consultant can subscribe).
 *
 * Counterpart on the consultant side: useConsultantDecartSubscribe
 * (also in this folder) — same architecture we shipped to the boutique
 * RN app, except this hook is the publisher and that one is the
 * subscriber.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { DecartSessionDress } from "@/lib/call-types";


export type BrideDecartStatus =
  | "idle"               // hook not enabled yet (waiting for user "Join" tap)
  | "requesting-camera"  // getUserMedia in flight
  | "starting"           // Decart handshake in flight
  | "connected"          // first transformed frame arrived
  | "error";             // unrecoverable — caller should surface


export type UseBrideDecartPublishResult = {
  status: BrideDecartStatus;
  errorMessage: string | null;
  /** Transformed video — bride renders this fullscreen so she sees
   * herself with the dress applied. */
  transformedStream: MediaStream | null;
  /** Raw camera stream — exposed so the page can publish the AUDIO
   * track to LiveKit (video stays in Decart, never goes through LK). */
  rawStream: MediaStream | null;
  /** The opaque token the consultant uses to subscribe to this Decart
   * session and render the same transformed frames. Null until
   * Decart's handshake completes; broadcast over LK data channel by
   * the caller once it lands. */
  subscribeToken: string | null;
  /** Apply a specific dress. The bride NEVER calls this herself; the
   * consultant taps a thumbnail → publishes a SET_DRESS data-channel
   * message → the page handler invokes this. */
  switchDress: (dressId: number) => Promise<boolean>;
  /** Remove the reference image while keeping the last prompt. Used
   * when the consultant taps "No dress". Decart keeps streaming
   * (still billed) but doesn't generate a garment overlay. */
  clearDress: () => Promise<void>;
};


export function useBrideDecartPublish({
  enabled,
  apiKey,
  model,
  dresses,
}: {
  /** Caller flips this to true the moment the bride taps the Join
   * button. Until then the hook stays idle so the bride doesn't burn
   * Decart compute time while the camera permission popup is up. */
  enabled: boolean;
  /** Short-lived ek_* token from /web-join. Null until the page has
   * fetched it. */
  apiKey: string | null;
  /** Model identifier (lucy-2.1-vton). Comes from /web-join too so
   * the bride and consultant never disagree about which model is in
   * flight. */
  model: string | null;
  /** The 4 dresses preloaded for this booking — needed for switchDress
   * to map a dressId to its image_url + prompt. */
  dresses: DecartSessionDress[];
}): UseBrideDecartPublishResult {
  const [status, setStatus] = useState<BrideDecartStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transformedStream, setTransformedStream] = useState<MediaStream | null>(null);
  const [rawStream, setRawStream] = useState<MediaStream | null>(null);
  const [subscribeToken, setSubscribeToken] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const realtimeRef = useRef<any>(null);
  const dressMapRef = useRef<Map<number, DecartSessionDress>>(new Map());
  const mountedRef = useRef(true);

  // Keep the dress lookup map in sync with the dresses prop — caller
  // might re-fetch /web-join and pass a fresh array.
  useEffect(() => {
    const m = new Map<number, DecartSessionDress>();
    for (const d of dresses) m.set(d.id, d);
    dressMapRef.current = m;
  }, [dresses]);

  // Open Decart when the user is ready (clicked Join) AND we have the
  // credentials. Tear it all down on unmount or when `enabled` flips
  // false.
  useEffect(() => {
    if (!enabled || !apiKey || !model) {
      setStatus("idle");
      return;
    }
    mountedRef.current = true;
    let cancelled = false;

    const start = async () => {
      try {
        setStatus("requesting-camera");
        setErrorMessage(null);

        // Browser-native getUserMedia. Decart's model is 1088x624 @ 20fps
        // (we hardcode the model spec — same as the RN spike). Audio
        // disabled here because the caller publishes a separate
        // getUserMedia({audio:true}) track to LiveKit; if we requested
        // audio on this stream too, two parallel getUserMedia calls
        // would fight for the device on some browsers.
        const raw = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            width: { ideal: 1088 },
            height: { ideal: 624 },
            frameRate: { ideal: 20 },
            facingMode: "user",
          },
        });
        if (cancelled) {
          raw.getTracks().forEach((t) => t.stop());
          return;
        }
        setRawStream(raw);

        // Dynamic import so the SDK is only loaded once the user is
        // actually joining (keeps the landing-page bundle small).
        const sdkMod = await import("@decartai/sdk");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sdk: any = (sdkMod as unknown as { default?: typeof sdkMod }).default ?? sdkMod;

        setStatus("starting");
        const client = sdk.createDecartClient({ apiKey });
        const modelDef = sdk.models.realtime(model);

        const realtime = await client.realtime.connect(raw, {
          model: modelDef,
          // Lucy 2.1 VTON's zod schema requires a non-empty prompt at
          // initialState, so we pick a neutral one. Consultant taps
          // a dress → handler calls switchDress which replaces the
          // prompt+image. To go back to "no dress" later we call
          // setImage(null) and keep the last prompt (empty string is
          // rejected by the SDK validator).
          initialState: {
            prompt: { text: "person standing in a neutral room", enhance: false },
          },
          onRemoteStream: (stream: MediaStream) => {
            if (cancelled || !mountedRef.current) return;
            setTransformedStream(stream);
            // Pull subscribeToken from the ref ONLY — we cannot close over
            // `realtime` here because the SDK fires onRemoteStream
            // synchronously inside the connect() call, before the `const
            // realtime = await ...` binding is initialized (TDZ). The
            // post-connect block below covers the case where ref isn't set
            // yet on the first frame.
            const tok = realtimeRef.current?.subscribeToken ?? null;
            if (tok) setSubscribeToken(tok);
            setStatus("connected");
          },
        });
        if (cancelled) {
          try { realtime.disconnect(); } catch {}
          raw.getTracks().forEach((t) => t.stop());
          return;
        }
        realtimeRef.current = realtime;
        // subscribeToken is populated asynchronously by a websocket
        // "sessionId" message inside the SDK (see
        // @decartai/sdk/dist/realtime/client.js:127). It may not be set
        // by the time `connect()` resolves, and the SDK doesn't emit an
        // event for it. Poll until it shows up so the consultant can
        // subscribe. Caps at 15s — past that, Decart is clearly stuck.
        if (realtime.subscribeToken) {
          setSubscribeToken(realtime.subscribeToken);
        } else {
          const start = Date.now();
          const poll = setInterval(() => {
            if (cancelled || !mountedRef.current) { clearInterval(poll); return; }
            const tok = realtime?.subscribeToken ?? null;
            if (tok) {
              setSubscribeToken(tok);
              clearInterval(poll);
              return;
            }
            if (Date.now() - start > 15000) {
              clearInterval(poll);
              // Don't transition to error — the bride still sees her own
              // try-on; only the consultant's view is degraded.
            }
          }, 200);
        }
        if (typeof realtime.on === "function") {
          realtime.on("error", (err: { message?: string }) => {
            if (!mountedRef.current) return;
            setStatus("error");
            setErrorMessage(`Decart error: ${err?.message || String(err)}`);
          });
        }
      } catch (e) {
        if (cancelled || !mountedRef.current) return;
        const msg = (e as { message?: string; name?: string })?.message || String(e);
        // Browser camera permission denial has a distinct name we can
        // surface specifically — otherwise the bride sees a confusing
        // technical message.
        const name = (e as { name?: string })?.name;
        setStatus("error");
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setErrorMessage("Camera or microphone access was blocked. Please allow it and refresh.");
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setErrorMessage("No camera detected. Plug one in or use a laptop with a built-in webcam.");
        } else {
          setErrorMessage(msg);
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      try { realtimeRef.current?.disconnect(); } catch {}
      realtimeRef.current = null;
      setRawStream((s) => {
        try { s?.getTracks().forEach((t) => t.stop()); } catch {}
        return null;
      });
      setTransformedStream(null);
      setSubscribeToken(null);
      setStatus("idle");
      setErrorMessage(null);
    };
  }, [enabled, apiKey, model]);

  // ── public API ─────────────────────────────────────────────────────────

  const switchDress = useCallback(async (dressId: number): Promise<boolean> => {
    const realtime = realtimeRef.current;
    if (!realtime) return false;
    const dress = dressMapRef.current.get(dressId);
    if (!dress) return false;
    try {
      await realtime.set({
        prompt: dress.prompt,
        image: dress.image_url || null,
        enhance: false,
      });
      return true;
    } catch {
      // Single-switch failures shouldn't break the call — the
      // consultant can retry from the thumbnail.
      return false;
    }
  }, []);

  const clearDress = useCallback(async (): Promise<void> => {
    const realtime = realtimeRef.current;
    if (!realtime) return;
    try {
      // Decart rejects empty prompt strings (min:1 zod schema) so
      // "No dress" can't simply clear the prompt. Clear only the
      // reference image; the last prompt stays. The bride sees herself
      // styled by the last prompt but not wearing a specific garment.
      await realtime.setImage(null);
    } catch {
      /* swallow */
    }
  }, []);

  return {
    status,
    errorMessage,
    transformedStream,
    rawStream,
    subscribeToken,
    switchDress,
    clearDress,
  };
}
