import { useEffect, useRef, useState } from 'react';
import * as ImageManipulator from 'expo-image-manipulator';
import { api } from '@shared/api/api';
import type { ARTorsoLandmarks } from './ARGarmentOverlay';

/**
 * Polls the buyer's own ViewShot for low-res JPEGs and sends them to
 * `POST /ai/live-pose-landmarks`, which returns just the 4 torso
 * keypoints needed to drive `<ARGarmentOverlay>`. Designed to run at
 * roughly 5 Hz — fast enough that the overlay feels responsive but
 * cheap enough that the backend MediaPipe call (≈30 ms on a downscaled
 * frame) keeps up without queueing.
 *
 * The frame source is decoupled from the existing 2 s CatVTON loop:
 * we sub-sample at 256 px (vs. 640 px for CatVTON) and compress hard
 * to keep the payload under ~25 KB, which makes the POST round-trip
 * dominate latency rather than the upload itself.
 *
 * Returns the latest landmarks (or null when no pose is detected). On
 * a 429-style "skipped" response or transient network failures we
 * keep the previous landmarks visible for `staleHoldMs` before fading
 * the overlay — avoids flicker during brief stalls.
 */

type Options = {
  bookingId: number | null;
  /** Source of raw camera frames — same ViewShot the CatVTON loop uses. */
  captureFrame: () => Promise<string | null>;
  enabled: boolean;
  /** Target sampling cadence. Backend ceiling is ~12 fps so 200 ms is safe. */
  intervalMs?: number;
  /** Down-sample width before POSTing. 256 keeps MediaPipe happy and
   *  the payload tiny. */
  resizeWidth?: number;
  /** Keep showing the last landmarks for this long after a failed/no-pose
   *  sample before considering them stale. */
  staleHoldMs?: number;
};

type PoseResponse =
  | { ok: true; landmarks: ARTorsoLandmarks; elapsed_ms?: number }
  | { ok: false; reason?: string; skipped?: boolean; elapsed_ms?: number };

export function useLivePoseLandmarks(opts: Options): {
  landmarks: ARTorsoLandmarks | null;
  active: boolean;
} {
  const {
    bookingId,
    captureFrame,
    enabled,
    intervalMs = 200,
    resizeWidth = 256,
    staleHoldMs = 1200,
  } = opts;

  const [landmarks, setLandmarks] = useState<ARTorsoLandmarks | null>(null);
  const [active, setActive] = useState(false);

  // Refs let the polling loop see the freshest captureFrame without
  // re-creating the interval each render (which would reset cadence).
  const captureRef = useRef(captureFrame);
  useEffect(() => { captureRef.current = captureFrame; }, [captureFrame]);

  const lastGoodAtRef = useRef<number>(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || bookingId == null) {
      setLandmarks(null);
      setActive(false);
      return;
    }

    let cancelled = false;
    setActive(true);

    const downscaleFrame = async (rawDataUrl: string): Promise<string | null> => {
      try {
        const resized = await ImageManipulator.manipulateAsync(
          rawDataUrl,
          [{ resize: { width: resizeWidth } }],
          { compress: 0.55, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        if (!resized.base64) return null;
        return `data:image/jpeg;base64,${resized.base64}`;
      } catch {
        return null;
      }
    };

    const tick = async () => {
      if (cancelled || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const raw = await captureRef.current();
        if (!raw) return;
        const small = await downscaleFrame(raw);
        if (!small) return;
        const resp = (await api.post('/ai/live-pose-landmarks', {
          booking_id: bookingId,
          frame_data_url: small,
        })) as PoseResponse;
        if (cancelled) return;

        if (resp.ok) {
          lastGoodAtRef.current = Date.now();
          setLandmarks(resp.landmarks);
        } else if (resp.skipped) {
          // Rate-limited — keep the previous landmarks, nothing to do.
        } else {
          // no_pose or other failure — keep the last good landmarks
          // around until they exceed the stale window, then clear.
          const age = Date.now() - lastGoodAtRef.current;
          if (age > staleHoldMs) {
            setLandmarks(null);
          }
        }
      } catch {
        const age = Date.now() - lastGoodAtRef.current;
        if (age > staleHoldMs) {
          setLandmarks(null);
        }
      } finally {
        inFlightRef.current = false;
      }
    };

    const initial = setTimeout(tick, 600);
    const interval = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(interval);
      setActive(false);
    };
  }, [enabled, bookingId, intervalMs, resizeWidth, staleHoldMs]);

  return { landmarks, active };
}
