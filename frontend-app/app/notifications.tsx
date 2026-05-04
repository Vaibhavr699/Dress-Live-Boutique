import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotificationStore } from '@/store/useNotificationStore';

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function parseTimestamp(value: string) {
  const next = Date.parse(value);
  return Number.isFinite(next) ? next : 0;
}

function dedupeAndSort<T extends { id: string; externalKey?: string | null; createdAt: string; title: string; body?: string | null }>(
  items: T[]
) {
  const sorted = [...items].sort((a, b) => parseTimestamp(b.createdAt) - parseTimestamp(a.createdAt));
  const seen = new Set<string>();
  return sorted.filter((item) => {
    const key = (item.externalKey || '').trim() || `${item.title}|${item.body || ''}|${item.createdAt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toneForNotification(kind?: string | null) {
  switch (kind) {
    case 'booking_requested':
      return { badgeBg: '#EEF5FF', badgeText: '#2E5BFF', pillBg: '#EEF5FF', pillText: '#2E5BFF', border: '#D9E4FF' };
    case 'booking_updated':
      return { badgeBg: '#FFF6E8', badgeText: '#B76A00', pillBg: '#FFF6E8', pillText: '#B76A00', border: '#F3E1BE' };
    case 'booking_cancelled':
      return { badgeBg: '#FDECEC', badgeText: '#C9491A', pillBg: '#FDECEC', pillText: '#C9491A', border: '#F5D0C4' };
    case 'booking_upcoming':
    case 'booking_reminder':
      return { badgeBg: '#ECF8F1', badgeText: '#2F8F5B', pillBg: '#ECF8F1', pillText: '#2F8F5B', border: '#CFEAD9' };
    default:
      return { badgeBg: '#F4F4F4', badgeText: '#555555', pillBg: '#F4F4F4', pillText: '#555555', border: '#E9E9E9' };
  }
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const items = useNotificationStore((s) => s.items);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);

  const visibleItems = useMemo(() => dedupeAndSort(items), [items]);
  const unreadCount = useMemo(() => visibleItems.filter((n) => !n.readAt).length, [visibleItems]);

  return (
    <View className="flex-1 bg-white">
      <View className="px-6 flex-row items-center justify-between border-b border-[#F0F0F0] pb-4" style={{ paddingTop: insets.top + 10 }}>
        <TouchableOpacity onPress={() => router.back()} className="py-2 pr-4" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={22} color="black" />
        </TouchableOpacity>
        <Text className="text-black text-sm font-bold uppercase tracking-[2px]">Notifications</Text>
        <TouchableOpacity
          onPress={markAllRead}
          className="py-2 pl-4"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ opacity: visibleItems.length === 0 ? 0.35 : 1 }}
          disabled={visibleItems.length === 0}
        >
          <Text className="text-black text-[10px] font-bold uppercase tracking-[1px]">Mark all</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 90 }}>
        {visibleItems.length === 0 ? (
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
              {visibleItems.length} total
            </Text>

            {visibleItems.map((n) => {
              const unread = !n.readAt;
              const tone = toneForNotification(n.kind);
              return (
                <TouchableOpacity
                  key={n.id}
                  activeOpacity={0.9}
                  onPress={() => {
                    markRead(n.id);
                    if (n.action?.type === 'booking') {
                      router.push('/(tabs)/booking');
                    }
                  }}
                  className="mb-3 border p-5"
                  style={{ borderColor: unread ? tone.border : '#F0F0F0', backgroundColor: unread ? '#FFFEFC' : '#FFFFFF' }}
                >
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 pr-4">
                      <View className="flex-row items-center mb-2">
                        <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: tone.badgeBg }}>
                          <Ionicons
                            name={n.appointmentType === 'video' ? 'videocam-outline' : 'calendar-outline'}
                            size={16}
                            color={tone.badgeText}
                          />
                        </View>
                        <Text className="text-[10px] font-bold uppercase tracking-[1px] ml-2" style={{ color: tone.badgeText }}>
                          {n.appointmentType === 'video'
                            ? 'Video call'
                            : n.appointmentType === 'in_store'
                              ? 'Store visit'
                              : 'Update'}
                        </Text>
                      </View>
                      <Text className="text-black text-[12px] font-bold uppercase tracking-[1px]">{n.title}</Text>
                      {n.body ? <Text className="text-black/55 text-[11px] mt-2 leading-5">{n.body}</Text> : null}
                      {n.scheduledFor ? (
                        <Text className="text-black text-[11px] mt-3">
                          <Text className="font-bold">Time: </Text>
                          {n.scheduledFor}
                        </Text>
                      ) : null}
                      {n.boutiqueName ? (
                        <Text className="text-black/70 text-[11px] mt-1">
                          <Text className="font-bold">Boutique: </Text>
                          {n.boutiqueName}
                        </Text>
                      ) : null}
                      {n.location ? (
                        <Text className="text-black/55 text-[11px] mt-1" numberOfLines={2}>
                          <Text className="font-bold">Location: </Text>
                          {n.location}
                        </Text>
                      ) : null}
                      {n.status ? (
                        <View className="self-start rounded-full px-3 py-2 mt-3" style={{ backgroundColor: tone.pillBg }}>
                          <Text className="text-[10px] font-bold uppercase tracking-[0.8px]" style={{ color: tone.pillText }}>
                            Status: {n.status}
                          </Text>
                        </View>
                      ) : null}
                      <Text className="text-black/35 text-[10px] mt-3">{formatTime(n.createdAt)}</Text>
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

