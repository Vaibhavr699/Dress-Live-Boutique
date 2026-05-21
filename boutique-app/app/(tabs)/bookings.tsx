import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '@shared/api/api';
import { SvgXml } from 'react-native-svg';
import { Image } from 'expo-image';

const CALENDAR_EMPTY_SVG = `<svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M3.97375 26.2962C2.39558 25.4221 1.41667 23.7589 1.41667 21.9583V11.3333H28.3333V23.375C28.3333 23.766 28.6507 24.0833 29.0417 24.0833C29.4327 24.0833 29.75 23.766 29.75 23.375V9.20833C29.75 5.69358 26.8897 2.83333 23.375 2.83333H22.6667V0.708333C22.6667 0.317333 22.3493 0 21.9583 0C21.5673 0 21.25 0.317333 21.25 0.708333V2.83333H8.5V0.708333C8.5 0.317333 8.18267 0 7.79167 0C7.40067 0 7.08333 0.317333 7.08333 0.708333V2.83333H6.375C2.86025 2.83333 0 5.69358 0 9.20833V21.9583C0 24.2746 1.25942 26.4123 3.28667 27.5372C3.39575 27.5967 3.51333 27.625 3.6295 27.625C3.87883 27.625 4.11967 27.4932 4.25 27.2609C4.43983 26.9181 4.31517 26.486 3.97375 26.2962ZM6.375 4.25H23.375C26.1092 4.25 28.3333 6.47417 28.3333 9.20833V9.91667H1.41667V9.20833C1.41667 6.47417 3.64083 4.25 6.375 4.25ZM34 33.2917C34 33.6827 33.6827 34 33.2917 34C32.9007 34 32.5833 33.6827 32.5833 33.2917C32.5833 30.9726 31.1752 29.0048 28.9057 28.1534L21.709 25.4547C21.4328 25.3512 21.25 25.0863 21.25 24.7917V17.8599C21.25 16.7422 20.4921 15.776 19.4877 15.6131C18.8487 15.5082 18.2325 15.6768 17.7494 16.0891C17.2734 16.4942 17 17.085 17 17.7083V28.2257C17 28.8207 16.6671 29.3519 16.1302 29.6112C15.5947 29.869 14.9713 29.7996 14.5052 29.4298C14.5052 29.4298 12.0757 27.4918 12.07 27.4862C11.2115 26.69 9.86992 26.7367 9.07375 27.5896C8.27333 28.4452 8.31725 29.7953 9.16442 30.5901L11.4778 32.7873C11.9382 33.2251 11.6294 34 10.9933 34C10.8134 34 10.6406 33.932 10.5103 33.8088L8.18692 31.6157C6.77025 30.2883 6.70225 28.0486 8.03675 26.6234C9.35142 25.2152 11.5515 25.1302 12.9795 26.4109C12.9837 26.4152 15.385 28.322 15.385 28.322L15.5805 28.2271V17.7097C15.5805 16.6699 16.0352 15.6853 16.8286 15.011C17.6219 14.3367 18.6787 14.0505 19.7115 14.2148C21.3945 14.4897 22.6638 16.0565 22.6638 17.8599V24.3001L29.4015 26.826C32.2362 27.8899 33.9972 30.3677 33.9972 33.2902L34 33.2917Z" fill="black"/>
</svg>`;

const CALENDAR_BOOKING_SVG = `<svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M3.97375 26.2962C2.39558 25.4221 1.41667 23.7589 1.41667 21.9583V11.3333H28.3333V23.375C28.3333 23.766 28.6507 24.0833 29.0417 24.0833C29.4327 24.0833 29.75 23.766 29.75 23.375V9.20833C29.75 5.69358 26.8897 2.83333 23.375 2.83333H22.6667V0.708333C22.6667 0.317333 22.3493 0 21.9583 0C21.5673 0 21.25 0.317333 21.25 0.708333V2.83333H8.5V0.708333C8.5 0.317333 8.18267 0 7.79167 0C7.40067 0 7.08333 0.317333 7.08333 0.708333V2.83333H6.375C2.86025 2.83333 0 5.69358 0 9.20833V21.9583C0 24.2746 1.25942 26.4123 3.28667 27.5372C3.39575 27.5967 3.51333 27.625 3.6295 27.625C3.87883 27.625 4.11967 27.4932 4.25 27.2609C4.43983 26.9181 4.31517 26.486 3.97375 26.2962ZM6.375 4.25H23.375C26.1092 4.25 28.3333 6.47417 28.3333 9.20833V9.91667H1.41667V9.20833C1.41667 6.47417 3.64083 4.25 6.375 4.25ZM34 33.2917C34 33.6827 33.6827 34 33.2917 34C32.9007 34 32.5833 33.6827 32.5833 33.2917C32.5833 30.9726 31.1752 29.0048 28.9057 28.1534L21.709 25.4547C21.4328 25.3512 21.25 25.0863 21.25 24.7917V17.8599C21.25 16.7422 20.4921 15.776 19.4877 15.6131C18.8487 15.5082 18.2325 15.6768 17.7494 16.0891C17.2734 16.4942 17 17.085 17 17.7083V28.2257C17 28.8207 16.6671 29.3519 16.1302 29.6112C15.5947 29.869 14.9713 29.7996 14.5052 29.4298C14.5052 29.4298 12.0757 27.4918 12.07 27.4862C11.2115 26.69 9.86992 26.7367 9.07375 27.5896C8.27333 28.4452 8.31725 29.7953 9.16442 30.5901L11.4778 32.7873C11.9382 33.2251 11.6294 34 10.9933 34C10.8134 34 10.6406 33.932 10.5103 33.8088L8.18692 31.6157C6.77025 30.2883 6.70225 28.0486 8.03675 26.6234C9.35142 25.2152 11.5515 25.1302 12.9795 26.4109C12.9837 26.4152 15.385 28.322 15.385 28.322L15.5805 28.2271V17.7097C15.5805 16.6699 16.0352 15.6853 16.8286 15.011C17.6219 14.3367 18.6787 14.0505 19.7115 14.2148C21.3945 14.4897 22.6638 16.0565 22.6638 17.8599V24.3001L29.4015 26.826C32.2362 27.8899 33.9972 30.3677 33.9972 33.2902L34 33.2917Z" fill="black"/>
</svg>`;

const LANGUAGES_SVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M4.514 15L6.16 16.264C6.51 16.532 6.971 16.576 7.361 16.382C7.754 16.189 7.998 15.796 7.998 15.359L8 10.504C8 9.126 6.879 8.004 5.501 8.004H2.501C2.501 8.004 2.501 8.003 2.499 8.003C1.832 8.003 1.205 8.263 0.732 8.734C0.26 9.207 0 9.835 0 10.503V12.502C0 13.881 1.121 15.002 2.5 15.002H4.514V15ZM1 12.5V10.501C1 10.1 1.156 9.723 1.439 9.44C1.722 9.157 2.099 9 2.499 9H5.501C6.327 9 7 9.676 7 10.503V15.358C6.99 15.487 6.876 15.539 6.77 15.47L4.989 14.103C4.901 14.036 4.795 13.999 4.684 13.999H2.5C1.673 13.999 1 13.326 1 12.499V12.5ZM23.469 11C23.193 11.011 22.979 11.244 22.99 11.52C22.997 11.679 23.001 11.839 23.001 11.999C23.001 13.411 22.724 14.757 22.237 15.999H17.368C17.751 14.87 18.001 13.69 18.001 12.499C18.001 12.223 17.777 11.999 17.501 11.999C17.225 11.999 17.001 12.223 17.001 12.499C17.001 13.68 16.722 14.866 16.302 15.999H10.001C9.725 15.999 9.501 16.223 9.501 16.499C9.501 16.775 9.725 16.999 10.001 16.999H15.891C14.665 19.691 12.774 21.921 12 22.769C11.343 22.049 9.898 20.36 8.735 18.257C8.602 18.015 8.297 17.93 8.055 18.062C7.814 18.196 7.726 18.5 7.86 18.742C8.855 20.541 10.02 22.02 10.794 22.918C7.245 22.526 4.074 20.443 2.338 17.261C2.207 17.018 1.902 16.928 1.66 17.062C1.418 17.194 1.328 17.498 1.461 17.74C3.567 21.602 7.606 24.001 12.001 24.001C18.618 24.001 24.001 18.618 24.001 12.001C24.001 11.827 23.997 11.653 23.99 11.48C23.977 11.204 23.739 10.981 23.469 11.001V11ZM13.197 22.931C14.213 21.758 15.905 19.576 16.988 16.999H21.785C20.134 20.218 16.95 22.522 13.197 22.931ZM2.229 5.912C2.001 5.756 1.944 5.445 2.1 5.217C4.343 1.95 8.044 0 12 0C13.247 0 14.477 0.19 15.652 0.566C15.915 0.65 16.06 0.931 15.976 1.194C15.891 1.457 15.61 1.605 15.347 1.518C14.648 1.295 13.928 1.151 13.196 1.072C13.537 1.467 13.951 1.972 14.4 2.575C14.565 2.797 14.518 3.11 14.296 3.275C14.077 3.439 13.763 3.395 13.597 3.172C12.947 2.299 12.357 1.621 11.999 1.229C11.299 1.996 9.679 3.888 8.472 6.228C8.344 6.476 8.039 6.569 7.798 6.443C7.553 6.317 7.456 6.015 7.583 5.77C8.633 3.734 9.952 2.053 10.798 1.073C7.633 1.42 4.749 3.121 2.922 5.783C2.765 6.012 2.452 6.067 2.227 5.912H2.229ZM13.5 7C13.776 7 14 7.224 14 7.5C14 7.776 13.776 8 13.5 8H9.5C9.224 8 9 7.776 9 7.5C9 7.224 9.224 7 9.5 7H13.5ZM17.146 10.501C16.974 10.501 16.8 10.462 16.639 10.382C16.246 10.188 16.002 9.796 16.002 9.358L16 4.503C16 3.125 17.121 2.003 18.499 2.003H21.499C21.499 2.003 21.499 2.002 21.501 2.002C22.168 2.002 22.795 2.262 23.268 2.733C23.74 3.206 24 3.834 24 4.502V6.501C24 7.879 22.879 9.001 21.5 9.001H19.486L17.84 10.265C17.635 10.422 17.391 10.501 17.146 10.501ZM21.5 3.001H18.5C17.674 3.003 17.001 3.676 17.001 4.503L17.003 9.358C17.003 9.431 17.046 9.468 17.082 9.485C17.118 9.503 17.175 9.514 17.231 9.47L19.012 8.103C19.1 8.036 19.206 7.999 19.317 7.999H21.501C22.328 7.999 23.001 7.326 23.001 6.499V4.5C23.001 4.099 22.845 3.722 22.562 3.439C22.278 3.155 21.863 3.01 21.5 3.001Z" fill="black"/>
</svg>`;

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
    profile_image_url?: string | null;
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

const isValidBooking = (value: any): value is Booking => {
  if (!value || typeof value !== 'object') return false;
  const idOk = typeof value.id === 'number' && Number.isFinite(value.id) && value.id > 0;
  const typeOk = value.appointment_type === 'video' || value.appointment_type === 'in_store';
  const statusOk =
    value.status === 'requested' ||
    value.status === 'accepted' ||
    value.status === 'rejected' ||
    value.status === 'rescheduled' ||
    value.status === 'completed';
  const scheduledOk = typeof value.scheduled_for === 'string' && value.scheduled_for.trim().length > 0;
  return idOk && typeOk && statusOk && scheduledOk;
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
    <View className="mb-6">
      {label ? <Text className="text-[14px] text-black/60 mb-5">{label}</Text> : null}
      <View className="flex-row items-center">
        {icon === 'calendar-outline' ? (
          <SvgXml xml={CALENDAR_BOOKING_SVG} width={20} height={20} />
        ) : icon === 'globe-outline' ? (
          <SvgXml xml={LANGUAGES_SVG} width={20} height={20} />
        ) : (
          <Ionicons name={icon} size={20} color="#1A1A1A" />
        )}
        <Text className="ml-4 text-[12px] text-black/85">{text}</Text>
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
  // const [search, setSearch] = useState('');

  // Stamp the last successful fetch so the focus-effect can skip refetches
  // inside the staleness window. updateBooking mutates the local list
  // optimistically, so it doesn't need to call loadBookings — but if any
  // path ever does, it should stamp this ref too.
  const lastBookingsFetchRef = useRef<number>(0);

  const loadBookings = useCallback(async () => {
    try {
      const data = await api.get('/bookings/partner');
      const next = Array.isArray(data) ? (data as any[]).filter(isValidBooking) : [];
      setBookings(next);
      setActionError(null);
      lastBookingsFetchRef.current = Date.now();
    } catch (error) {
      console.error('Failed to load partner bookings:', error);
      setActionError(error instanceof Error ? error.message : 'Could not load booking inbox.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Skip the full booking refetch if we loaded within the last 30s. Every
  // tab switch (Dashboard → Bookings → Dashboard → ...) used to re-fetch
  // the entire partner inbox.
  const BOOKINGS_STALE_MS = 30_000;
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastBookingsFetchRef.current < BOOKINGS_STALE_MS) return;
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
  const inProgressBookings = useMemo(
    () => managedBookings.filter((booking) => booking.status !== 'completed'),
    [managedBookings]
  );
  const managedVideoBookings = useMemo(
    () => managedBookings.filter((booking) => booking.appointment_type === 'video'),
    [managedBookings]
  );
  const managedInStoreBookings = useMemo(
    () => managedBookings.filter((booking) => booking.appointment_type === 'in_store'),
    [managedBookings]
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

  const activeList = activeTab === 'new' ? newRequests : inProgressBookings;

  const updateBooking = async (
    bookingId: number,
    payload: { status?: BookingStatus; scheduled_for?: string; location?: string | null }
  ) => {
    setUpdatingBookingId(bookingId);
    setActionError(null);

    try {
      const updated = await api.put(`/bookings/${bookingId}`, payload);
      const updatedBooking = updated as Booking;
      setBookings((current) =>
        current.map((booking) => (booking.id === bookingId ? updatedBooking : booking))
      );
      if (payload.status) {
        Alert.alert('Booking updated', `Status set to ${statusLabel(updatedBooking.status)}.`);
      }
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

  const bookingLocationText = (booking: Booking) =>
    booking.appointment_type === 'in_store'
      ? booking.location || booking.boutique?.location || 'Boutique location pending'
      : null;

  const isBookingLocked = (booking: Booking) =>
    booking.status === 'rejected' || booking.status === 'completed';

  // Manual pull-to-refresh — bypasses the 30s staleness gate. Doesn't
  // flip `loading` (which shows the full-screen spinner); just spins the
  // tiny refresh control in the scroll header.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadBookings();
    } finally {
      setRefreshing(false);
    }
  }, [loadBookings]);

  const matchesSearch = (booking: Booking) => {
    return true;
    // const q = search.trim().toLowerCase();
    // if (!q) return true;
    // const name = (booking.customer?.full_name || '').toLowerCase();
    // const email = (booking.customer?.email || '').toLowerCase();
    // return name.includes(q) || email.includes(q) || String(booking.id).includes(q);
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 110 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#1A1A1A"
            colors={['#1A1A1A']}
          />
        }
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
              <Text className={`text-[13px] text-center ${activeTab === 'new' ? 'text-black font-medium' : 'text-black/35 font-normal'}`}>
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
              <Text className={`text-[13px] text-center ${activeTab === 'progress' ? 'text-black font-medium' : 'text-black/35 font-normal'}`}>
                In Progress Bookings
              </Text>
              {activeTab === 'progress' ? <View className="mt-3 h-[1px] w-28 bg-black" /> : <View className="mt-3 h-[1px] w-28 bg-transparent" />}
            </TouchableOpacity>
          </View>
        </View>

        <View className="px-6">
          {/* <View className="mb-5">
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search customer, email, or booking #"
              placeholderTextColor="#999999"
              className="border border-[#E5E5E5] px-4 py-3 text-[11px] text-black"
            />
          </View> */}
          {actionError ? (
            <View className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
              <Text className="text-[11px] text-red-600">{actionError}</Text>
            </View>
          ) : null}

    
          {loading ? (
            <View className="items-center justify-center py-24">
              <ActivityIndicator color="#1A1A1A" />
            </View>
          ) : activeList.filter(matchesSearch).length === 0 ? (
            <View className="items-center justify-center py-24">
              <View className="mb-4">
                <SvgXml xml={CALENDAR_EMPTY_SVG} width={34} height={34} />
              </View>
              <Text className="text-[12px] font-bold uppercase tracking-[1.3px] text-black/70 mb-3 text-center">
                NO CUSTOMER’S BOOKING YET!
              </Text>
              <Text className="text-[11px] text-black/35 text-center leading-5 px-10">
                Customer haven&apos;t booked a video call or store visit yet.
              </Text>
              <Text className="text-[11px] text-black/35 text-center leading-5 px-10 mt-1">
                When customer do, they will be shown requests here.
              </Text>
            </View>
          ) : activeTab === 'new' ? (
            <View className="gap-4">
              {newRequests.filter(matchesSearch).map((booking) => (
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
                      text={bookingLocationText(booking) || 'Boutique location pending'}
                    />
                  ) : null}
                  <View className="mb-4">
                    <Text className="text-[11px] text-black/70 mb-3">Selected Dresses</Text>
                    <Text className="text-[11px] text-black/85 leading-5">{dressSummary(booking)}</Text>
                  </View>

                  {(() => {
                    const isUpdating = updatingBookingId === booking.id;
                    return (
                      <>
                        <View className="flex-row mt-2">
                          <TouchableOpacity
                            activeOpacity={0.85}
                            disabled={isUpdating}
                            onPress={() => updateBooking(booking.id, { status: 'accepted' })}
                            className="flex-1 border border-[#1A1A1A] py-4 items-center justify-center mr-1"
                            style={{ opacity: isUpdating ? 0.55 : 1 }}
                          >
                            {isUpdating ? (
                              <ActivityIndicator color="#1A1A1A" size="small" />
                            ) : (
                              <Text className="text-[10px] text-black/80">Accept Call Request</Text>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity
                            activeOpacity={0.85}
                            disabled={isUpdating}
                            onPress={() => updateBooking(booking.id, { status: 'rejected' })}
                            className="flex-1 bg-[#C9491A] py-4 items-center justify-center ml-1"
                            style={{ opacity: isUpdating ? 0.55 : 1 }}
                          >
                            {isUpdating ? (
                              <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                              <Text className="text-[10px] text-white">Reject Call Request</Text>
                            )}
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
                            editable={!isUpdating}
                            className="flex-1 border border-[#E5E5E5] px-4 py-3 text-[11px] text-black mr-2"
                          />
                          <TouchableOpacity
                            activeOpacity={0.85}
                            disabled={isUpdating}
                            onPress={() => handleReschedule(booking)}
                            className="border border-[#1A1A1A] px-4 py-3"
                            style={{ opacity: isUpdating ? 0.55 : 1, minWidth: 92, minHeight: 38, alignItems: 'center', justifyContent: 'center' }}
                          >
                            {isUpdating ? (
                              <ActivityIndicator color="#1A1A1A" size="small" />
                            ) : (
                              <Text className="text-[10px] text-black/80">Reschedule</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </>
                    );
                  })()}
                </View>
              ))}
            </View>
          ) : (
            <>
              <View>
                <Text className="text-[12px] uppercase tracking-[0.5px] text-black/80 mb-4">
                  {`Video call booked | ${managedVideoBookings.length} |`}
                </Text>
                <View className="gap-4">
                  {managedVideoBookings.filter(matchesSearch).map((booking) => {
                    const isSelected = booking.id === selectedBookingId;
                    const primaryButtonLabel = 'START VIDEO CALL';
                    const customerImageUrl = booking.customer?.profile_image_url ?? null;

                    return (
                      <TouchableOpacity
                        key={booking.id}
                        activeOpacity={0.9}
                        onPress={() => setSelectedBookingId(booking.id)}
                        className={`border bg-white ${isSelected ? 'border-[#1A1A1A]' : 'border-[#CFCFCF]'}`}
                        style={{ height: 310 }}
                      >
                        <View className="px-5 pt-5 pb-4" style={{ flex: 1 }}>
                          <View className="flex-row items-end">
                            <View className="bg-[#F2F2F2] mr-4 overflow-hidden" style={{ width: 50, height: 50, borderRadius: 2 }}>
                              <Image
                                source={
                                  customerImageUrl
                                    ? { uri: customerImageUrl }
                                    : require('../../assets/images/avatar.png')
                                }
                                style={{ width: '100%', height: '100%' }}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                onError={(e) =>
                                  console.log('Booking customer image failed', {
                                    url: customerImageUrl,
                                    error: e?.error,
                                  })
                                }
                              />
                            </View>
                            <View className="flex-1" style={{ paddingBottom: 2 }}>
                              <Text className="text-[16px] text-black" style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}>
                                {customerName(booking)}
                              </Text>
                            </View>
                          </View>

                          <View className="mt-6">
                            <Text className="text-[14px] text-black/60 mb-5">Date & Time:</Text>
                            <View className="flex-row items-center">
                              <SvgXml xml={CALENDAR_BOOKING_SVG} width={20} height={20} />
                              <Text className="ml-4 text-[12px] text-black/85">{booking.scheduled_for}</Text>
                            </View>
                          </View>

                          <View className="mt-6">
                            <Text className="text-[14px] text-black/60 mb-5">Languages</Text>
                            <View className="flex-row items-center">
                              <SvgXml xml={LANGUAGES_SVG} width={20} height={20} />
                              <Text className="ml-4 text-[12px] text-black/85">{booking.language}</Text>
                            </View>
                          </View>

                        </View>

                        <TouchableOpacity
                          activeOpacity={0.85}
                          className="bg-black py-5 items-center"
                          onPress={() =>
                            router.push({
                              pathname: '/video-call',
                              params: { bookingId: String(booking.id) },
                            } as any)
                          }
                          disabled={booking.status === 'rejected'}
                          style={{ opacity: booking.status === 'rejected' ? 0.4 : 1 }}
                        >
                          <Text className="text-[12px] tracking-[0.3px] text-white" style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}>
                            {primaryButtonLabel}
                          </Text>
                        </TouchableOpacity>
                        {/* <TouchableOpacity
                          activeOpacity={0.85}
                          className="border-t border-[#EFEFEF] py-4 items-center"
                          onPress={() =>
                            router.push({
                              pathname: '/booking-details',
                              params: { bookingId: String(booking.id) },
                            } as any)
                          }
                        >
                          <Text className="text-[11px] text-black/70 uppercase tracking-[1px]">View booking</Text>
                        </TouchableOpacity> */}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View className="h-8" />

                <Text className="text-[12px] uppercase tracking-[0.5px] text-black/80 mb-4">
                  {`Customer store visit booked | ${managedInStoreBookings.length} |`}
                </Text>
                <View className="gap-4">
                  {managedInStoreBookings.filter(matchesSearch).map((booking) => {
                    const isSelected = booking.id === selectedBookingId;
                    const primaryButtonLabel = 'IN STORE VISIT';
                    const customerImageUrl = booking.customer?.profile_image_url ?? null;

                    return (
                      <TouchableOpacity
                        key={booking.id}
                        activeOpacity={0.9}
                        onPress={() => setSelectedBookingId(booking.id)}
                        className={`border bg-white ${isSelected ? 'border-[#1A1A1A]' : 'border-[#CFCFCF]'}`}
                        style={{ height: 310 }}
                      >
                        <View className="px-5 pt-5 pb-4" style={{ flex: 1 }}>
                          <View className="flex-row items-end">
                            <View className="bg-[#F2F2F2] mr-4 overflow-hidden" style={{ width: 50, height: 50, borderRadius: 2 }}>
                              <Image
                                source={
                                  customerImageUrl
                                    ? { uri: customerImageUrl }
                                    : require('../../assets/images/avatar.png')
                                }
                                style={{ width: '100%', height: '100%' }}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                onError={(e) =>
                                  console.log('Booking customer image failed', {
                                    url: customerImageUrl,
                                    error: e?.error,
                                  })
                                }
                              />
                            </View>
                            <View className="flex-1" style={{ paddingBottom: 2 }}>
                              <Text className="text-[16px] text-black" style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}>
                                {customerName(booking)}
                              </Text>
                            </View>
                          </View>

                          <View className="mt-6">
                            <Text className="text-[14px] text-black/60 mb-5">Date & Time:</Text>
                            <View className="flex-row items-center">
                              <SvgXml xml={CALENDAR_BOOKING_SVG} width={20} height={20} />
                              <Text className="ml-4 text-[12px] text-black/85">{booking.scheduled_for}</Text>
                            </View>
                          </View>

                          <View className="mt-6">
                            <Text className="text-[14px] text-black/60 mb-5">Languages</Text>
                            <View className="flex-row items-center">
                              <SvgXml xml={LANGUAGES_SVG} width={20} height={20} />
                              <Text className="ml-4 text-[12px] text-black/85">{booking.language}</Text>
                            </View>
                          </View>

                        </View>

                        <TouchableOpacity
                          activeOpacity={0.85}
                          className="bg-black py-5 items-center"
                          onPress={() => setSelectedBookingId(booking.id)}
                          disabled={booking.status === 'rejected'}
                          style={{ opacity: booking.status === 'rejected' ? 0.4 : 1 }}
                        >
                          <Text className="text-[12px] tracking-[0.3px] text-white" style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}>
                            {primaryButtonLabel}
                          </Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {selectedBooking ? (
                <View className="mt-8">
                  <Text className="text-[12px] uppercase tracking-[0.5px] text-black/80 mb-5">
                    Booking Details
                  </Text>
                  <View className="border border-[#2B2B2B] px-5 py-5 bg-white">
                    <View className="flex-row items-center mb-5">
                      <View className="w-10 h-10 bg-[#F2F2F2] mr-3 overflow-hidden" style={{ borderRadius: 2 }}>
                        <Image
                          source={
                            selectedBooking.customer?.profile_image_url
                              ? { uri: selectedBooking.customer.profile_image_url }
                              : require('../../assets/images/avatar.png')
                          }
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          onError={(e) =>
                            console.log('Selected booking customer image failed', {
                              url: selectedBooking.customer?.profile_image_url,
                              error: e?.error,
                            })
                          }
                        />
                      </View>
                      <View className="flex-1">
                        <Text
                          className="text-[16px] text-black"
                          style={{ fontFamily: 'Helvetica Neue', fontWeight: '500', lineHeight: 16 }}
                        >
                          {selectedBooking.appointment_type === 'video' ? 'Video Call Appointment' : 'In-Store Appointment'}
                        </Text>
                        <Text className="text-[11px] text-black/45 mt-1">
                          {customerName(selectedBooking)} • {statusLabel(selectedBooking.status)}
                        </Text>
                      </View>
                    </View>

                    <DetailRow label="Date & Time" icon="calendar-outline" text={selectedBooking.scheduled_for} />
                    <DetailRow label="Languages" icon="globe-outline" text={selectedBooking.language} />
                    {bookingLocationText(selectedBooking) ? (
                      <DetailRow
                        label="Location"
                        icon="location-outline"
                        text={bookingLocationText(selectedBooking) || 'Boutique location pending'}
                      />
                    ) : null}

                    <View className="mt-6 pt-4 border-t border-[#EFEFEF]">
                      <Text className="text-[14px] text-black/60 mb-5">
                        Buyer Contact
                      </Text>
                      <Text className="text-[12px] text-black/60 leading-5">
                        {selectedBooking.customer?.email || 'No email available'}
                      </Text>
                    </View>

                    <View className="mt-6 pt-4 border-t border-[#EFEFEF]">
                      <Text className="text-[14px] text-black/60 mb-5">
                        Dresses
                      </Text>
                      <Text className="text-[12px] text-black/60 leading-5">{dressSummary(selectedBooking)}</Text>
                    </View>

                    <View className="mt-6 pt-4 border-t border-[#EFEFEF]">
                      <Text className="text-[14px] text-black/60 mb-5">
                        Notes
                      </Text>
                      <Text className="text-[12px] text-black/60 leading-5">
                        {selectedBooking.notes || 'No internal notes have been added yet.'}
                      </Text>
                    </View>

                    <View className="mt-4 flex-row">
                      <TouchableOpacity
                        activeOpacity={0.85}
                        disabled={
                          updatingBookingId === selectedBooking.id ||
                          isBookingLocked(selectedBooking) ||
                          selectedBooking.status === 'accepted'
                        }
                        onPress={() => updateBooking(selectedBooking.id, { status: 'accepted' })}
                        className="flex-1 border border-[#1A1A1A] py-4 items-center justify-center mr-1"
                        style={{
                          opacity:
                            updatingBookingId === selectedBooking.id ||
                            isBookingLocked(selectedBooking) ||
                            selectedBooking.status === 'accepted'
                              ? 0.4
                              : 1,
                        }}
                      >
                        <Text className="text-[10px] text-black/80">Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        disabled={
                          updatingBookingId === selectedBooking.id ||
                          isBookingLocked(selectedBooking) ||
                          selectedBooking.status === 'rejected'
                        }
                        onPress={() => updateBooking(selectedBooking.id, { status: 'rejected' })}
                        className="flex-1 bg-[#C9491A] py-4 items-center justify-center ml-1"
                        style={{
                          opacity:
                            updatingBookingId === selectedBooking.id ||
                            isBookingLocked(selectedBooking) ||
                            selectedBooking.status === 'rejected'
                              ? 0.4
                              : 1,
                        }}
                      >
                        <Text className="text-[10px] text-white">Reject</Text>
                      </TouchableOpacity>
                    </View>

                    <View className="mt-3 flex-row items-center">
                      <TextInput
                        value={rescheduleSlots[selectedBooking.id] ?? selectedBooking.scheduled_for}
                        editable={!isBookingLocked(selectedBooking)}
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
                        disabled={updatingBookingId === selectedBooking.id || isBookingLocked(selectedBooking)}
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
