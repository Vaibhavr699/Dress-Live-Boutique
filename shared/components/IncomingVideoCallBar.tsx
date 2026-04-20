import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../api/api';
import { useIncomingVideoRingStore } from '../store/useIncomingVideoRingStore';

type AppVariant = 'buyer' | 'partner';

type Props = {
  /** Buyer app uses `/(tabs)/video-call`; partner app uses `/video-call`. */
  app: AppVariant;
};

export function IncomingVideoCallBar({ app }: Props) {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const incoming = useIncomingVideoRingStore((s) => s.incoming);
  const setIncoming = useIncomingVideoRingStore((s) => s.setIncoming);
  const [busy, setBusy] = React.useState(false);

  const onVideoCallRoute =
    app === 'buyer'
      ? segments[0] === '(tabs)' && segments[1] === 'video-call'
      : segments[0] === 'video-call';

  if (!incoming || onVideoCallRoute) {
    return null;
  }

  const subtitle =
    incoming.scheduledFor != null && String(incoming.scheduledFor).trim() !== ''
      ? `Video fitting · ${String(incoming.scheduledFor).trim()}`
      : 'Video fitting · Tap to join';

  const navigateToCall = () => {
    if (app === 'buyer') {
      router.push({
        pathname: '/(tabs)/video-call',
        params: { bookingId: String(incoming.bookingId) },
      } as never);
    } else {
      router.push({
        pathname: '/video-call',
        params: { bookingId: String(incoming.bookingId) },
      } as never);
    }
  };

  const handleOpen = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.post('/video-calls/dismiss-ring', { booking_id: incoming.bookingId });
      setIncoming(null);
      navigateToCall();
    } catch {
      setBusy(false);
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.post('/video-calls/dismiss-ring', { booking_id: incoming.bookingId });
      setIncoming(null);
    } catch {
      // still hide locally
      setIncoming(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        top: Math.max(insets.top, 10) + 4,
        zIndex: 9999,
        elevation: 12,
      }}
      pointerEvents="box-none"
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#1A1A1A',
          borderRadius: 14,
          paddingVertical: 12,
          paddingHorizontal: 14,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
        }}
      >
        <Pressable
          onPress={handleOpen}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
          disabled={busy}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#34C759',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="videocam" size={22} color="#fff" />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
              {incoming.callerDisplayName}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 }} numberOfLines={2}>
              {subtitle}
            </Text>
          </View>
        </Pressable>
        <Pressable onPress={handleDismiss} hitSlop={12} style={{ padding: 6, marginLeft: 4 }} disabled={busy}>
          <Ionicons name="close" size={22} color="rgba(255,255,255,0.85)" />
        </Pressable>
      </View>
    </View>
  );
}
