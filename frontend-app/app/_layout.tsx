import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ErrorBoundary } from '@/components/error-boundary';
import "../global.css";

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFonts, PlayfairDisplay_700Bold, PlayfairDisplay_600SemiBold, PlayfairDisplay_400Regular } from '@expo-google-fonts/playfair-display';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { LogBox, Platform, Text, View } from 'react-native';
import { IncomingVideoCallBar } from '@shared/components/IncomingVideoCallBar';
import { useIncomingVideoRingPoller } from '@shared/hooks/useIncomingVideoRingPoller';
import '@shared/polyfills/domExceptionNative';
import { api } from '@shared/api/api';
import { setupNotifications } from '@shared/notificationsSetup';
import { useAuthStore } from '@shared/store/useAuthStore';
import { useCartStore } from '@/store/useCartStore';
import { useShortlistStore } from '@/store/useShortlistStore';
import { useBookingHistoryStore } from '@/store/useBookingHistoryStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import * as Location from 'expo-location';
import Constants from 'expo-constants';

SplashScreen.preventAutoHideAsync();

if (__DEV__) {
  // Benign dev-only noise from expo-keep-awake when Metro toggles screen-wake.
  // Does not affect production builds.
  LogBox.ignoreLogs([/Unable to activate keep awake/, /ERR_KEEP_AWAKE/]);
}

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
            // Register Android channels + iOS categories with inline buttons.
            await setupNotifications({ role: 'buyer' });
            try {
              const tokenRes = await Notifications.getExpoPushTokenAsync();
              const expoToken = tokenRes?.data;
              if (expoToken) {
                // Register with backend so server-side dispatch can reach this device.
                try {
                  await api.post('/notifications/push-tokens', {
                    expo_token: expoToken,
                    platform: Platform.OS,
                  });
                } catch (err) {
                  console.warn('Failed to register push token:', err);
                }
              }
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
          action_type?: string | null;
          kind?: string | null;
          bookingId?: number | string | null;
          booking_id?: number | string | null;
          post_call?: boolean | null;
        };
        const action = data?.action_type ?? data?.type;
        // Tap on an incoming video-call push → jump straight into the call room
        // for that booking. The IncomingVideoCallBar polling path is still the
        // fallback when the app was foreground and the user dismissed the push.
        if (action === 'video_call') {
          const rawId = data?.bookingId ?? data?.booking_id ?? null;
          const id = typeof rawId === 'number' ? rawId : Number(rawId);
          if (Number.isFinite(id)) {
            router.push({ pathname: '/(tabs)/video-call', params: { bookingId: String(id) } });
            return;
          }
        }
        if (action === 'booking') {
          // `booking_completed` push from the LiveKit `room_finished` webhook
          // carries `post_call: true` — deep-link to the dress-picker rather
          // than the generic bookings tab.
          const isPostCall = data?.post_call === true || data?.kind === 'booking_completed';
          if (isPostCall) {
            const rawId = data?.bookingId ?? data?.booking_id ?? null;
            const id = typeof rawId === 'number' ? rawId : Number(rawId);
            if (Number.isFinite(id)) {
              router.push({ pathname: '/post-call', params: { bookingId: String(id) } } as any);
              return;
            }
          }
          router.push('/(tabs)/booking');
        }
      });
      return () => sub.remove();
    } catch {
      return;
    }
  }, [router]);

  const onBuyerVideoCallRoute = segments[0] === '(tabs)' && segments[1] === 'video-call';
  const hasActiveVideoBooking = useBookingHistoryStore(
    (s) => s.items.some(
      (b) => b.appointment_type === 'video' && ['requested', 'accepted', 'rescheduled'].includes(b.status)
    )
  );
  useIncomingVideoRingPoller(
    (loaded || !!error) && isAuthenticated && user?.role === 'buyer' && !onBuyerVideoCallRoute && hasActiveVideoBooking
  );

  if (!appReady) {
    return <BootScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ErrorBoundary>
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          animationDuration: 260,
          gestureEnabled: false,
          fullScreenGestureEnabled: false,
          contentStyle: { backgroundColor: '#FFFFFF' },
        }}
      >
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="landing" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade', animationDuration: 220 }} />
        <Stack.Screen name="login" options={{ animation: 'fade' }} />
        <Stack.Screen name="signup" options={{ animation: 'fade' }} />
        <Stack.Screen name="forgot-password" options={{ animation: 'fade' }} />
        <Stack.Screen name="otp-verify" options={{ gestureEnabled: true }} />
        <Stack.Screen name="reset-password" options={{ gestureEnabled: true }} />
        <Stack.Screen name="profile-edit-address" options={{ gestureEnabled: true }} />
        <Stack.Screen name="profile-my-measurements" options={{ gestureEnabled: true }} />
        <Stack.Screen name="profile-security-password" options={{ gestureEnabled: true }} />
        <Stack.Screen name="profile-verify-password" options={{ gestureEnabled: true }} />
        <Stack.Screen name="profile-delete-account" options={{ gestureEnabled: true }} />
        <Stack.Screen name="profile-confirm-delete" options={{ gestureEnabled: true }} />
        <Stack.Screen name="profile-payment-methods" options={{ gestureEnabled: true }} />
        <Stack.Screen name="profile-payment-details" options={{ gestureEnabled: true }} />
        <Stack.Screen name="booking-history" options={{ gestureEnabled: true }} />
        <Stack.Screen name="notifications" options={{ gestureEnabled: true }} />
        <Stack.Screen name="video-call-summary" options={{ gestureEnabled: true }} />
        <Stack.Screen name="post-call" options={{ gestureEnabled: true }} />
        <Stack.Screen name="decart-spike" options={{ gestureEnabled: true, headerShown: false }} />
        <Stack.Screen
          name="modal"
          options={{ presentation: 'modal', animation: 'slide_from_bottom', title: 'Modal', headerShown: true }}
        />
      </Stack>
      <IncomingVideoCallBar app="buyer" />
      <StatusBar style="auto" />
      </View>
    </ThemeProvider>
    </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

