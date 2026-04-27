import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import "../global.css";

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFonts, PlayfairDisplay_700Bold, PlayfairDisplay_600SemiBold, PlayfairDisplay_400Regular } from '@expo-google-fonts/playfair-display';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { IncomingVideoCallBar } from '@shared/components/IncomingVideoCallBar';
import { useIncomingVideoRingPoller } from '@shared/hooks/useIncomingVideoRingPoller';
import '@shared/polyfills/domExceptionNative';
import { isLiveKitNativeSupported } from '@shared/livekitAvailability';
import { useAuthStore } from '@shared/store/useAuthStore';
import { useCartStore } from '@/store/useCartStore';
import { useShortlistStore } from '@/store/useShortlistStore';
import { useBookingHistoryStore } from '@/store/useBookingHistoryStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import * as Location from 'expo-location';
import Constants from 'expo-constants';

SplashScreen.preventAutoHideAsync();

function BootScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      <Text
        style={{
          color: '#111111',
          fontSize: 18,
          fontWeight: '700',
          letterSpacing: 4,
          textTransform: 'uppercase',
          textAlign: 'center',
        }}
      >
        Boutique Portal
      </Text>
      <View
        style={{
          width: 84,
          height: 2,
          backgroundColor: '#111111',
          opacity: 0.14,
          marginTop: 20,
          marginBottom: 18,
        }}
      />
      <Text
        style={{
          color: '#666666',
          fontSize: 12,
          letterSpacing: 1,
          textTransform: 'uppercase',
          textAlign: 'center',
        }}
      >
        Loading experience
      </Text>
    </View>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, user, logout } = useAuthStore();
  const [isReady, setIsReady] = useState(false);
  const prevAuthRef = useRef<boolean | null>(null);
  const permissionsRequestedRef = useRef(false);

  const [loaded, error] = useFonts({
    'PlayfairDisplay-Bold': PlayfairDisplay_700Bold,
    'PlayfairDisplay-SemiBold': PlayfairDisplay_600SemiBold,
    'PlayfairDisplay-Regular': PlayfairDisplay_400Regular,
  });

  const fontsReady = loaded || !!error;
  const appReady = fontsReady && isReady;

  useEffect(() => {
    if (fontsReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsReady]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!isLiveKitNativeSupported()) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const lk = require('@livekit/react-native');
      if (lk && typeof lk.registerGlobals === 'function') {
        lk.registerGlobals();
      }
      if (Platform.OS === 'android' && lk?.AudioSession?.configureAudio && lk?.AndroidAudioTypePresets?.communication) {
        lk.AudioSession.configureAudio({
          audioTypeOptions: lk.AndroidAudioTypePresets.communication,
          preferredOutputList: ['speaker', 'earpiece', 'bluetooth', 'headset'],
        });
      }
    } catch {
      // no-op
    }
  }, []);

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
        useBookingHistoryStore.getState().clear();
        useNotificationStore.getState().clear();
      } catch (error) {
        console.warn('Failed to clear guest state on logout:', error);
      }
    }
    prevAuthRef.current = isAuthenticated;

    const inTabsGroup = segments[0] === '(tabs)';
    const activeTabOrScreen = typeof segments[1] === 'string' ? segments[1] : '';
    const inAllowedAuthenticatedStack =
      typeof segments[0] === 'string' &&
      (
        segments[0].startsWith('profile-') ||
        ['booking-history', 'notifications', 'video-call-summary'].includes(segments[0])
      );
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
      (
        !inTabsGroup &&
        typeof segments[0] === 'string' &&
        (
          segments[0].startsWith('profile-') ||
          ['booking-history', 'notifications', 'video-call-summary'].includes(segments[0])
        )
      );

    if (!isAuthenticated && isProtectedForGuests) {
      router.replace('/signup');
      return;
    }

    if (isAuthenticated && !inTabsGroup && !inAllowedAuthenticatedStack) {
      // If user is authenticated and not in tabs, redirect to tabs
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, user, segments, isReady, router, logout]);

  useEffect(() => {
    if (!isReady) return;
    if (!isAuthenticated) {
      permissionsRequestedRef.current = false;
      return;
    }
    if (permissionsRequestedRef.current) return;
    permissionsRequestedRef.current = true;

    (async () => {
      try {
        // Notifications permission + token (only in dev build / standalone; Expo Go will throw).
        if (Platform.OS !== 'web' && Constants.appOwnership !== 'expo') {
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const Notifications = require('expo-notifications') as typeof import('expo-notifications');
            const notifPerm = await Notifications.getPermissionsAsync();
            if (notifPerm.status !== 'granted') {
              await Notifications.requestPermissionsAsync();
            }
            try {
              const token = await Notifications.getExpoPushTokenAsync();
              console.log('Expo push token:', token.data);
            } catch {
              // ignore token errors (works only on physical device + correct project setup)
            }
          } catch {
            // ignore notifications errors
          }
        }

        // Location permission (Home will auto-fetch if granted).
        const locPerm = await Location.getForegroundPermissionsAsync();
        if (locPerm.status !== 'granted') {
          await Location.requestForegroundPermissionsAsync();
        }
      } catch {
        // non-blocking
      }
    })();
  }, [isAuthenticated, isReady]);

  useEffect(() => {
    if (Platform.OS === 'web' || Constants.appOwnership === 'expo') return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Notifications = require('expo-notifications') as typeof import('expo-notifications');
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      const sub = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as {
          type?: string | null;
          bookingId?: number | string | null;
        };
        if (data?.type === 'booking') {
          router.push('/(tabs)/booking');
        }
      });
      return () => sub.remove();
    } catch {
      return;
    }
  }, [router]);

  const onBuyerVideoCallRoute = segments[0] === '(tabs)' && segments[1] === 'video-call';
  useIncomingVideoRingPoller(
    (loaded || !!error) && isAuthenticated && user?.role === 'buyer' && !onBuyerVideoCallRoute
  );

  if (!appReady) {
    return <BootScreen />;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1 }}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="landing" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="login" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="signup" options={{ headerShown: false, animation: 'fade' }} />
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
        <Stack.Screen name="booking-history" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="notifications" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="video-call-summary" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <IncomingVideoCallBar app="buyer" />
      <StatusBar style="auto" />
      </View>
    </ThemeProvider>
  );
}

