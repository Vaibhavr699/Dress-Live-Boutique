import { useEffect, useRef, useState } from 'react';
import { parsePoseLandmarksMessage } from '@shared/videoCallSignals';
import type { ARTorsoLandmarks } from './ARGarmentOverlay';

/**
 * Advisor-side companion to the buyer's `useLivePoseLandmarks` hook.
 *
 * Subscribes to the LiveKit data channel and keeps the most recent
 * `pose.landmarks` payload in state — the buyer's app publishes one
 * every ~200 ms while a dress is active. The same `<ARGarmentOverlay>`
 * component reads these landmarks and renders the matching warp on
 * the advisor's copy of the buyer's remote video.
 *
 * Stale samples (no fresh data for `staleHoldMs`) clear the landmarks
 * so the overlay fades out rather than freezing in place — useful when
 * the buyer leaves frame or their pose endpoint stalls.
 */

type Options = {
  room: any | null;
  bookingId: number | null;
  /** Only accept landmarks tagged with this dress id (matches what
   *  the advisor told the buyer to render via `tryon.switch`). When
   *  null, accept any dress id. */
  activeDressId: number | null;
  /** ms — clear landmarks after this long without a fresh sample. */
  staleHoldMs?: number;
};

export function useReceivedPoseLandmarks(opts: Options): ARTorsoLandmarks | null {
  const { room, bookingId, activeDressId, staleHoldMs = 1500 } = opts;
  const [landmarks, setLandmarks] = useState<ARTorsoLandmarks | null>(null);
  const lastTsRef = useRef<number>(0);

  useEffect(() => {
    if (!room || bookingId == null) {
      setLandmarks(null);
      return;
    }

    const handler = (payload: Uint8Array) => {
      let raw: string;
      try { raw = new TextDecoder().decode(payload); } catch { return; }
      const msg = parsePoseLandmarksMessage(raw);
      if (!msg || msg.bookingId !== bookingId) return;
      // The buyer publishes `dressId: 0` as a wildcard meaning "apply to
      // whichever dress is currently active on the advisor's side", so
      // only reject when the message carries a *specific* dress id that
      // disagrees with what the advisor has selected.
      if (activeDressId != null && msg.dressId !== 0 && msg.dressId !== activeDressId) return;

      // Filter out-of-order packets; we receive `reliable: false` so a
      // late one can arrive after a newer sample.
      if (msg.ts < lastTsRef.current) return;
      lastTsRef.current = msg.ts;
      setLandmarks({
        image_left_shoulder: msg.landmarks.image_left_shoulder,
        image_right_shoulder: msg.landmarks.image_right_shoulder,
        image_left_hip: msg.landmarks.image_left_hip,
        image_right_hip: msg.landmarks.image_right_hip,
      });
    };
    room.on('dataReceived', handler as any);
    return () => { room.off('dataReceived', handler as any); };
  }, [room, bookingId, activeDressId]);

  // Periodic stale check — clear if no fresh data has arrived recently.
  useEffect(() => {
    if (landmarks == null) return;
    const id = setInterval(() => {
      const age = Date.now() - lastTsRef.current;
      if (age > staleHoldMs) {
        setLandmarks(null);
      }
    }, 400);
    return () => clearInterval(id);
  }, [landmarks, staleHoldMs]);

  return landmarks;
}
