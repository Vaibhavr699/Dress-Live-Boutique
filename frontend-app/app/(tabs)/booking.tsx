import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking } from 'react-native';
import { FadeInView } from '@/components/ui/fade-in-view';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '@shared/api/api';
import { useAuthStore } from '@shared/store/useAuthStore';
import { useBookingHistoryStore } from '@/store/useBookingHistoryStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import {
  buildBookingNotificationDetails,
  sendLocalPhoneNotification,
  syncScheduledBookingReminder,
} from '@/lib/buyerNotifications';

const NO_BOOKING_ICON = require('@/assets/svg/No Booking.svg');
const LANGUAGE_ICON = require('@/assets/svg/Language.svg');
const MARKER_ICON = require('@/assets/svg/marker.svg');

type Booking = {
  id: number;
  appointment_type: 'video' | 'in_store';
  status: 'requested' | 'accepted' | 'rejected' | 'rescheduled' | 'completed';
  scheduled_for: string;
  language: string;
  location?: string | null;
  boutique?: { name?: string | null; location?: string | null } | null;
};

export default function BookingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const setBookingHistoryFromApi = useBookingHistoryStore((state) => state.setFromApi);
  const addNotification = useNotificationStore((s) => s.add);
  const upsertNotification = useNotificationStore((s) => s.upsert);
  const token = useAuthStore((s: any) => s.token);
  const [hydrated, setHydrated] = useState(() => useAuthStore.persist.hasHydrated());

  const openGoogleMaps = useCallback(async (query: string) => {
    const q = query?.trim();
    if (!q) {
      Alert.alert('Google Maps', 'Boutique location is not available yet.');
      return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('Google Maps', 'Could not open Google Maps.');
      return;
    }
    await Linking.openURL(url);
  }, []);

  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);

  const loadBookings = useCallback(async () => {
    if (!useAuthStore.getState().token) {
      setBookings([]);
      setBookingHistoryFromApi([]);
      setLoading(false);
      return;
    }
    try {
      const data = await api.get('/bookings/me');
      const next = Array.isArray(data) ? (data as Booking[]) : [];
      setBookings(next);
      setBookingHistoryFromApi(next as any);
      next
        .filter((booking) => ['requested', 'accepted', 'rescheduled'].includes(booking.status))
        .forEach((booking) => {
          upsertNotification(buildBookingNotificationDetails(booking, 'booking_upcoming'));
          void syncScheduledBookingReminder(booking);
        });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('Not authenticated') || message.toLowerCase().includes('unauthorized')) {
        setBookings([]);
        setBookingHistoryFromApi([]);
        return;
      }
      console.error('Failed to load bookings:', error);
      Alert.alert('Bookings', message || 'Could not load bookings.');
    } finally {
      setLoading(false);
    }
  }, [setBookingHistoryFromApi, upsertNotification]);

  useFocusEffect(
    useCallback(() => {
      if (!hydrated) return;
      setLoading(true);
      loadBookings();
    }, [loadBookings, token, hydrated])
  );

  const cancelBooking = async (id: number) => {
    setUpdatingId(id);
    try {
      const updated = await api.put(`/bookings/${id}`, { status: 'rejected' });
      setBookings((prev) => prev.map((booking) => (booking.id === id ? updated : booking)));
      const notification = buildBookingNotificationDetails(updated as Booking, 'booking_cancelled');
      addNotification(notification);
      void sendLocalPhoneNotification(notification);
    } catch (error) {
      Alert.alert('Bookings', error instanceof Error ? error.message : 'Could not cancel this booking.');
    } finally {
      setUpdatingId(null);
    }
  };

  const isEmpty = bookings.length === 0;
  const isLoggedIn = !!token;

  if (!hydrated) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator color="#1A1A1A" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View 
        className="px-6 items-center border-b border-[#F0F0F0] pb-4" 
        style={{ paddingTop: insets.top + 10 }}
      >
        <Text className="text-black text-[14px] font-[400] uppercase tracking-[2px]">
          Booking {bookings.length}
        </Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#1A1A1A" />
        </View>
      ) : !isLoggedIn ? (
        <FadeInView className="flex-1 items-center justify-center px-10">
          <View className="mb-8 opacity-20">
            <Image source={NO_BOOKING_ICON} style={{ width: 64, height: 64 }} />
          </View>
          <Text
            className="mb-2 uppercase"
            style={{
              color: '#000000',
              fontFamily: 'Helvetica Neue',
              fontWeight: '300',
              fontSize: 14,
              lineHeight: 14,
              letterSpacing: 0.56,
              textAlign: 'center',
            }}
          >
            Sign in required
          </Text>
          <Text
            className="text-center px-6"
            style={{
              color: '#6E6E6E',
              fontFamily: 'Helvetica Neue',
              fontWeight: '300',
              fontSize: 12,
              lineHeight: 12,
              letterSpacing: 0,
            }}
          >
            Log in to your account to see your bookings and start video calls.
          </Text>
          <TouchableOpacity onPress={() => router.push('/login')} className="mt-10 border-b border-black pb-1">
            <Text className="text-black text-xs font-bold uppercase tracking-[1px]">Sign in</Text>
          </TouchableOpacity>
        </FadeInView>
      ) : isEmpty ? (
        <FadeInView className="flex-1 items-center px-10" style={{ paddingTop: 76 }}>
          <View className="mb-6 items-center justify-center">
            <Image source={NO_BOOKING_ICON} style={{ width: 34, height: 34 }} contentFit="contain" />
          </View>
          <Text
            className="text-black uppercase mb-4 text-center"
            style={{
              fontFamily: 'Helvetica Neue',
              fontWeight: '300',
              fontSize: 14,
              lineHeight: 14,
              letterSpacing: 0.56,
            }}
          >
            No Booking
          </Text>
          <Text
            className="text-black/40 text-center px-6"
            style={{
              fontFamily: 'Helvetica Neue',
              fontWeight: '300',
              fontSize: 12,
              lineHeight: 24,
              letterSpacing: 0,
            }}
          >
            You haven&apos;t booked a video call or store visit yet.{'\n'}
            When you do, they will be shown here.
          </Text>
        </FadeInView>
      ) : (
        <ScrollView 
          showsVerticalScrollIndicator={false} 
          className="flex-1"
          contentContainerStyle={{ paddingTop: 24, paddingBottom: 100 }}
        >
          {bookings.map((booking) => {
            const isActionable = booking.status === 'accepted' || booking.status === 'rescheduled';
            const isTerminal = booking.status === 'rejected' || booking.status === 'completed';
            const statusLabel =
              booking.status === 'requested' ? 'Awaiting Confirmation' :
              booking.status === 'rejected'  ? 'Booking Declined' :
              booking.status === 'completed' ? 'Call Completed' : null;
            const actionLabel =
              booking.appointment_type === 'video' ? 'Start Video Call' : 'See Google Map';

            return (
            <View key={booking.id} className="px-5 mb-10">
              <Text className="text-black text-[14px] font-[400] uppercase mb-5 tracking-[0px]">
                {booking.appointment_type === 'video' ? 'VIDEO CALL BOOKED' : 'STORE VISIT BOOKED'}
              </Text>

              <View className="border border-black rounded-sm" style={{ height: 256, position: 'relative' }}>
                {/* Actions Row — hidden for terminal statuses */}
                {!isTerminal && (
                <View className="absolute right-4 top-3 flex-row gap-5 z-10">
                  <TouchableOpacity
                    onPress={() =>
                      router.push({
                        pathname: '/(tabs)/booking-calendar',
                        params: {
                          bookingId: String(booking.id),
                          appointmentType: booking.appointment_type,
                          scheduledFor: booking.scheduled_for,
                          language: booking.language,
                        },
                      })
                    }
                  >
                    <Feather name="edit-3" size={16} color="black" />
                  </TouchableOpacity>
                  <TouchableOpacity disabled={updatingId === booking.id} onPress={() => cancelBooking(booking.id)}>
                    <Feather name="trash-2" size={16} color="black" />
                  </TouchableOpacity>
                </View>
                )}

                {/* Details Section */}
                <View className="px-6 pt-5">
                  <Text
                    className="text-black mb-4"
                    style={{
                      fontFamily: 'Helvetica Neue',
                      fontWeight: '200',
                      fontSize: 14,
                      lineHeight: 14,
                      letterSpacing: 0.56,
                      textAlign: 'left',
                    }}
                  >
                    {booking.appointment_type === 'video' ? 'Data & Time:' : 'Date & Time:'}
                  </Text>
                  <View className="flex-row items-center mb-4">
                    <Image source={NO_BOOKING_ICON} style={{ width: 20, height: 20, marginRight: 16 }} />
                    <Text
                      className="text-black flex-1"
                      style={{
                        fontFamily: 'Helvetica Neue',
                        fontWeight: '500',
                        fontSize: 14,
                        lineHeight: 14,
                        letterSpacing: 0.56,
                        textAlign: 'left',
                      }}
                    >
                      {booking.scheduled_for}
                    </Text>
                  </View>

                  {booking.appointment_type === 'in_store' && (
                    <View className="flex-row items-center mb-4">
                      <Image source={MARKER_ICON} style={{ width: 20, height: 20, marginRight: 16 }} />
                      <Text
                        className="text-black flex-1"
                        numberOfLines={1}
                        style={{
                          fontFamily: 'Helvetica Neue',
                          fontWeight: '400',
                          fontSize: 14,
                          lineHeight: 14,
                          letterSpacing: 0.56,
                          textAlign: 'left',
                        }}
                      >
                        {booking.location || 'Boutique location shared by partner'}
                      </Text>
                    </View>
                  )}

                  <Text
                    className="text-black mb-4"
                    style={{
                      fontFamily: 'Helvetica Neue',
                      fontWeight: '300',
                      fontSize: 14,
                      lineHeight: 14,
                      letterSpacing: 0.56,
                      textAlign: 'left',
                    }}
                  >
                    Languages
                  </Text>
                  <View className="flex-row items-center">
                    <Image source={LANGUAGE_ICON} style={{ width: 20, height: 20, marginRight: 16 }} />
                    <Text
                      className="text-black flex-1"
                      style={{
                        fontFamily: 'Helvetica Neue',
                        fontWeight: '400',
                        fontSize: 14,
                        lineHeight: 14,
                        letterSpacing: 0.56,
                        textAlign: 'left',
                      }}
                    >
                      {booking.language}
                    </Text>
                  </View>
                </View>

                {/* Main Action Button */}
                <TouchableOpacity
                  disabled={!isActionable}
                  onPress={() => {
                    if (!isActionable) return;
                    if (booking.appointment_type === 'video') {
                      router.push({ pathname: '/(tabs)/video-call', params: { bookingId: String(booking.id) } } as any);
                      return;
                    }
                    const locationQuery = booking.location || booking.boutique?.location || '';
                    void openGoogleMaps(locationQuery);
                  }}
                  className="absolute left-0 right-0 bottom-0 items-center justify-center"
                  style={{ height: 48, backgroundColor: isActionable ? '#000' : '#F2F2F2' }}
                >
                  <Text
                    className="text-[12px] font-bold tracking-[2.5px] uppercase"
                    style={{ color: isActionable ? '#fff' : '#AAAAAA' }}
                  >
                    {statusLabel ?? actionLabel}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            );
          })}

          {/* If there are bookings but fewer than multiple types, we could show empty placeholder logic but for now simple listing is best */}
        </ScrollView>
      )}
    </View>
  );
}

