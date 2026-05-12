import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '@shared/api/api';

// Shape returned by GET /notifications/
type ServerNotification = {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  payload: Record<string, any> | null;
  action_type: string | null;
  action_id: number | null;
  read_at: string | null;
  created_at: string;
};

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function toneForKind(kind?: string | null) {
  if (!kind) return { badgeBg: '#F4F4F4', badgeText: '#555555', pillBg: '#F4F4F4', pillText: '#555555', border: '#E9E9E9' };
  if (kind.startsWith('booking_accepted') || kind === 'booking_upcoming' || kind === 'booking_reminder' || kind === 'booking_completed') {
    return { badgeBg: '#ECF8F1', badgeText: '#2F8F5B', pillBg: '#ECF8F1', pillText: '#2F8F5B', border: '#CFEAD9' };
  }
  if (kind === 'booking_rejected' || kind === 'booking_cancelled') {
    return { badgeBg: '#FDECEC', badgeText: '#C9491A', pillBg: '#FDECEC', pillText: '#C9491A', border: '#F5D0C4' };
  }
  if (kind === 'booking_rescheduled' || kind === 'booking_updated') {
    return { badgeBg: '#FFF6E8', badgeText: '#B76A00', pillBg: '#FFF6E8', pillText: '#B76A00', border: '#F3E1BE' };
  }
  if (kind === 'booking_request_received' || kind === 'booking_requested') {
    return { badgeBg: '#EEF5FF', badgeText: '#2E5BFF', pillBg: '#EEF5FF', pillText: '#2E5BFF', border: '#D9E4FF' };
  }
  return { badgeBg: '#F4F4F4', badgeText: '#555555', pillBg: '#F4F4F4', pillText: '#555555', border: '#E9E9E9' };
}

function badgeLabelForKind(kind: string, appointmentType?: string | null): string {
  if (appointmentType === 'video') return 'Video call';
  if (appointmentType === 'in_store') return 'Store visit';
  if (kind.startsWith('booking_')) return 'Booking';
  return 'Update';
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ServerNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(async () => {
    setError(null);
    try {
      const res = (await api.get('/notifications/?limit=50')) as { items?: ServerNotification[] };
      setItems(Array.isArray(res?.items) ? res.items : []);
    } catch (err: any) {
      const msg = err?.message || 'Could not load notifications.';
      setError(typeof msg === 'string' ? msg : 'Could not load notifications.');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchFeed();
      setLoading(false);
    })();
  }, [fetchFeed]);

  useFocusEffect(
    useCallback(() => {
      void fetchFeed();
    }, [fetchFeed])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchFeed();
    setRefreshing(false);
  }, [fetchFeed]);

  const unreadCount = useMemo(() => items.filter((n) => !n.read_at).length, [items]);

  const handleMarkAllRead = useCallback(async () => {
    if (items.length === 0) return;
    // Optimistic update.
    const stamp = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: stamp })));
    try {
      await api.post('/notifications/read-all', {});
    } catch {
      // Reload from server to recover state on failure.
      void fetchFeed();
    }
  }, [items.length, fetchFeed]);

  const handleTap = useCallback(
    async (n: ServerNotification) => {
      // Optimistic mark-as-read.
      if (!n.read_at) {
        const stamp = new Date().toISOString();
        setItems((prev) => prev.map((m) => (m.id === n.id ? { ...m, read_at: stamp } : m)));
        try {
          await api.post(`/notifications/${n.id}/read`, {});
        } catch {
          // ignore — local state already reflects the intent.
        }
      }
      if (n.action_type === 'booking') {
        router.push('/(tabs)/booking');
      }
    },
    [router]
  );

  return (
    <View className="flex-1 bg-white">
      <View
        className="px-6 flex-row items-center justify-between border-b border-[#F0F0F0] pb-4"
        style={{ paddingTop: insets.top + 10 }}
      >
        <TouchableOpacity onPress={() => router.back()} className="py-2 pr-4" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={22} color="black" />
        </TouchableOpacity>
        <Text className="text-black text-sm font-bold uppercase tracking-[2px]">Notifications</Text>
        <TouchableOpacity
          onPress={handleMarkAllRead}
          className="py-2 pl-4"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ opacity: items.length === 0 || unreadCount === 0 ? 0.35 : 1 }}
          disabled={items.length === 0 || unreadCount === 0}
        >
          <Text className="text-black text-[10px] font-bold uppercase tracking-[1px]">Mark all</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A1A1A" />}
      >
        {loading ? (
          <View className="flex-1 items-center justify-center pt-20">
            <ActivityIndicator color="#1A1A1A" />
          </View>
        ) : error ? (
          <View className="px-8 pt-20 items-center">
            <Text className="text-black text-[12px] font-bold uppercase tracking-[2px] mb-3 text-center">Could not load</Text>
            <Text className="text-black/40 text-[11px] text-center leading-5 px-6 mb-6">{error}</Text>
            <TouchableOpacity onPress={() => void fetchFeed()} className="border border-black px-5 py-3">
              <Text className="text-black text-[10px] font-bold uppercase tracking-[1.5px]">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : items.length === 0 ? (
          <View className="px-8 pt-20 items-center">
            <Text className="text-black text-[12px] font-bold uppercase tracking-[2px] mb-3 text-center">No notifications</Text>
            <Text className="text-black/40 text-[11px] text-center leading-5 px-6">
              Booking updates and reminders will appear here.
            </Text>
          </View>
        ) : (
          <View className="px-6 pt-6">
            <Text className="text-black/35 text-[10px] font-bold uppercase tracking-[1px] mb-4">
              {unreadCount > 0 ? `${unreadCount} unread • ` : ''}
              {items.length} total
            </Text>

            {items.map((n) => {
              const unread = !n.read_at;
              const tone = toneForKind(n.kind);
              const appointmentType = (n.payload as any)?.appointment_type ?? null;
              const scheduledFor = (n.payload as any)?.scheduled_for ?? null;
              const location = (n.payload as any)?.location ?? null;
              const status = (n.payload as any)?.status ?? null;
              const badgeLabel = badgeLabelForKind(n.kind, appointmentType);

              return (
                <TouchableOpacity
                  key={n.id}
                  activeOpacity={0.9}
                  onPress={() => void handleTap(n)}
                  className="mb-3 border p-5"
                  style={{ borderColor: unread ? tone.border : '#F0F0F0', backgroundColor: unread ? '#FFFEFC' : '#FFFFFF' }}
                >
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 pr-4">
                      <View className="flex-row items-center mb-2">
                        <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: tone.badgeBg }}>
                          <Ionicons
                            name={appointmentType === 'video' ? 'videocam-outline' : 'calendar-outline'}
                            size={16}
                            color={tone.badgeText}
                          />
                        </View>
                        <Text className="text-[10px] font-bold uppercase tracking-[1px] ml-2" style={{ color: tone.badgeText }}>
                          {badgeLabel}
                        </Text>
                      </View>
                      <Text className="text-black text-[12px] font-bold uppercase tracking-[1px]">{n.title}</Text>
                      {n.body ? <Text className="text-black/55 text-[11px] mt-2 leading-5">{n.body}</Text> : null}
                      {scheduledFor ? (
                        <Text className="text-black text-[11px] mt-3">
                          <Text className="font-bold">Time: </Text>
                          {scheduledFor}
                        </Text>
                      ) : null}
                      {location ? (
                        <Text className="text-black/55 text-[11px] mt-1" numberOfLines={2}>
                          <Text className="font-bold">Location: </Text>
                          {location}
                        </Text>
                      ) : null}
                      {status ? (
                        <View className="self-start rounded-full px-3 py-2 mt-3" style={{ backgroundColor: tone.pillBg }}>
                          <Text className="text-[10px] font-bold uppercase tracking-[0.8px]" style={{ color: tone.pillText }}>
                            Status: {String(status)}
                          </Text>
                        </View>
                      ) : null}
                      <Text className="text-black/35 text-[10px] mt-3">{formatTime(n.created_at)}</Text>
                    </View>
                    {unread ? <View className="w-2 h-2 rounded-full bg-black mt-1" /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
