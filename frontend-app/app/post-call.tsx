import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@shared/api/api';
import { FadeInView } from '@/components/ui/fade-in-view';


// Shape returned by GET /api/v1/bookings/{id}/post-call.
// Mirrors backend/app/schemas/booking.py PostCallView — keep field
// names in sync if either side changes.
type PostCallDress = {
  id: number;
  name: string;
  price: number;
  image_url?: string | null;
  colors?: string | null;
  sizes?: string | null;
};

type PostCallPayload = {
  booking_id: number;
  status: string;
  boutique?: { id: number; name?: string | null; location?: string | null } | null;
  scheduled_for?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  dresses: PostCallDress[];
};


function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

function formatPrice(price: number): string {
  return Math.round(price).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}


export default function PostCallScreen() {
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
  const [data, setData] = useState<PostCallPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId) {
      setError('Missing booking reference.');
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(null);
    api
      .get(`/bookings/${bookingId}/post-call`)
      .then((payload) => {
        if (!mounted) return;
        setData(payload as PostCallPayload);
      })
      .catch((e: unknown) => {
        if (!mounted) return;
        // The endpoint 400s on non-video bookings and 403s if the caller
        // isn't the buyer — surface a single friendly message rather than
        // leaking the API error to the bride.
        const msg = (e as { message?: string })?.message || '';
        setError(msg.includes('403') ? 'You can\'t view this session.' : 'Could not load your session.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [bookingId]);

  const boutiqueName = data?.boutique?.name?.trim() || 'your boutique';
  const dresses = data?.dresses ?? [];

  // Pending: the bride opened the link before the LiveKit room_finished
  // webhook has marked the booking complete. Show the picker anyway (the
  // dresses don't change after the call) but with a subtle banner so she
  // knows duration / receipt may take another moment.
  const isPending = !!data && data.status !== 'completed';

  function openDress(dress: PostCallDress) {
    if (!data?.boutique?.id) return;
    router.push({
      pathname: '/(tabs)/product-details',
      params: {
        id: String(dress.id),
        boutiqueId: String(data.boutique.id),
        coverImageUrl: dress.image_url ?? '',
      },
    });
  }

  return (
    <View className="flex-1 bg-white">
      <View
        className="px-6 flex-row items-center border-b border-[#F0F0F0] pb-4"
        style={{ paddingTop: insets.top + 10 }}
      >
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/' as any)}
          className="mr-3"
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={22} color="#1A1A1A" />
        </TouchableOpacity>
        <Text className="text-black text-[14px] font-[400] uppercase tracking-[2px]">
          Pick Your Favorite
        </Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#1A1A1A" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-[#6E6E6E] text-center text-[13px]">{error}</Text>
          <TouchableOpacity
            onPress={() => router.replace('/(tabs)/' as any)}
            className="mt-10 border-b border-black pb-1"
          >
            <Text className="text-black text-[11px] tracking-[2px] uppercase">Back to home</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FadeInView withTranslate={false} duration={260} style={{ flex: 1 }}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          >
            {/* Hero */}
            <View className="items-center px-8 pt-10 pb-6">
              <View className="w-14 h-14 rounded-full bg-black items-center justify-center mb-5">
                <Ionicons name="heart" size={24} color="white" />
              </View>
              <Text
                className="text-black text-center mb-2"
                style={{ fontFamily: 'Helvetica Neue', fontWeight: '400', fontSize: 20, lineHeight: 24, letterSpacing: 0.4 }}
              >
                Which dress was the one?
              </Text>
              <Text
                className="text-center px-4"
                style={{ color: '#6E6E6E', fontFamily: 'Helvetica Neue', fontWeight: '300', fontSize: 13, lineHeight: 20 }}
              >
                Tap any look from your fitting with {boutiqueName} to continue to checkout.
              </Text>
              {data?.duration_seconds ? (
                <Text
                  className="text-center mt-3"
                  style={{ color: '#AAAAAA', fontFamily: 'Helvetica Neue', fontWeight: '300', fontSize: 11 }}
                >
                  Session length · {formatDuration(data.duration_seconds)}
                </Text>
              ) : null}
              {isPending ? (
                <Text
                  className="text-center mt-3"
                  style={{ color: '#AAAAAA', fontFamily: 'Helvetica Neue', fontWeight: '300', fontSize: 11 }}
                >
                  Wrapping up your session…
                </Text>
              ) : null}
            </View>

            {/* Dress grid — 2 columns, tappable cards */}
            <View className="px-4 flex-row flex-wrap">
              {dresses.length === 0 ? (
                <View className="w-full items-center py-12">
                  <Text className="text-[#AAAAAA] text-[12px]">No dresses on this session.</Text>
                </View>
              ) : (
                dresses.map((dress) => (
                  <View key={dress.id} className="w-1/2 px-2 mb-4">
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => openDress(dress)}
                      className="border border-[#F0F0F0]"
                    >
                      <View className="bg-[#F5F5F5]" style={{ aspectRatio: 3 / 4 }}>
                        {dress.image_url ? (
                          <Image
                            source={{ uri: dress.image_url }}
                            style={{ width: '100%', height: '100%' }}
                            contentFit="cover"
                          />
                        ) : (
                          <View className="flex-1 items-center justify-center">
                            <Ionicons name="shirt-outline" size={28} color="rgba(0,0,0,0.25)" />
                          </View>
                        )}
                      </View>
                      <View className="px-3 py-3">
                        <Text
                          numberOfLines={1}
                          style={{ color: '#1A1A1A', fontFamily: 'Helvetica Neue', fontWeight: '400', fontSize: 12 }}
                        >
                          {dress.name?.trim() || `Dress #${dress.id}`}
                        </Text>
                        <Text
                          style={{ color: '#6E6E6E', fontFamily: 'Helvetica Neue', fontWeight: '300', fontSize: 11, marginTop: 2 }}
                        >
                          {formatPrice(dress.price)} €
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>

            {/* Secondary CTA */}
            <View className="mx-6 mt-2">
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
        </FadeInView>
      )}
    </View>
  );
}
