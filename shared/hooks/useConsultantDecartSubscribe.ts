/**
 * useConsultantDecartSubscribe
 *
 * Counterpart to useBuyerDecartVideo. The bride RUNS Decart on her phone
 * (publisher); this hook SUBSCRIBES to the same session on the consultant
 * side and exposes the resulting MediaStream for the caller to render
 * (typically via @livekit/react-native-webrtc's RTCView on RN, or a
 * <video> element in the Next.js page).
 *
 * Token flow — purely client-to-client over LiveKit data channel:
 *   1. Bride's app gets `subscribeToken` from her RealTimeClient on
 *      connect and broadcasts a DECART_SUBSCRIBE_TOKEN message.
 *   2. Caller of this hook listens on the LK data channel, parses the
 *      message, and feeds the token in via the `token` arg.
 *   3. The hook calls Decart's subscribe API, gets onRemoteStream, and
 *      exposes the stream.
 *
 * No backend secrets needed on the consultant side — the subscribe token
 * IS the auth. Once it expires (~1h), the bride will already have
 * disconnected and the call will be over.
 *
 * Not in scope:
 *   - LiveKit plumbing (caller already has the room)
 *   - Token transport (caller is the data-channel listener)
 *   - Rendering — caller wraps the returned MediaStream in RTCView /
 *     <video>
 */

import { useEffect, useRef, useState } from 'react';
import { ensureLiveKitRegistered } from '../livekitInit';
import { isLiveKitNativeSupported } from '../livekitAvailability';


export type ConsultantSubscribeStatus =
  | 'idle'         // no token yet — waiting on the bride
  | 'connecting'   // Decart subscribe handshake in flight
  | 'connected'    // onRemoteStream has fired; stream is live
  | 'error';       // unrecoverable — caller should fall back to LK remote


export type UseConsultantDecartSubscribeResult = {
  status: ConsultantSubscribeStatus;
  errorMessage: string | null;
  /** Decart-transformed stream from the bride's session. Caller renders
   * this in place of the LiveKit remote video. Stays stable for the
   * lifetime of the token; rebuilds if the token argument changes. */
  subscribedStream: any | null;
};


function loadDecartSdk(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@decartai/sdk');
  } catch {
    return null;
  }
}


export function useConsultantDecartSubscribe({
  token,
}: {
  /** DECART_SUBSCRIBE_TOKEN value received from the bride over the LK
   * data channel. null until the first message arrives. */
  token: string | null;
}): UseConsultantDecartSubscribeResult {
  const [status, setStatus] = useState<ConsultantSubscribeStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [subscribedStream, setSubscribedStream] = useState<any | null>(null);

  // Underlying RealTimeSubscribeClient instance — kept in a ref so the
  // unmount cleanup always tears down the latest one.
  const clientRef = useRef<any>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (!token) {
      setStatus('idle');
      return;
    }
    // Defensive: same probe as the bride hook. Browsers also have these
    // globals so the check passes in Next.js too.
    if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
      if (!isLiveKitNativeSupported()) {
        setStatus('error');
        setErrorMessage('LiveKit native module unavailable — Decart subscribe needs a dev/preview build, not Expo Go.');
        return;
      }
      ensureLiveKitRegistered();
    }

    mountedRef.current = true;
    let cancelled = false;

    const start = async () => {
      const sdk = loadDecartSdk();
      if (!sdk) {
        setStatus('error');
        setErrorMessage('@decartai/sdk failed to require — restart Metro with --clear.');
        return;
      }
      // The SDK exposes a top-level realtime.subscribe(token, { onRemoteStream })
      // helper that returns a RealTimeSubscribeClient. We deliberately
      // construct the client via createDecartClient (no API key needed for
      // subscribe — the token is the auth) and then call its subscribe.
      // If the public surface changes, this is the one line to update.
      try {
        const client = sdk.createDecartClient({ apiKey: 'subscribe-only' });
        setStatus('connecting');
        setErrorMessage(null);
        const subscriber = await client.realtime.subscribe({
          token,
          onRemoteStream: (stream: any) => {
            if (cancelled || !mountedRef.current) return;
            setSubscribedStream(stream);
            setStatus('connected');
          },
        });
        if (cancelled) {
          try { subscriber.disconnect(); } catch {}
          return;
        }
        clientRef.current = subscriber;
        subscriber.on?.('error', (err: any) => {
          if (!mountedRef.current) return;
          setStatus('error');
          setErrorMessage(`Decart subscribe error: ${err?.message || String(err)}`);
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
      try { clientRef.current?.disconnect(); } catch {}
      clientRef.current = null;
      setSubscribedStream(null);
      setStatus('idle');
      setErrorMessage(null);
    };
  }, [token]);

  return { status, errorMessage, subscribedStream };
}
