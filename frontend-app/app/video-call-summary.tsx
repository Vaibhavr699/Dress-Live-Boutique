import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@shared/api/api';

type BookingDress = {
  id: number;
  name?: string | null;
  price?: number | null;
  image_url?: string | null;
};

type Booking = {
  id: number;
  appointment_type: 'video' | 'in_store';
  status: string;
  scheduled_for: string;
  language?: string | null;
  boutique?: { id?: number | null; name?: string | null } | null;
  dresses?: BookingDress[] | null;
};

function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

function formatScheduled(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPrice(price: number): string {
  return Math.round(price).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export default function VideoCallSummaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ bookingId?: string; durationSeconds?: string }>();
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<Booking | null>(null);

  const bookingId = useMemo(() => {
    const raw = params.bookingId;
    if (typeof raw !== 'string') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [params.bookingId]);

  const durationSeconds = useMemo(() => {
    const raw = typeof params.durationSeconds === 'string' ? Number(params.durationSeconds) : 0;
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  }, [params.durationSeconds]);

  useEffect(() => {
    if (!bookingId) { setLoading(false); return; }
    let mounted = true;
    setLoading(true);
    api
      .get(`/bookings/${bookingId}`)
      .then((data) => { if (mounted) setBooking(data as Booking); })
      .catch(() => { if (mounted) setBooking(null); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [bookingId]);

  const boutiqueName = booking?.boutique?.name?.trim() || 'your boutique';
  const dresses = booking?.dresses ?? [];

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View
        className="px-6 flex-row items-center border-b border-[#F0F0F0] pb-4"
        style={{ paddingTop: insets.top + 10 }}
      >
        <Text className="text-black text-[14px] font-[400] uppercase tracking-[2px]">
          Call Summary
        </Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#1A1A1A" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        >
          {/* Success hero */}
          <View className="items-center px-8 pt-12 pb-8">
            <View className="w-16 h-16 rounded-full bg-black items-center justify-center mb-6">
              <Ionicons name="checkmark" size={30} color="white" />
            </View>
            <Text
              className="text-black text-center mb-3"
              style={{ fontFamily: 'Helvetica Neue', fontWeight: '400', fontSize: 20, lineHeight: 24, letterSpacing: 0.4 }}
            >
              Fitting Complete
            </Text>
            <Text
              className="text-center px-4"
              style={{ color: '#6E6E6E', fontFamily: 'Helvetica Neue', fontWeight: '300', fontSize: 13, lineHeight: 20 }}
            >
              Your video fitting session with {boutiqueName} has ended.
            </Text>
          </View>

          {/* Session details */}
          <View className="mx-6 border border-[#F0F0F0] mb-4">
            <View className="px-5 pt-4 pb-2 border-b border-[#F0F0F0]">
              <Text
                className="uppercase"
                style={{ color: '#AAAAAA', fontFamily: 'Helvetica Neue', fontWeight: '500', fontSize: 10, letterSpacing: 1.2 }}
              >
                Session Overview
              </Text>
            </View>

            {[
              { label: 'Boutique', value: booking?.boutique?.name?.trim() || '—' },
              { label: 'Scheduled', value: booking?.scheduled_for ? formatScheduled(booking.scheduled_for) : '—' },
              { label: 'Duration', value: durationSeconds > 0 ? formatDuration(durationSeconds) : '—' },
              { label: 'Language', value: booking?.language?.trim() || '—' },
            ].map(({ label, value }) => (
              <View key={label} className="px-5 py-3 flex-row items-start border-b border-[#F8F8F8]">
                <Text
                  className="w-24"
                  style={{ color: '#AAAAAA', fontFamily: 'Helvetica Neue', fontWeight: '400', fontSize: 11 }}
                >
                  {label}
                </Text>
                <Text
                  className="flex-1"
                  style={{ color: '#1A1A1A', fontFamily: 'Helvetica Neue', fontWeight: '400', fontSize: 12, lineHeight: 18 }}
                >
                  {value}
                </Text>
              </View>
            ))}
          </View>

          {/* Dresses previewed */}
          {dresses.length > 0 && (
            <View className="mx-6 border border-[#F0F0F0] mb-8">
              <View className="px-5 pt-4 pb-2 border-b border-[#F0F0F0]">
                <Text
                  className="uppercase"
                  style={{ color: '#AAAAAA', fontFamily: 'Helvetica Neue', fontWeight: '500', fontSize: 10, letterSpacing: 1.2 }}
                >
                  Dresses Previewed
                </Text>
              </View>
              {dresses.map((dress, idx) => (
                <View
                  key={dress.id}
                  className="px-5 py-3 flex-row items-center"
                  style={{ borderBottomWidth: idx < dresses.length - 1 ? 1 : 0, borderBottomColor: '#F8F8F8' }}
                >
                  <View className="w-10 h-12 bg-[#F5F5F5] overflow-hidden mr-4">
                    {dress.image_url ? (
                      <Image source={{ uri: dress.image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    ) : (
                      <View className="flex-1 items-center justify-center">
                        <Ionicons name="shirt-outline" size={16} color="rgba(0,0,0,0.25)" />
                      </View>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text
                      numberOfLines={1}
                      style={{ color: '#1A1A1A', fontFamily: 'Helvetica Neue', fontWeight: '400', fontSize: 12 }}
                    >
                      {dress.name?.trim() || `Dress #${dress.id}`}
                    </Text>
                    {typeof dress.price === 'number' && (
                      <Text
                        style={{ color: '#AAAAAA', fontFamily: 'Helvetica Neue', fontWeight: '300', fontSize: 11, marginTop: 2 }}
                      >
                        {formatPrice(dress.price)} €
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* CTAs */}
          <View className="mx-6 gap-3">
            {booking?.boutique?.id ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() =>
                  router.replace({
                    pathname: '/(tabs)/boutique-details',
                    params: { id: String(booking.boutique!.id) },
                  } as any)
                }
                className="w-full bg-black py-4 items-center justify-center"
              >
                <Text className="text-white text-[12px] font-bold tracking-[2.5px] uppercase">
                  Browse Boutique
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => router.replace('/(tabs)/' as any)}
                className="w-full bg-black py-4 items-center justify-center"
              >
                <Text className="text-white text-[12px] font-bold tracking-[2.5px] uppercase">
                  Back to Home
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.replace('/(tabs)/booking' as any)}
              className="w-full border border-black py-4 items-center justify-center"
            >
              <Text className="text-black text-[12px] font-bold tracking-[2.5px] uppercase">
                View Bookings
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
