import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '@shared/api/api';
import { useAuthStore } from '@shared/store/useAuthStore';
import { useBookingHistoryStore, BookingHistoryItem } from '@/store/useBookingHistoryStore';

function formatType(type: BookingHistoryItem['appointment_type']) {
  return type === 'video' ? 'VIDEO CALL' : 'STORE VISIT';
}

export default function BookingHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const items = useBookingHistoryStore((state) => state.items);
  const lastSyncedAt = useBookingHistoryStore((state) => state.lastSyncedAt);
  const setFromApi = useBookingHistoryStore((state) => state.setFromApi);
  const [syncing, setSyncing] = useState(false);

  const sortedItems = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => String(b.scheduled_for || '').localeCompare(String(a.scheduled_for || '')));
    return copy;
  }, [items]);

  const syncFromApi = useCallback(async () => {
    if (!isAuthenticated) return;
    if (syncing) return;
    setSyncing(true);
    try {
      const data = await api.get('/bookings/me');
      const next = Array.isArray(data) ? (data as BookingHistoryItem[]) : [];
      setFromApi(next);
    } catch (error) {
      Alert.alert('Booking history', error instanceof Error ? error.message : 'Could not sync booking history.');
    } finally {
      setSyncing(false);
    }
  }, [isAuthenticated, setFromApi, syncing]);

  useFocusEffect(
    useCallback(() => {
      syncFromApi();
    }, [syncFromApi])
  );

  return (
    <View className="flex-1 bg-white">
      <View className="px-6 flex-row items-center justify-between border-b border-[#F0F0F0] pb-4" style={{ paddingTop: insets.top + 10 }}>
        <TouchableOpacity onPress={() => router.back()} className="py-2 pr-4" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={22} color="black" />
        </TouchableOpacity>
        <Text className="text-black text-sm font-bold uppercase tracking-[2px]">Booking History</Text>
        <TouchableOpacity
          onPress={syncFromApi}
          disabled={!isAuthenticated || syncing}
          className="py-2 pl-4"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ opacity: !isAuthenticated || syncing ? 0.35 : 1 }}
        >
          {syncing ? <ActivityIndicator size="small" color="#1A1A1A" /> : <Ionicons name="refresh" size={18} color="black" />}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 90 }}>
        {sortedItems.length === 0 ? (
          <View className="px-8 pt-20 items-center">
            <Text className="text-black text-[12px] font-bold uppercase tracking-[2px] mb-3 text-center">No bookings yet</Text>
            <Text className="text-black/40 text-[11px] text-center leading-5 px-6">
              When you book a video call or store visit, it will appear here.
            </Text>
            <TouchableOpacity onPress={() => router.replace('/(tabs)')} className="mt-10 border-b border-black pb-1">
              <Text className="text-black text-xs font-bold uppercase tracking-[1px]">Browse dresses</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="px-6 pt-6">
            <Text className="text-black/35 text-[10px] font-bold uppercase tracking-[1px] mb-4">
              {sortedItems.length} booking(s){lastSyncedAt ? ` • synced` : ''}
            </Text>

            {sortedItems.map((b) => (
              <View key={b.id} className="mb-4 border border-[#F0F0F0] p-5">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-4">
                    <Text className="text-black text-[12px] font-bold uppercase tracking-[1px]">
                      {formatType(b.appointment_type)} • #{b.id}
                    </Text>
                    <Text className="text-black/50 text-[11px] mt-2">{b.scheduled_for}</Text>
                    <Text className="text-black/40 text-[11px] mt-1">{b.language}</Text>
                    {b.location ? <Text className="text-black/35 text-[11px] mt-1">{b.location}</Text> : null}
                  </View>
                  <View className="px-3 py-2 bg-black/5">
                    <Text className="text-black/60 text-[10px] font-bold uppercase tracking-[0.8px]">{b.status}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/booking-calendar',
                      params: {
                        bookingId: String(b.id),
                        appointmentType: b.appointment_type,
                        scheduledFor: b.scheduled_for,
                        language: b.language,
                        source: 'wishlist',
                      },
                    })
                  }
                  className="w-full bg-black py-4 items-center justify-center mt-4"
                >
                  <Text className="text-white text-[11px] font-bold uppercase tracking-[2px]">Reschedule</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

