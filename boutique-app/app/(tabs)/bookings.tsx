import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
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
    colors?: string | null;
    sizes?: string | null;
  }>;
  boutique?: {
    id: number;
    name?: string | null;
    location?: string | null;
  } | null;
};

function DetailRow({
  label,
  icon,
  text,
}: {
  label?: string;
  icon: 'calendar-outline' | 'globe-outline' | 'location-outline';
  text: string;
}) {
  return (
    <View className="mb-4">
      {label ? <Text className="text-[11px] text-black/70 mb-3">{label}</Text> : null}
      <View className="flex-row items-center">
        <Ionicons name={icon} size={18} color="#1A1A1A" />
        <Text className="ml-3 text-[11px] text-black/85">{text}</Text>
      </View>
    </View>
  );
}

export default function BookingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'new' | 'progress'>('new');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [updatingBookingId, setUpdatingBookingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rescheduleSlots, setRescheduleSlots] = useState<Record<number, string>>({});

  const loadBookings = useCallback(async () => {
    try {
      const data = await api.get('/bookings/partner');
      setBookings(Array.isArray(data) ? (data as Booking[]) : []);
      setActionError(null);
    } catch (error) {
      console.error('Failed to load partner bookings:', error);
      setActionError(error instanceof Error ? error.message : 'Could not load booking inbox.');
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

  const newRequests = useMemo(
    () => bookings.filter((booking) => booking.status === 'requested'),
    [bookings]
  );
  const managedBookings = useMemo(
    () => bookings.filter((booking) => booking.status !== 'requested'),
    [bookings]
  );

  const selectedBooking = useMemo(
    () => managedBookings.find((booking) => booking.id === selectedBookingId) ?? null,
    [managedBookings, selectedBookingId]
  );

  useEffect(() => {
    if (managedBookings.length === 0) {
      setSelectedBookingId(null);
      return;
    }

    if (!selectedBookingId || !managedBookings.some((booking) => booking.id === selectedBookingId)) {
      setSelectedBookingId(managedBookings[0].id);
    }
  }, [managedBookings, selectedBookingId]);

  const activeList = activeTab === 'new' ? newRequests : managedBookings;

  const updateBooking = async (
    bookingId: number,
    payload: { status?: BookingStatus; scheduled_for?: string; location?: string | null }
  ) => {
    setUpdatingBookingId(bookingId);
    setActionError(null);

    try {
      const updated = await api.put(`/bookings/${bookingId}`, payload);
      setBookings((current) =>
        current.map((booking) => (booking.id === bookingId ? (updated as Booking) : booking))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update booking.';
      setActionError(message);
      Alert.alert('Booking Update Failed', message);
    } finally {
      setUpdatingBookingId(null);
    }
  };

  const handleReschedule = async (booking: Booking) => {
    const nextSlot = (rescheduleSlots[booking.id] ?? booking.scheduled_for).trim();

    if (!nextSlot) {
      Alert.alert('Missing Slot', 'Please enter a new date and time before rescheduling.');
      return;
    }

    await updateBooking(booking.id, {
      status: 'rescheduled',
      scheduled_for: nextSlot,
      location: booking.appointment_type === 'in_store'
        ? booking.location || booking.boutique?.location || null
        : booking.location ?? null,
    });
  };

  const statusLabel = (status: BookingStatus) => {
    switch (status) {
      case 'requested':
        return 'Requested';
      case 'accepted':
        return 'Accepted';
      case 'rejected':
        return 'Rejected';
      case 'rescheduled':
        return 'Rescheduled';
      case 'completed':
        return 'Completed';
      default:
        return status;
    }
  };

  const dressSummary = (booking: Booking) =>
    booking.dresses?.length
      ? booking.dresses.map((dress) => dress.name).join(', ')
      : `${booking.dress_ids.length} selected dress(es)`;

  const customerName = (booking: Booking) =>
    booking.customer?.full_name || booking.customer?.email || 'Buyer';

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 110 }}
      >
        <View className="border-b border-[#EFEFEF] px-6 pb-6 pt-3 items-center">
          <Text className="text-[15px] font-semibold tracking-[0.1px] text-black">Calendar</Text>
        </View>

        <View className="px-6 pt-6 mb-8">
          <View className="flex-row items-center justify-center">
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setActiveTab('new')}
              className="flex-1 items-center py-2"
            >
              <Text className={`text-[13px] ${activeTab === 'new' ? 'text-black font-medium' : 'text-black/35 font-normal'}`}>
                New Requests
              </Text>
              {activeTab === 'new' ? <View className="mt-3 h-[1px] w-20 bg-black" /> : <View className="mt-3 h-[1px] w-20 bg-transparent" />}
            </TouchableOpacity>
            <View className="h-10 w-px bg-[#ECECEC]" />
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setActiveTab('progress')}
              className="flex-1 items-center py-2"
            >
              <Text className={`text-[13px] ${activeTab === 'progress' ? 'text-black font-medium' : 'text-black/35 font-normal'}`}>
                Managed Bookings
              </Text>
              {activeTab === 'progress' ? <View className="mt-3 h-[1px] w-28 bg-black" /> : <View className="mt-3 h-[1px] w-28 bg-transparent" />}
            </TouchableOpacity>
          </View>
        </View>

        <View className="px-6">
          {actionError ? (
            <View className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
              <Text className="text-[11px] text-red-600">{actionError}</Text>
            </View>
          ) : null}

          <Text className="text-[12px] uppercase tracking-[0.5px] text-black/80 mb-5">
            {activeTab === 'new'
              ? `New Requests | ${newRequests.length} |`
              : `Managed Bookings | ${managedBookings.length} |`}
          </Text>

          {loading ? (
            <View className="items-center justify-center py-24">
              <ActivityIndicator color="#1A1A1A" />
            </View>
          ) : activeList.length === 0 ? (
            <View className="items-center justify-center py-24">
              <View className="w-14 h-14 rounded-full border border-[#EAEAEA] items-center justify-center mb-4">
                <Ionicons name="calendar-outline" size={22} color="#1A1A1A" />
              </View>
              <Text className="text-[11px] font-bold uppercase tracking-[1.3px] text-black/55 mb-2">
                {activeTab === 'new' ? 'No New Requests' : 'No Managed Bookings'}
              </Text>
              <Text className="text-[10px] text-black/35 text-center leading-5 px-8">
                Buyer bookings will appear here once appointments are created in the customer app.
              </Text>
            </View>
          ) : activeTab === 'new' ? (
            <View className="gap-4">
              {newRequests.map((booking) => (
                <View key={booking.id} className="border border-[#2B2B2B] bg-white px-5 py-5">
                  <View className="flex-row items-center mb-6">
                    <View className="w-[46px] h-[46px] rounded-full bg-[#F7F7F7] items-center justify-center">
                      <Ionicons name="person-outline" size={20} color="#1A1A1A" />
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="text-[16px] text-black">{customerName(booking)}</Text>
                      <Text className="text-[10px] text-black/45 mt-1">{booking.customer?.email || 'No email'}</Text>
                    </View>
                  </View>

                  <DetailRow label="Date & Time" icon="calendar-outline" text={booking.scheduled_for} />
                  <DetailRow label="Languages" icon="globe-outline" text={booking.language} />
                  {booking.appointment_type === 'in_store' ? (
                    <DetailRow
                      label="Location"
                      icon="location-outline"
                      text={booking.location || booking.boutique?.location || 'Boutique location pending'}
                    />
                  ) : null}
                  <View className="mb-4">
                    <Text className="text-[11px] text-black/70 mb-3">Selected Dresses</Text>
                    <Text className="text-[11px] text-black/85 leading-5">{dressSummary(booking)}</Text>
                  </View>

                  <View className="flex-row mt-2">
                    <TouchableOpacity
                      activeOpacity={0.85}
                      disabled={updatingBookingId === booking.id}
                      onPress={() => updateBooking(booking.id, { status: 'accepted' })}
                      className="flex-1 border border-[#1A1A1A] py-4 items-center justify-center mr-1"
                    >
                      <Text className="text-[10px] text-black/80">
                        Accept Call Request
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      disabled={updatingBookingId === booking.id}
                      onPress={() => updateBooking(booking.id, { status: 'rejected' })}
                      className="flex-1 bg-[#C9491A] py-4 items-center justify-center ml-1"
                    >
                      <Text className="text-[10px] text-white">
                        Reject Call Request
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View className="mt-3 flex-row items-center">
                    <TextInput
                      value={rescheduleSlots[booking.id] ?? booking.scheduled_for}
                      onChangeText={(value) =>
                        setRescheduleSlots((current) => ({
                          ...current,
                          [booking.id]: value,
                        }))
                      }
                      placeholder="Enter a new date and time"
                      placeholderTextColor="#999999"
                      className="flex-1 border border-[#E5E5E5] px-4 py-3 text-[11px] text-black mr-2"
                    />
                    <TouchableOpacity
                      activeOpacity={0.85}
                      disabled={updatingBookingId === booking.id}
                      onPress={() => handleReschedule(booking)}
                      className="border border-[#1A1A1A] px-4 py-3"
                    >
                      <Text className="text-[10px] text-black/80">Reschedule</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <>
              <View className="gap-4">
                {managedBookings.map((booking) => {
                  const isSelected = booking.id === selectedBookingId;

                  return (
                    <TouchableOpacity
                      key={booking.id}
                      activeOpacity={0.9}
                      onPress={() => setSelectedBookingId(booking.id)}
                      className={`border bg-white px-5 py-5 ${isSelected ? 'border-[#1A1A1A]' : 'border-[#CFCFCF]'}`}
                    >
                      <View className="flex-row items-center mb-5">
                        <View className="w-[46px] h-[46px] rounded-full bg-[#F7F7F7] items-center justify-center">
                          <Ionicons name="person-outline" size={20} color="#1A1A1A" />
                        </View>
                        <View className="ml-3 flex-1">
                          <Text className="text-[16px] text-black">{customerName(booking)}</Text>
                          <Text className="text-[10px] text-black/45 mt-1">{booking.customer?.email || 'No email'}</Text>
                        </View>
                        <View className="bg-black/5 px-2 py-1 rounded-full">
                          <Text className="text-[9px] uppercase text-black/65">{statusLabel(booking.status)}</Text>
                        </View>
                      </View>

                      <DetailRow label="Date & Time" icon="calendar-outline" text={booking.scheduled_for} />
                      <DetailRow label="Languages" icon="globe-outline" text={booking.language} />
                      <DetailRow
                        label="Location"
                        icon="location-outline"
                        text={booking.location || booking.boutique?.location || 'Boutique location pending'}
                      />
                      <View className="mb-4">
                        <Text className="text-[11px] text-black/70 mb-3">Selected Dresses</Text>
                        <Text className="text-[11px] text-black/85 leading-5">{dressSummary(booking)}</Text>
                      </View>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        className="mt-2 bg-black py-4 items-center"
                        onPress={() => router.push('/video-call')}
                        disabled={booking.status === 'rejected'}
                      >
                        <Text className="text-[10px] tracking-[0.2px] text-white">
                          Start Video Call
                        </Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {selectedBooking ? (
                <View className="mt-8">
                  <Text className="text-[12px] uppercase tracking-[0.5px] text-black/80 mb-5">
                    Booking Details
                  </Text>
                  <View className="border border-[#2B2B2B] px-5 py-5 bg-white">
                    <Text className="text-[15px] text-black mb-1">
                      {selectedBooking.appointment_type === 'video' ? 'Video Call Appointment' : 'In-Store Appointment'}
                    </Text>
                    <Text className="text-[11px] text-black/45 mb-5">
                      {customerName(selectedBooking)} • {statusLabel(selectedBooking.status)}
                    </Text>

                    <DetailRow label="Date & Time" icon="calendar-outline" text={selectedBooking.scheduled_for} />
                    <DetailRow label="Languages" icon="globe-outline" text={selectedBooking.language} />
                    <DetailRow
                      label="Location"
                      icon="location-outline"
                      text={selectedBooking.location || selectedBooking.boutique?.location || 'Boutique location pending'}
                    />

                    <View className="mt-2 pt-4 border-t border-[#EFEFEF]">
                      <Text className="text-[11px] text-black/70 mb-2">
                        Buyer Contact
                      </Text>
                      <Text className="text-[11px] text-black/60 leading-5">
                        {selectedBooking.customer?.email || 'No email available'}
                      </Text>
                    </View>

                    <View className="mt-2 pt-4 border-t border-[#EFEFEF]">
                      <Text className="text-[11px] text-black/70 mb-2">
                        Dresses
                      </Text>
                      <Text className="text-[11px] text-black/60 leading-5">{dressSummary(selectedBooking)}</Text>
                    </View>

                    <View className="mt-2 pt-4 border-t border-[#EFEFEF]">
                      <Text className="text-[11px] text-black/70 mb-2">
                        Notes
                      </Text>
                      <Text className="text-[11px] text-black/60 leading-5">
                        {selectedBooking.notes || 'No internal notes have been added yet.'}
                      </Text>
                    </View>

                    <View className="mt-4 flex-row">
                      <TouchableOpacity
                        activeOpacity={0.85}
                        disabled={updatingBookingId === selectedBooking.id || selectedBooking.status === 'completed'}
                        onPress={() => updateBooking(selectedBooking.id, { status: 'accepted' })}
                        className="flex-1 border border-[#1A1A1A] py-4 items-center justify-center mr-1"
                      >
                        <Text className="text-[10px] text-black/80">Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        disabled={updatingBookingId === selectedBooking.id || selectedBooking.status === 'completed'}
                        onPress={() => updateBooking(selectedBooking.id, { status: 'rejected' })}
                        className="flex-1 bg-[#C9491A] py-4 items-center justify-center ml-1"
                      >
                        <Text className="text-[10px] text-white">Reject</Text>
                      </TouchableOpacity>
                    </View>

                    <View className="mt-3 flex-row items-center">
                      <TextInput
                        value={rescheduleSlots[selectedBooking.id] ?? selectedBooking.scheduled_for}
                        onChangeText={(value) =>
                          setRescheduleSlots((current) => ({
                            ...current,
                            [selectedBooking.id]: value,
                          }))
                        }
                        placeholder="Enter a new date and time"
                        placeholderTextColor="#999999"
                        className="flex-1 border border-[#E5E5E5] px-4 py-3 text-[11px] text-black mr-2"
                      />
                      <TouchableOpacity
                        activeOpacity={0.85}
                        disabled={updatingBookingId === selectedBooking.id || selectedBooking.status === 'completed'}
                        onPress={() => handleReschedule(selectedBooking)}
                        className="border border-[#1A1A1A] px-4 py-3"
                      >
                        <Text className="text-[10px] text-black/80">Reschedule</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
