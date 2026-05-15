import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';

/**
 * Live AR garment overlay rendered on top of a video feed (buyer's local
 * camera OR advisor's view of the buyer's remote video — same component,
 * same math, just different `mirror` value).
 *
 * Receives torso landmarks (normalized [0,1] image-space) and composes an
 * affine transform — rotate (shoulder line), translate (torso center),
 * scaleX (shoulder width), scaleY (shoulder→hip length). Each new sample
 * is animated into place over `tweenDurationMs` so a 5–10 Hz pose source
 * feels like 60 Hz on screen.
 *
 * This is intentionally NOT a full perspective warp — that needs a 3×3
 * homography which neither RN Animated nor `transform` styles support
 * natively. The affine approximation looks correct for forward-facing
 * subjects and degrades gracefully when the buyer turns. Upgrade to a
 * triangle-mesh SVG warp or Skia later if needed.
 */

export type ARLandmark = {
  x: number;            // normalized [0,1] image-space
  y: number;            // normalized [0,1] image-space
  visibility?: number;
};

export type ARTorsoLandmarks = {
  image_left_shoulder: ARLandmark;
  image_right_shoulder: ARLandmark;
  image_left_hip: ARLandmark;
  image_right_hip: ARLandmark;
  image_size?: { w: number; h: number };
};

type Props = {
  dressImageUrl: string | null;
  landmarks: ARTorsoLandmarks | null;
  containerWidth: number;
  containerHeight: number;
  /** Local PiPs are mirrored so the buyer sees themselves naturally. The
   * backend returns landmarks in *unmirrored* image space, so we mirror
   * X here to match the rendered view. For remote video on the advisor
   * side, pass `mirror={false}`. */
  mirror?: boolean;
  /** Hide entirely when false or when landmarks are stale. */
  visible?: boolean;
  /** Smoothing window for the affine tween in ms. Default 180. */
  tweenDurationMs?: number;
  /** Overall opacity — useful for fading the overlay in/out. */
  opacity?: number;
};

// The garment art is roughly centered between ~18%–82% horizontally and
// ~10%–75% vertically in a standard ghost-mannequin product photo. Those
// same fractions are used by the backend pose-warp renderer. We size the
// underlying <Image> to a "logical garment box" (W_LOGICAL × H_LOGICAL)
// and then scale that box to match the detected torso, with extra expand
// factors so the dress falls onto the body rather than just between the
// joint centers.
const SHOULDER_EXPAND = 0.18;        // widen ±18% beyond shoulder joints
const HEM_EXPAND_BELOW_HIPS = 0.55;  // extend hem ~55% below hip line
const HEM_EXPAND_ABOVE_SHOULDERS = 0.06;
const GARMENT_BOX_W = 100;           // arbitrary logical units
const GARMENT_BOX_H = 160;

function safeAvg(a: number, b: number): number {
  return (a + b) * 0.5;
}

export function ARGarmentOverlay(props: Props) {
  const {
    dressImageUrl,
    landmarks,
    containerWidth: W,
    containerHeight: H,
    mirror = true,
    visible = true,
    tweenDurationMs = 180,
    opacity = 0.92,
  } = props;

  // Shared values driven by every landmark update.
  const sv = {
    cx: useSharedValue(W / 2),
    cy: useSharedValue(H / 2),
    rotation: useSharedValue(0),
    scaleX: useSharedValue(1),
    scaleY: useSharedValue(1),
    show: useSharedValue(0),
  };

  React.useEffect(() => {
    if (!visible || !landmarks || !dressImageUrl) {
      sv.show.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) });
      return;
    }

    const ls = landmarks.image_left_shoulder;
    const rs = landmarks.image_right_shoulder;
    const lh = landmarks.image_left_hip;
    const rh = landmarks.image_right_hip;

    // Convert normalized coords → container pixels, mirroring X if needed.
    const xPx = (x: number) => (mirror ? 1 - x : x) * W;
    const yPx = (y: number) => y * H;

    const lsx = xPx(ls.x), lsy = yPx(ls.y);
    const rsx = xPx(rs.x), rsy = yPx(rs.y);
    const lhx = xPx(lh.x), lhy = yPx(lh.y);
    const rhx = xPx(rh.x), rhy = yPx(rh.y);

    const sdx = rsx - lsx;
    const sdy = rsy - lsy;
    const shoulderWidth = Math.hypot(sdx, sdy);

    const shoulderMidX = safeAvg(lsx, rsx);
    const shoulderMidY = safeAvg(lsy, rsy);
    const hipMidX = safeAvg(lhx, rhx);
    const hipMidY = safeAvg(lhy, rhy);
    const bodyHeight = Math.hypot(hipMidX - shoulderMidX, hipMidY - shoulderMidY);

    if (shoulderWidth < 8 || bodyHeight < 10) {
      sv.show.value = withTiming(0, { duration: 200 });
      return;
    }

    const rotationDeg = (Math.atan2(sdy, sdx) * 180) / Math.PI;
    const targetWidth = shoulderWidth * (1 + 2 * SHOULDER_EXPAND);
    const targetHeight = bodyHeight * (1 + HEM_EXPAND_ABOVE_SHOULDERS + HEM_EXPAND_BELOW_HIPS);
    const scaleX = targetWidth / GARMENT_BOX_W;
    const scaleY = targetHeight / GARMENT_BOX_H;

    const torsoMidX = safeAvg(shoulderMidX, hipMidX);
    const torsoMidY = safeAvg(shoulderMidY, hipMidY) + (bodyHeight * (HEM_EXPAND_BELOW_HIPS - HEM_EXPAND_ABOVE_SHOULDERS)) / 2;

    const dur = tweenDurationMs;
    sv.cx.value = withTiming(torsoMidX, { duration: dur, easing: Easing.out(Easing.quad) });
    sv.cy.value = withTiming(torsoMidY, { duration: dur, easing: Easing.out(Easing.quad) });
    sv.rotation.value = withTiming(rotationDeg, { duration: dur, easing: Easing.out(Easing.quad) });
    sv.scaleX.value = withTiming(scaleX, { duration: dur, easing: Easing.out(Easing.quad) });
    sv.scaleY.value = withTiming(scaleY, { duration: dur, easing: Easing.out(Easing.quad) });
    sv.show.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
  }, [landmarks, visible, dressImageUrl, W, H, mirror, tweenDurationMs]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: sv.show.value * opacity,
    transform: [
      { translateX: sv.cx.value - GARMENT_BOX_W / 2 },
      { translateY: sv.cy.value - GARMENT_BOX_H / 2 },
      { translateX: GARMENT_BOX_W / 2 },
      { translateY: GARMENT_BOX_H / 2 },
      { rotate: `${sv.rotation.value}deg` },
      { scaleX: sv.scaleX.value },
      { scaleY: sv.scaleY.value },
      { translateX: -GARMENT_BOX_W / 2 },
      { translateY: -GARMENT_BOX_H / 2 },
    ],
  }));

  if (!dressImageUrl) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            top: 0,
            width: GARMENT_BOX_W,
            height: GARMENT_BOX_H,
          },
          animatedStyle,
        ]}
      >
        <Image
          source={{ uri: dressImageUrl }}
          style={{ width: '100%', height: '100%' }}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      </Animated.View>
    </View>
  );
}

export default ARGarmentOverlay;
