import React, { useCallback, useMemo, useRef } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useRouter, useSegments } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

const EDGE_START_MAX = 30;

const TAB_ROOT_SCREENS = new Set(['index', 'cart', 'wishlist', 'booking', 'profile']);

function shouldEnable(segments: string[]): boolean {
  if (segments[0] !== '(tabs)') return false;
  const screen = typeof segments[1] === 'string' ? segments[1] : 'index';
  return !TAB_ROOT_SCREENS.has(screen);
}

let registeredHandler: (() => void) | null = null;

export function useSwipeBackHandler(handler: () => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useFocusEffect(
    useCallback(() => {
      const fn = () => handlerRef.current?.();
      registeredHandler = fn;
      return () => {
        if (registeredHandler === fn) registeredHandler = null;
      };
    }, [])
  );
}

type Props = { children: React.ReactNode };

export function EdgeSwipeBackProvider({ children }: Props) {
  const router = useRouter();
  const segments = useSegments() as string[];
  const { width } = useWindowDimensions();

  const enabled = shouldEnable(segments);

  const handleBack = () => {
    if (registeredHandler) {
      registeredHandler();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    }
  };

  const pan = useMemo(() => {
    return Gesture.Pan()
      .enabled(enabled)
      .activeOffsetX(15)
      .failOffsetY([-12, 12])
      .onBegin((e) => {
        'worklet';
        // Hint to RNGH to fail gestures that don't start at the edge.
        // Note: full validation happens on end.
      })
      .onEnd((e) => {
        'worklet';
        const startedAtEdge = e.absoluteX - e.translationX <= EDGE_START_MAX;
        if (!startedAtEdge) return;
        const passDistance = e.translationX > width * 0.22;
        const passVelocity = e.velocityX > 550 && e.translationX > 30;
        if (passDistance || passVelocity) {
          runOnJS(handleBack)();
        }
      });
  }, [enabled, width]);

  return (
    <GestureDetector gesture={pan}>
      <View collapsable={false} style={{ flex: 1 }}>
        {children}
      </View>
    </GestureDetector>
  );
}

// Backward-compatible alias for any earlier import
export const EdgeSwipeBack = () => null;
