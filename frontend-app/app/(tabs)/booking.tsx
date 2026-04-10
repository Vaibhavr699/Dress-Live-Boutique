import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '@shared/api/api';

type Booking = {
  id: number;
  appointment_type: 'video' | 'in_store';
  status: 'requested' | 'accepted' | 'rejected' | 'rescheduled' | 'completed';
  scheduled_for: string;
  language: string;
  location?: string | null;
};

export default function BookingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadBookings = useCallback(async () => {
    try {
      const data = await api.get('/bookings/me');
      setBookings(Array.isArray(data) ? (data as Booking[]) : []);
    } catch (error) {
      console.error('Failed to load bookings:', error);
      Alert.alert('Bookings', error instanceof Error ? error.message : 'Could not load bookings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadBookings();
    }, [loadBookings])
  );

  const cancelBooking = async (id: number) => {
    setUpdatingId(id);
    try {
      const updated = await api.put(`/bookings/${id}`, { status: 'rejected' });
      setBookings((prev) => prev.map((booking) => (booking.id === id ? updated : booking)));
    } catch (error) {
      Alert.alert('Bookings', error instanceof Error ? error.message : 'Could not cancel this booking.');
    } finally {
      setUpdatingId(null);
    }
  };

  const isEmpty = bookings.length === 0;

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View 
        className="px-6 items-center border-b border-[#F0F0F0] pb-4" 
        style={{ paddingTop: insets.top + 10 }}
      >
        <Text className="text-black text-sm font-bold uppercase tracking-[2px]">
          Booking {bookings.length}
        </Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#1A1A1A" />
        </View>
      ) : isEmpty ? (
        <View className="flex-1 items-center justify-center px-10">
          <View className="mb-8 opacity-20">
            <MaterialCommunityIcons name="calendar-check-outline" size={64} color="black" />
          </View>
          <Text className="text-black text-sm font-medium uppercase tracking-[2px] mb-2 text-center">
            No Booking
          </Text>
          <Text className="text-black/40 text-[10px] text-center font-light leading-4 px-6">
            You haven&apos;t booked a video call or store visit yet. When you do, they will be shown here.
          </Text>
          
          <TouchableOpacity 
            onPress={() => router.push('/')}
            className="mt-10 border-b border-black pb-1"
          >
            <Text className="text-black text-xs font-bold uppercase tracking-[1px]">Book Now</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView 
          showsVerticalScrollIndicator={false} 
          className="flex-1"
          contentContainerStyle={{ paddingTop: 24, paddingBottom: 100 }}
        >
          {bookings.map((booking) => (
            <View key={booking.id} className="px-6 mb-10">
              <Text className="text-black text-[12px] font-bold uppercase mb-4 tracking-[1px] opacity-60">
                {booking.appointment_type === 'video' ? 'VIDEO CALL BOOKED' : 'STORE VISIT BOOKED'} | {booking.id}
              </Text>
              
              <View className="border border-[#F0F0F0] p-6 rounded-sm">
                {/* Actions Row */}
                <View className="flex-row justify-end mb-6 gap-6">
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

                {/* Details Section */}
                <View className="mb-6">
                  <Text className="text-black/30 text-[10px] font-bold uppercase mb-4 tracking-[0.5px]">
                    {booking.appointment_type === 'video' ? 'Date & Time:' : 'Store Visit Date/Time & Location'}
                  </Text>
                  <View className="flex-row items-center mb-6">
                    <MaterialCommunityIcons name="calendar-month-outline" size={20} color="black" className="mr-4" />
                    <Text className="text-black text-xs font-medium ml-4">{booking.scheduled_for}</Text>
                  </View>

                  <Text className="text-black/30 text-[10px] font-bold uppercase mb-4 tracking-[0.5px]">Languages</Text>
                  <View className="flex-row items-center">
                    <Ionicons name="globe-outline" size={20} color="black" className="mr-4" />
                    <Text className="text-black text-xs font-medium ml-4">{booking.language}</Text>
                  </View>

                  {booking.appointment_type === 'in_store' && (
                    <View className="flex-row items-center mt-6">
                      <Ionicons name="location-outline" size={20} color="black" className="mr-4" />
                      <Text className="text-black text-[11px] font-medium ml-4">
                        {booking.location || 'Boutique location shared by partner'}
                      </Text>
                    </View>
                  )}

                  <View className="mt-6 self-start rounded-full bg-black/5 px-3 py-2">
                    <Text className="text-[10px] font-bold uppercase tracking-[0.8px] text-black/60">
                      Status: {booking.status}
                    </Text>
                  </View>
                </View>

                {/* Main Action Button */}
                <TouchableOpacity 
                   onPress={() => booking.appointment_type === 'video' ? router.push('/(tabs)/video-call') : null}
                   className="w-full bg-black py-4 items-center justify-center mt-4"
                >
                  <Text className="text-white text-[12px] font-bold tracking-[2.5px] uppercase">
                    {booking.appointment_type === 'video' ? 'Start Video Call' : 'See Google Map'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {/* If there are bookings but fewer than multiple types, we could show empty placeholder logic but for now simple listing is best */}
        </ScrollView>
      )}
    </View>
  );
}

