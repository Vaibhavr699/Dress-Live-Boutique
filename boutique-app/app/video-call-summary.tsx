import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Alert } from 'react-native';
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
  dress_ids: number[];
  customer?: {
    id: number;
    full_name?: string | null;
    email: string;
  } | null;
  dresses?: Array<{
    id: number;
    name: string;
    price: number;
  }> | null;
  boutique?: {
    id: number;
    name?: string | null;
    location?: string | null;
  } | null;
};

export default function PartnerVideoCallSummaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ bookingId?: string; notes?: string; durationSeconds?: string }>();
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<Booking | null>(null);

  const bookingId = useMemo(() => {
    const raw = params.bookingId;
    if (typeof raw !== 'string') return null;
    const next = Number(raw);
    return Number.isFinite(next) ? next : null;
  }, [params.bookingId]);

  const durationLabel = useMemo(() => {
    const raw = typeof params.durationSeconds === 'string' ? Number(params.durationSeconds) : 0;
    const totalSeconds = Number.isFinite(raw) ? Math.max(0, raw) : 0;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    }
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }, [params.durationSeconds]);

  const dressesLabel = useMemo(() => {
    if (!booking) return 'Loading selected looks...';
    return booking.dresses?.length
      ? booking.dresses.map((dress) => dress.name).join(', ')
      : `${booking.dress_ids.length} selected dress(es)`;
  }, [booking]);

  const customerLabel = booking?.customer?.full_name || booking?.customer?.email || 'Customer';
  const appointmentLabel = booking?.appointment_type === 'video' ? 'Video consultation' : 'In-store appointment';
  const locationLabel =
    booking?.appointment_type === 'in_store'
      ? booking.location || booking.boutique?.location || 'Boutique location pending'
      : 'Remote video consultation';

  useEffect(() => {
    if (!bookingId) {
      setLoading(false);
      return;
    }
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
        Alert.alert('Call summary', error instanceof Error ? error.message : 'Could not load booking summary.');
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
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <View className="px-8 pt-12">
            <View className="w-14 h-14 rounded-full bg-black items-center justify-center mb-6">
              <Ionicons name="checkmark" size={26} color="white" />
            </View>

            <Text className="text-black text-[18px] font-medium mb-3">Session completed</Text>
            <Text className="text-black/55 text-[12px] leading-5 mb-8">
              {booking
                ? `${customerLabel}'s consultation has been marked as completed and saved to your bookings.`
                : `Booking #${typeof params.bookingId === 'string' ? params.bookingId : '—'} has been marked as completed.`}
            </Text>

            <View className="border border-[#F0F0F0] p-5 mb-4">
              <Text className="text-black/30 text-[10px] font-bold uppercase tracking-[1px] mb-4">Session overview</Text>
              <View className="mb-3">
                <Text className="text-black/35 text-[10px] font-bold uppercase tracking-[1px] mb-2">Booking</Text>
                <Text className="text-black text-[13px]">#{booking?.id ?? (typeof params.bookingId === 'string' ? params.bookingId : '—')}</Text>
              </View>
              <View className="mb-3">
                <Text className="text-black/35 text-[10px] font-bold uppercase tracking-[1px] mb-2">Customer</Text>
                <Text className="text-black text-[13px]">{customerLabel}</Text>
                {booking?.customer?.email ? (
                  <Text className="text-black/45 text-[11px] mt-1">{booking.customer.email}</Text>
                ) : null}
              </View>
              <View className="mb-3">
                <Text className="text-black/35 text-[10px] font-bold uppercase tracking-[1px] mb-2">Appointment</Text>
                <Text className="text-black text-[13px]">{appointmentLabel}</Text>
              </View>
              <View className="mb-3">
                <Text className="text-black/35 text-[10px] font-bold uppercase tracking-[1px] mb-2">Scheduled time</Text>
                <Text className="text-black text-[13px]">{booking?.scheduled_for || 'Time unavailable'}</Text>
              </View>
              <View className="mb-3">
                <Text className="text-black/35 text-[10px] font-bold uppercase tracking-[1px] mb-2">Duration</Text>
                <Text className="text-black text-[13px]">{durationLabel}</Text>
              </View>
              <View className="mb-3">
                <Text className="text-black/35 text-[10px] font-bold uppercase tracking-[1px] mb-2">Status</Text>
                <Text className="text-black text-[13px]">{booking?.status === 'completed' ? 'Completed' : 'Saved'}</Text>
              </View>
              <View className="mb-1">
                <Text className="text-black/35 text-[10px] font-bold uppercase tracking-[1px] mb-2">Location</Text>
                <Text className="text-black text-[13px]">{locationLabel}</Text>
              </View>
            </View>

            <View className="border border-[#F0F0F0] p-5 mb-4">
              <Text className="text-black/30 text-[10px] font-bold uppercase tracking-[1px] mb-3">Selected dresses</Text>
              <Text className="text-black text-[12px] leading-5">{dressesLabel}</Text>
            </View>

            {booking?.language ? (
              <View className="border border-[#F0F0F0] p-5 mb-4">
                <Text className="text-black/30 text-[10px] font-bold uppercase tracking-[1px] mb-3">Consultation language</Text>
                <Text className="text-black text-[12px] leading-5">{booking.language}</Text>
              </View>
            ) : null}

            {typeof params.notes === 'string' && params.notes.trim().length ? (
              <View className="border border-[#F0F0F0] p-5 mb-10">
                <Text className="text-black/30 text-[10px] font-bold uppercase tracking-[1px] mb-3">Internal notes</Text>
                <Text className="text-black text-[12px] leading-5">{params.notes}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() =>
                router.replace({
                  pathname: '/booking-details',
                  params: { bookingId: typeof params.bookingId === 'string' ? params.bookingId : '' },
                } as any)
              }
              className="w-full bg-black py-4 items-center justify-center mb-4"
            >
              <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">View booking</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.replace('/(tabs)/bookings')}
              className="w-full border border-black py-4 items-center justify-center"
            >
              <Text className="text-black text-[12px] font-bold tracking-[2px] uppercase">Back to bookings</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

