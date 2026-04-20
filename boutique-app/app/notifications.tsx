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

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const items = useNotificationStore((s) => s.items);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);

  const unreadCount = useMemo(() => items.filter((n) => !n.readAt).length, [items]);

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
          style={{ opacity: items.length === 0 ? 0.35 : 1 }}
          disabled={items.length === 0}
        >
          <Text className="text-black text-[10px] font-bold uppercase tracking-[1px]">Mark all</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 90 }}>
        {items.length === 0 ? (
          <View className="px-8 pt-20 items-center">
            <Text className="text-black text-[12px] font-bold uppercase tracking-[2px] mb-3 text-center">No notifications</Text>
            <Text className="text-black/40 text-[11px] text-center leading-5 px-6">
              New requests, booking reminders, and customer appointment updates will appear here.
            </Text>
          </View>
        ) : (
          <View className="px-6 pt-6">
            <Text className="text-black/35 text-[10px] font-bold uppercase tracking-[1px] mb-4">
              {unreadCount > 0 ? `${unreadCount} unread • ` : ''}
              {items.length} total
            </Text>

            {items.map((n) => {
              const unread = !n.readAt;
              return (
                <TouchableOpacity
                  key={n.id}
                  activeOpacity={0.9}
                  onPress={() => {
                    markRead(n.id);
                    if (n.action?.type === 'booking') {
                      router.push('/(tabs)/bookings');
                    }
                  }}
                  className={`mb-3 border p-5 ${unread ? 'border-black' : 'border-[#F0F0F0]'}`}
                >
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 pr-4">
                      <View className="flex-row items-center mb-2">
                        <Ionicons
                          name={n.appointmentType === 'video' ? 'videocam-outline' : 'calendar-outline'}
                          size={16}
                          color="#1A1A1A"
                        />
                        <Text className="text-black/35 text-[10px] font-bold uppercase tracking-[1px] ml-2">
                          {n.appointmentType === 'video'
                            ? 'Video call'
                            : n.appointmentType === 'in_store'
                              ? 'Store visit'
                              : 'Update'}
                        </Text>
                      </View>
                      <Text className="text-black text-[12px] font-bold uppercase tracking-[1px]">{n.title}</Text>
                      {n.body ? <Text className="text-black/55 text-[11px] mt-2 leading-5">{n.body}</Text> : null}
                      {n.customerName ? (
                        <Text className="text-black text-[11px] mt-3">
                          <Text className="font-bold">Customer: </Text>
                          {n.customerName}
                        </Text>
                      ) : null}
                      {n.scheduledFor ? (
                        <Text className="text-black text-[11px] mt-1">
                          <Text className="font-bold">Time: </Text>
                          {n.scheduledFor}
                        </Text>
                      ) : null}
                      {n.location ? (
                        <Text className="text-black/55 text-[11px] mt-1" numberOfLines={2}>
                          <Text className="font-bold">Location: </Text>
                          {n.location}
                        </Text>
                      ) : null}
                      {n.status ? (
                        <View className="self-start rounded-full bg-black/5 px-3 py-2 mt-3">
                          <Text className="text-[10px] font-bold uppercase tracking-[0.8px] text-black/60">
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
