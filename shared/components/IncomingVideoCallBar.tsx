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

  const callerRoleLabel = incoming.callerRole === 'partner' ? 'Boutique consultant' : 'Customer';
  const title = `${callerRoleLabel} is calling`;
  const subtitle =
    incoming.scheduledFor != null && String(incoming.scheduledFor).trim() !== ''
      ? `Video fitting · ${String(incoming.scheduledFor).trim()}`
      : 'Video fitting appointment';

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
        left: 16,
        right: 16,
        top: Math.max(insets.top, 10) + 4,
        zIndex: 9999,
        elevation: 12,
      }}
      pointerEvents="box-none"
    >
      <View
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 24,
          paddingVertical: 14,
          paddingHorizontal: 14,
          borderWidth: 1,
          borderColor: '#EFEFEF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.18,
          shadowRadius: 18,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: '#000000',
                fontFamily: 'Helvetica Neue',
                fontSize: 11,
                lineHeight: 11,
                fontWeight: '400',
                letterSpacing: 0.9,
                textTransform: 'uppercase',
              }}
              numberOfLines={1}
            >
              {title}
            </Text>
            <Text
              style={{
                color: '#000000',
                fontFamily: 'Helvetica Neue',
                fontSize: 16,
                lineHeight: 18,
                fontWeight: '500',
                marginTop: 6,
              }}
              numberOfLines={1}
            >
              {incoming.callerDisplayName}
            </Text>
            <Text
              style={{
                color: 'rgba(0,0,0,0.45)',
                fontFamily: 'Helvetica Neue',
                fontSize: 12,
                lineHeight: 16,
                marginTop: 4,
              }}
              numberOfLines={2}
            >
              {subtitle}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 12 }}>
            <Pressable
              onPress={handleDismiss}
              disabled={busy}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: '#F04438',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10,
                opacity: busy ? 0.55 : 1,
              }}
              hitSlop={8}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </Pressable>
            <Pressable
              onPress={handleOpen}
              disabled={busy}
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: '#34C759',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: busy ? 0.75 : 1,
              }}
              hitSlop={8}
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="videocam" size={25} color="#FFFFFF" />
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
