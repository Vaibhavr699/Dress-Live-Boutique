import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@shared/api/api';

export default function VideoCallSummaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ bookingId?: string }>();
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<any>(null);

  const bookingId = useMemo(() => {
    const raw = params.bookingId;
    if (typeof raw !== 'string') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [params.bookingId]);

  useEffect(() => {
    if (!bookingId) {
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    api
      .get('/bookings/me')
      .then((data) => {
        if (!mounted) return;
        const list = Array.isArray(data) ? data : [];
        setBooking(list.find((b: any) => b?.id === bookingId) ?? null);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [bookingId]);

  return (
    <View className="flex-1 bg-white">
      <View className="px-6 flex-row items-center border-b border-[#F0F0F0] pb-4" style={{ paddingTop: insets.top + 10 }}>
        <TouchableOpacity onPress={() => router.back()} className="py-2 pr-4" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={22} color="black" />
        </TouchableOpacity>
        <Text className="text-black text-sm font-bold uppercase tracking-[2px]">Call Summary</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#1A1A1A" />
        </View>
      ) : (
        <View className="px-8 pt-14">
          <Text className="text-black text-[16px] font-medium mb-3">Session completed</Text>
          <Text className="text-black/50 text-[12px] leading-5 mb-10">
            {booking?.scheduled_for ? `Booking: ${booking.scheduled_for}` : 'Your video fitting has ended.'}
          </Text>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.replace('/(tabs)/checkout')}
            className="w-full bg-black py-4 items-center justify-center mb-4"
          >
            <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">Choose Dress</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.replace('/(tabs)/booking')}
            className="w-full border border-black py-4 items-center justify-center"
          >
            <Text className="text-black text-[12px] font-bold tracking-[2px] uppercase">Back to bookings</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

