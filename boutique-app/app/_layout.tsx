import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import "../global.css";

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFonts, PlayfairDisplay_700Bold, PlayfairDisplay_600SemiBold, PlayfairDisplay_400Regular } from '@expo-google-fonts/playfair-display';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { IncomingVideoCallBar } from '@shared/components/IncomingVideoCallBar';
import { useIncomingVideoRingPoller } from '@shared/hooks/useIncomingVideoRingPoller';
import '@shared/polyfills/domExceptionNative';
import { isLiveKitNativeSupported } from '@shared/livekitAvailability';
import { useAuthStore } from '@shared/store/useAuthStore';
import { useIncomingVideoRingStore } from '@shared/store/useIncomingVideoRingStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import { usePartnerBookingNotificationsSync } from '@/hooks/usePartnerBookingNotificationsSync';
import { sendLocalPhoneNotification } from '@/lib/partnerNotifications';
import * as Location from 'expo-location';
import Constants from 'expo-constants';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, user, logout } = useAuthStore();
  const [isReady, setIsReady] = useState(false);
  const permissionsRequestedRef = useRef(false);
  const lastIncomingRingKeyRef = useRef<string | null>(null);
  const incomingRing = useIncomingVideoRingStore((s) => s.incoming);
  const upsertNotification = useNotificationStore((s) => s.upsert);

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

    const inProtectedTabs = segments[0] === '(tabs)';
    const onPublicAuthScreen = segments[0] === 'login' || segments[0] === 'signup';
    const hasRoleMismatch = isAuthenticated && !!user && user.role !== 'partner';

    if (hasRoleMismatch) {
      logout();
      router.replace('/login');
      return;
    }

    if (isAuthenticated && user?.role === 'partner' && !inProtectedTabs && onPublicAuthScreen) {
      router.replace('/(tabs)');
      return;
    }

    if (!isAuthenticated && inProtectedTabs) {
      useNotificationStore.getState().clear();
      // Keep protected pages behind login, but do not auto-skip the public landing flow.
      router.replace('/landing');
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
              // ignore
            }
          } catch {
            // ignore
          }
        }

        const locPerm = await Location.getForegroundPermissionsAsync();
        if (locPerm.status !== 'granted') {
          await Location.requestForegroundPermissionsAsync();
        }
      } catch {
        // ignore
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
          notificationKind?: string | null;
        };
        if (data?.notificationKind === 'video_waiting' && data?.bookingId != null) {
          router.push({
            pathname: '/video-call',
            params: { bookingId: String(data.bookingId) },
          } as never);
          return;
        }
        if (data?.type === 'booking') {
          router.push('/notifications');
        }
      });
      return () => sub.remove();
    } catch {
      return;
    }
  }, [router]);

  const onPartnerVideoCallRoute = segments[0] === 'video-call';
  useIncomingVideoRingPoller(
    (loaded || !!error) && isAuthenticated && user?.role === 'partner' && !onPartnerVideoCallRoute
  );
  usePartnerBookingNotificationsSync((loaded || !!error) && isAuthenticated && user?.role === 'partner');

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'partner') {
      lastIncomingRingKeyRef.current = null;
      return;
    }
    if (!incomingRing?.bookingId) {
      lastIncomingRingKeyRef.current = null;
      return;
    }

    const key = `partner-video-waiting-${incomingRing.bookingId}-${incomingRing.scheduledFor ?? ''}`;
    if (lastIncomingRingKeyRef.current === key) return;
    lastIncomingRingKeyRef.current = key;

    const notification = {
      externalKey: key,
      kind: 'video_waiting' as const,
      title: 'Customer waiting on video call',
      body: `${incomingRing.callerDisplayName} is waiting for you to join the Boutique Portal call.`,
      appointmentType: 'video' as const,
      scheduledFor: incomingRing.scheduledFor ?? null,
      customerName: incomingRing.callerDisplayName,
      status: 'waiting',
      action: { type: 'booking' as const, bookingId: incomingRing.bookingId },
    };

    upsertNotification(notification);
    void sendLocalPhoneNotification(notification);
  }, [incomingRing, isAuthenticated, upsertNotification, user?.role]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1 }}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="landing" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="signup" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="otp-verify" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="add-dress" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="video-call" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="video-call-summary" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="video-call-availability" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="video-call-availability-editor" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="team-invite" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="team-member-details" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="business-profile-edit" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="edit-address" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="store-opening-hours" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="store-opening-hours-editor" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="payment-methods" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="payment-method-details" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="delete-account" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="delete-account-confirmation" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="earning-wallet" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="withdraw-funds" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="security-password" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="security-password-verify" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="notifications" options={{ headerShown: false, animation: 'slide_from_right' }} />
      </Stack>
      <IncomingVideoCallBar app="partner" />
      <StatusBar style="auto" />
      </View>
    </ThemeProvider>
  );
}

