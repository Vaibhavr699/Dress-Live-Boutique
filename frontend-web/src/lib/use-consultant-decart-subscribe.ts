"use client";

/**
 * Browser hook to subscribe to the bride's running Decart session.
 *
 * Pair to the bride's broadcast on the RN side: the bride's RealTimeClient
 * exposes a `subscribeToken` after connect; she ships it over the LiveKit
 * data channel; this hook receives it (caller does the data-channel
 * listening) and calls Decart's subscribe API.
 *
 * Decart's subscribe API isn't in their public docs but is exported via
 * the SDK types (RealTimeSubscribeClient, SubscribeOptions). If they
 * change the shape, the one place to fix it is `realtime.subscribe(...)`
 * below.
 *
 * Returns a MediaStream the caller renders via <video srcObject={...}>.
 */

import { useEffect, useRef, useState } from "react";


export type ConsultantSubscribeStatus = "idle" | "connecting" | "connected" | "error";

export type UseConsultantDecartSubscribeResult = {
  status: ConsultantSubscribeStatus;
  errorMessage: string | null;
  subscribedStream: MediaStream | null;
};


export function useConsultantDecartSubscribe({
  token,
}: {
  token: string | null;
}): UseConsultantDecartSubscribeResult {
  const [status, setStatus] = useState<ConsultantSubscribeStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [subscribedStream, setSubscribedStream] = useState<MediaStream | null>(null);

  // Underlying subscribe client — kept in a ref so unmount cleanup
  // always tears down the latest instance.
  const clientRef = useRef<{ disconnect?: () => void } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (!token) {
      setStatus("idle");
      return;
    }

    mountedRef.current = true;
    let cancelled = false;

    const start = async () => {
      setStatus("connecting");
      setErrorMessage(null);
      try {
        // Dynamic import so the SDK is only loaded when we actually need
        // to subscribe — keeps the initial /call page bundle small.
        const sdkMod = await import("@decartai/sdk");
        const sdk = (sdkMod as unknown as { default?: typeof sdkMod }).default ?? sdkMod;
        // createDecartClient takes an `apiKey`; for subscribe the token IS
        // the auth, but the SDK still requires SOMETHING here. We pass
        // a sentinel so a leaked client object can't be used to publish.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client: any = (sdk as any).createDecartClient({ apiKey: "subscribe-only" });
        const subscriber = await client.realtime.subscribe({
          token,
          onRemoteStream: (stream: MediaStream) => {
            if (cancelled || !mountedRef.current) return;
            setSubscribedStream(stream);
            setStatus("connected");
          },
        });
        if (cancelled) {
          try { subscriber.disconnect?.(); } catch {}
          return;
        }
        clientRef.current = subscriber;
        if (typeof subscriber.on === "function") {
          subscriber.on("error", (err: { message?: string }) => {
            if (!mountedRef.current) return;
            setStatus("error");
            setErrorMessage(`Decart subscribe error: ${err?.message || String(err)}`);
          });
        }
      } catch (e) {
        if (cancelled || !mountedRef.current) return;
        const message = (e as { message?: string })?.message || String(e);
        setStatus("error");
        setErrorMessage(message);
      }
    };

    start();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      try { clientRef.current?.disconnect?.(); } catch {}
      clientRef.current = null;
      setSubscribedStream(null);
      setStatus("idle");
      setErrorMessage(null);
    };
  }, [token]);

  return { status, errorMessage, subscribedStream };
}
