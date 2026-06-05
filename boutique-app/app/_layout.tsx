import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StripeProvider } from '@stripe/stripe-react-native';
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
import { api } from '@shared/api/api';
import { setupNotifications } from '@shared/notificationsSetup';
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

    const inProtectedTabs = segments[0] === '(tabs)';
    const onPublicAuthScreen = segments[0] === 'login' || segments[0] === 'signup';
    // Partners (owners) and advisors (invited team members) are both valid
    // boutique-app users; only other roles (e.g. buyers) are a mismatch.
    const isBoutiqueUser = user?.role === 'partner' || user?.role === 'advisor';
    const hasRoleMismatch = isAuthenticated && !!user && !isBoutiqueUser;

    if (hasRoleMismatch) {
      logout();
      router.replace('/login');
      return;
    }

    if (isAuthenticated && isBoutiqueUser && !inProtectedTabs && onPublicAuthScreen) {
      router.replace('/(tabs)');
      return;
    }

    if (!isAuthenticated && inProtectedTabs) {
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
        // Notification permission + register Expo push token with backend so
        // server-side dispatch can ring this device.
        if (Platform.OS !== 'web' && Constants.appOwnership !== 'expo') {
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const Notifications = require('expo-notifications') as typeof import('expo-notifications');
            const perm = await Notifications.getPermissionsAsync();
            if (perm.status !== 'granted') {
              await Notifications.requestPermissionsAsync();
            }
            // Register Android channels + iOS categories. Partner role gets
            // Accept/Decline inline buttons on booking-request pushes.
            await setupNotifications({ role: 'partner' });
            try {
              const tokenRes = await Notifications.getExpoPushTokenAsync();
              const expoToken = tokenRes?.data;
              if (expoToken) {
                try {
                  await api.post('/notifications/push-tokens', {
                    expo_token: expoToken,
                    platform: Platform.OS,
                  });
                } catch (err) {
                  console.warn('Failed to register partner push token:', err);
                }
              }
            } catch {
              // token resolution only works on real devices with valid project config
            }
          } catch {
            // ignore notifications wiring errors
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

  // Foreground push handler + notification-tap deep link.
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
      const sub = Notifications.addNotificationResponseReceivedListener(async (response) => {
        const data = response.notification.request.content.data as {
          action_type?: string | null;
          type?: string | null;
          bookingId?: number | string | null;
          action_id?: number | string | null;
        };
        const actionId = response.actionIdentifier; // e.g. 'accept', 'decline', 'view', or DEFAULT_ACTION_IDENTIFIER

        // Resolve the booking id from the push payload.
        const rawId = data?.bookingId ?? data?.action_id ?? null;
        const bookingId = typeof rawId === 'number' ? rawId : Number(rawId);

        // Inline Accept / Decline from the lock screen — call the API directly
        // so the partner can act without opening the app.
        if (Number.isFinite(bookingId) && (actionId === 'accept' || actionId === 'decline')) {
          try {
            await api.put(`/bookings/${bookingId}`, {
              status: actionId === 'accept' ? 'accepted' : 'rejected',
            });
          } catch {
            // If the silent action fails (offline, token expired, etc.), fall
            // back to opening the booking screen so the partner can retry.
            router.push('/(tabs)/bookings');
          }
          return;
        }

        // Default tap / "View" → open the booking tab.
        const action = data?.action_type ?? data?.type;
        // Buyer joined or is ringing → jump straight into the call screen so
        // the partner doesn't have to dig through the bookings tab.
        if (action === 'video_call') {
          if (Number.isFinite(bookingId)) {
            router.push({ pathname: '/video-call', params: { bookingId: String(bookingId) } });
          } else {
            router.push('/(tabs)/bookings');
          }
          return;
        }
        if (action === 'booking') {
          router.push('/(tabs)/bookings');
        }
        // Payment lifecycle pushes (order_paid, order_refunded) land the
        // partner on the wallet so they can verify the new balance / see
        // the order entry.
        if (action === 'order') {
          router.push('/earning-wallet');
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

  if (!appReady) {
    return <BootScreen />;
  }

  // Same pattern as the buyer app — publishable key is safe to ship; SDK
  // refuses sensitive ops without a server-minted client_secret.
  const stripePublishableKey =
    (process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY as string | undefined) || '';

  return (
    <StripeProvider
      publishableKey={stripePublishableKey}
      merchantIdentifier="merchant.com.atul.boutique.partner"
    >
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
        <Stack.Screen name="delete-account" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="delete-account-confirmation" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="earning-wallet" options={{ headerShown: false, animation: 'slide_from_right' }} />
        {/* Stripe Connect onboarding redirects land here, then bounce to the wallet. */}
        <Stack.Screen name="stripe-return" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="stripe-refresh" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="subscribe" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
        <Stack.Screen name="advisor-profile-edit" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="advisor-availability" options={{ title: 'Advisor Availability', headerBackTitle: 'Back', animation: 'slide_from_right' }} />
        <Stack.Screen name="security-password" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="security-password-verify" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="notifications" options={{ headerShown: false, animation: 'slide_from_right' }} />
      </Stack>
      <IncomingVideoCallBar app="partner" />
      <StatusBar style="auto" />
      </View>
    </ThemeProvider>
    </StripeProvider>
  );
}

