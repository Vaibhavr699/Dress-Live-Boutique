import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import "../global.css";

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFonts, PlayfairDisplay_700Bold, PlayfairDisplay_600SemiBold, PlayfairDisplay_400Regular } from '@expo-google-fonts/playfair-display';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@shared/store/useAuthStore';
import { useCartStore } from '@/store/useCartStore';
import { useShortlistStore } from '@/store/useShortlistStore';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, user, logout } = useAuthStore();
  const [isReady, setIsReady] = useState(false);
  const prevAuthRef = useRef<boolean | null>(null);

  const [loaded, error] = useFonts({
    'PlayfairDisplay-Bold': PlayfairDisplay_700Bold,
    'PlayfairDisplay-SemiBold': PlayfairDisplay_600SemiBold,
    'PlayfairDisplay-Regular': PlayfairDisplay_400Regular,
  });

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  useEffect(() => {
    // Check if hydration is done from the store itself
    const hydrated = useAuthStore.persist.hasHydrated();
    if (hydrated) {
      setIsReady(true);
    } else {
      const unsub = useAuthStore.persist.onFinishHydration(() => {
        setIsReady(true);
      });
      return unsub;
    }
  }, []);


  useEffect(() => {
    if (!isReady) return;

    // Clear user-scoped state when transitioning from authed -> guest
    if (prevAuthRef.current === true && isAuthenticated === false) {
      try {
        useCartStore.getState().clearCart();
        useShortlistStore.getState().clear();
      } catch (error) {
        console.warn('Failed to clear guest state on logout:', error);
      }
    }
    prevAuthRef.current = isAuthenticated;

    const inTabsGroup = segments[0] === '(tabs)';
    const activeTabOrScreen = typeof segments[1] === 'string' ? segments[1] : '';
    const inAllowedAuthenticatedStack =
      typeof segments[0] === 'string' && segments[0].startsWith('profile-');
    const hasRoleMismatch = isAuthenticated && !!user && user.role !== 'buyer';

    if (hasRoleMismatch) {
      logout();
      router.replace('/login');
      return;
    }

    const isProtectedForGuests =
      (inTabsGroup &&
        [
          'booking',
          'booking-calendar',
          'checkout',
          'order-summary',
          'ai-try-on',
        ].includes(activeTabOrScreen)) ||
      (!inTabsGroup && typeof segments[0] === 'string' && segments[0].startsWith('profile-'));

    if (!isAuthenticated && isProtectedForGuests) {
      router.replace('/auth-choice');
      return;
    }

    if (isAuthenticated && !inTabsGroup && !inAllowedAuthenticatedStack) {
      // If user is authenticated and not in tabs, redirect to tabs
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, user, segments, isReady, router, logout]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="landing" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="login" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="signup" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="auth-choice" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="otp-verify" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="profile-edit-address" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="profile-my-measurements" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="profile-security-password" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="profile-verify-password" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="profile-delete-account" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="profile-confirm-delete" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="profile-payment-methods" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="profile-payment-details" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>


      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

