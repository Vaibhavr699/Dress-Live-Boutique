import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@shared/api/api';

type BookingStatus = 'requested' | 'accepted' | 'rejected' | 'rescheduled' | 'completed';

type Booking = {
  id: number;
  appointment_type: 'video' | 'in_store';
  status: BookingStatus;
  scheduled_for: string;
  language: string;
  location?: string | null;
  notes?: string | null;
  customer?: { id: number; full_name?: string | null; email: string } | null;
  dresses?: Array<{ id: number; name: string; price: number }> | null;
  boutique?: { id: number; name?: string | null; location?: string | null } | null;
};

export default function BookingDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ bookingId?: string }>();

  const bookingId = useMemo(() => {
    const raw = params.bookingId;
    if (typeof raw !== 'string') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [params.bookingId]);

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!bookingId) return;
    let mounted = true;
    setLoading(true);
    api
      .get(`/bookings/${bookingId}`)
      .then((data) => {
        if (!mounted) return;
        setBooking(data as Booking);
      })
      .catch((error) => {
        if (!mounted) return;
        Alert.alert('Booking', error instanceof Error ? error.message : 'Could not load booking.');
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [bookingId]);

  const updateStatus = async (status: BookingStatus) => {
    if (!bookingId) return;
    setUpdating(true);
    try {
      const updated = await api.put(`/bookings/${bookingId}`, { status });
      setBooking(updated as Booking);
    } catch (error) {
      Alert.alert('Booking', error instanceof Error ? error.message : 'Could not update booking.');
    } finally {
      setUpdating(false);
    }
  };

  const dressesLabel = booking?.dresses?.length
    ? booking.dresses.map((d) => d.name).join(', ')
    : 'No dress details available';

  return (
    <View className="flex-1 bg-white">
      <View
        className="px-6 flex-row items-center justify-between border-b border-[#F0F0F0] pb-4"
        style={{ paddingTop: insets.top + 10 }}
      >
        <TouchableOpacity onPress={() => router.back()} className="py-2 pr-4" hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="black" />
        </TouchableOpacity>
        <Text className="text-black text-sm font-bold uppercase tracking-[2px]">Booking</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : !booking ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-black/50 text-[12px] text-center">Booking not found.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <View className="px-6 pt-6">
            <Text className="text-black text-[16px] font-medium">Booking #{booking.id}</Text>
            <Text className="text-black/45 text-[11px] mt-2">
              {booking.customer?.full_name || booking.customer?.email || 'Customer'}
            </Text>

            <View className="mt-6 border border-[#EFEFEF] p-5">
              <Text className="text-black/30 text-[10px] font-bold uppercase tracking-[1px] mb-3">Details</Text>
              <Text className="text-black text-[12px] mb-2">Type: {booking.appointment_type}</Text>
              <Text className="text-black text-[12px] mb-2">Status: {booking.status}</Text>
              <Text className="text-black text-[12px] mb-2">Scheduled: {booking.scheduled_for}</Text>
              <Text className="text-black text-[12px] mb-2">Language: {booking.language}</Text>
              {booking.appointment_type === 'in_store' ? (
                <Text className="text-black text-[12px]">
                  Location: {booking.location || booking.boutique?.location || 'Boutique location pending'}
                </Text>
              ) : null}
            </View>

            <View className="mt-4 border border-[#EFEFEF] p-5">
              <Text className="text-black/30 text-[10px] font-bold uppercase tracking-[1px] mb-3">Dresses</Text>
              <Text className="text-black text-[12px] leading-5">{dressesLabel}</Text>
            </View>

            {booking.appointment_type === 'video' && booking.status !== 'rejected' ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() =>
                  router.push({
                    pathname: '/video-call',
                    params: { bookingId: String(booking.id) },
                  } as any)
                }
                className="w-full bg-black py-4 items-center justify-center mt-5"
              >
                <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">Open video call</Text>
              </TouchableOpacity>
            ) : null}

            <View className="flex-row mt-5">
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => updateStatus('accepted')}
                disabled={updating || booking.status === 'accepted' || booking.status === 'completed'}
                className="flex-1 border border-black py-4 items-center justify-center mr-1"
                style={{ opacity: updating || booking.status === 'completed' ? 0.4 : 1 }}
              >
                <Text className="text-black text-[11px] uppercase tracking-[1px]">Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => updateStatus('rejected')}
                disabled={updating || booking.status === 'rejected' || booking.status === 'completed'}
                className="flex-1 bg-[#C9491A] py-4 items-center justify-center ml-1"
                style={{ opacity: updating || booking.status === 'completed' ? 0.4 : 1 }}
              >
                <Text className="text-white text-[11px] uppercase tracking-[1px]">Reject</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => updateStatus('completed')}
              disabled={updating || booking.status === 'completed'}
              className={`w-full py-4 items-center justify-center mt-3 ${
                booking.status === 'completed' ? 'bg-black/30' : 'bg-black'
              }`}
            >
              <Text className="text-white text-[11px] uppercase tracking-[1px]">
                {booking.status === 'completed' ? 'Completed' : 'Mark completed'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

