import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';

/**
 * "Pop heart at center, fly to a target, fade out" animation.
 *
 * Used when a user adds something to favorites — gives them a visible
 * confirmation that the action landed somewhere (the header heart icon
 * on a detail screen, the wishlist tab on a list screen, etc.).
 *
 * Returns:
 *   - `overlay`  → JSX to drop at the top of your screen tree (always
 *                  rendered, hides itself when not animating).
 *   - `trigger`  → call this from your tap handler. Re-tap during an
 *                  in-flight animation is a no-op.
 *
 * Target coordinates are *offsets from the screen center*:
 *   - targetX > 0  → right of center
 *   - targetY < 0  → above center  (e.g. flying up to a header)
 *   - targetY > 0  → below center  (e.g. flying down to a tab bar)
 *
 * Pure JS — ships fine via OTA / EAS Update.
 */
export function useFloatingHeart(opts: {
  targetX: number;
  targetY: number;
  /** Big-heart size at peak. Default 120. */
  size?: number;
  /** Heart color. Default iOS red. */
  color?: string;
  /** Total animation duration in ms. Default 850. */
  durationMs?: number;
}) {
  const { targetX, targetY, size = 120, color = '#FF3B30', durationMs = 850 } = opts;

  const progress = useSharedValue(0);
  const [visible, setVisible] = useState(false);
  const animatingRef = useRef(false);

  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const p = progress.value;
    // Phase 1 (0 → 0.32): pop in, scale 0 → 1.25.
    // Phase 2 (0.32 → 1):  fly to target, scale 1.25 → 0.35.
    let scale: number;
    if (p < 0.32) {
      scale = (p / 0.32) * 1.25;
    } else {
      scale = 1.25 - ((p - 0.32) / 0.68) * 0.9;
    }
    const flyP = p < 0.32 ? 0 : (p - 0.32) / 0.68;
    const translateX = flyP * targetX;
    const translateY = flyP * targetY;
    // Hold full opacity until the heart is most of the way to the target,
    // then fade fast so it visibly "lands" rather than dissolving in space.
    const opacity = p < 0.7 ? 1 : Math.max(0, 1 - (p - 0.7) / 0.3);
    return {
      opacity,
      transform: [{ translateX }, { translateY }, { scale }],
    };
  });

  const finishAnimation = useCallback(() => {
    setVisible(false);
    animatingRef.current = false;
  }, []);

  const trigger = useCallback(() => {
    if (animatingRef.current) return;
    animatingRef.current = true;
    setVisible(true);
    progress.value = 0;
    progress.value = withTiming(
      1,
      { duration: durationMs, easing: Easing.out(Easing.cubic) },
      () => {
        'worklet';
        runOnJS(finishAnimation)();
      },
    );
  }, [progress, durationMs, finishAnimation]);

  const overlay = useMemo(() => {
    if (!visible) return null;
    return (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          elevation: 9999,
        }}
      >
        <Animated.View style={animatedStyle}>
          <Ionicons name="heart" size={size} color={color} />
        </Animated.View>
      </View>
    );
    // animatedStyle is a stable ref from useAnimatedStyle, safe to depend on.
  }, [visible, animatedStyle, size, color]);

  return { overlay, trigger };
}
