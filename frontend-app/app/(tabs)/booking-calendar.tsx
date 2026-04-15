import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions, Modal, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@shared/api/api';
import { useCartStore } from '@/store/useCartStore';
import { useAuthStore } from '@shared/store/useAuthStore';
import { useShortlistStore } from '@/store/useShortlistStore';

const { width } = Dimensions.get('window');

type ShortlistItem = {
  dress_id: number;
};

type Dress = {
  id: number;
  name: string;
};

type CartItem = {
  id: string;
  name: string;
  selected: boolean;
};

export default function BookingCalendarScreen() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const guestDressIds = useShortlistStore((state) => state.dressIds);
  const params = useLocalSearchParams<{
    dressId?: string;
    bookingId?: string;
    appointmentType?: string;
    scheduledFor?: string;
    language?: string;
    source?: string;
  }>();
  const insets = useSafeAreaInsets();
  const cartItems = useCartStore((state) => state.items);
  const selectedCartItems = useMemo(
    () => cartItems.filter((item) => item.selected),
    [cartItems]
  );
  const normalizedLanguage =
    typeof params.language === 'string' && params.language.length > 0 ? params.language : 'English';
  const normalizedScheduledFor =
    typeof params.scheduledFor === 'string' ? params.scheduledFor : undefined;
  const normalizedDressId = typeof params.dressId === 'string' ? Number(params.dressId) : null;
  const normalizedBookingId = typeof params.bookingId === 'string' ? Number(params.bookingId) : null;
  const normalizedAppointmentType = params.appointmentType === 'in_store' ? 'in_store' : 'video';
  const selectionSource = params.source === 'cart' ? 'cart' : 'wishlist';
  const [selectedDate, setSelectedDate] = useState(13);
  const [selectedLanguage, setSelectedLanguage] = useState(normalizedLanguage);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [selectedDressIds, setSelectedDressIds] = useState<number[]>([]);
  const [selectedDressNames, setSelectedDressNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dates = [
    31, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 1, 2, 3, 4
  ];
  const appointmentType = normalizedAppointmentType;
  const bookingId = normalizedBookingId;

  useEffect(() => {
    const incomingDate = normalizedScheduledFor?.match(/(\d{1,2})/);
    if (incomingDate?.[1]) {
      setSelectedDate(Number(incomingDate[1]));
    }
  }, [normalizedScheduledFor]);

  useEffect(() => {
    const loadSelectedDresses = async () => {
      try {
        if (selectionSource === 'cart') {
          const cartDressItems = (selectedCartItems as CartItem[])
            .map((item) => ({
              id: Number(item.id),
              name: item.name,
            }))
            .filter((item) => !Number.isNaN(item.id))
            .slice(0, 4);

          setSelectedDressIds(cartDressItems.map((item) => item.id));
          setSelectedDressNames(cartDressItems.map((item) => item.name));
          return;
        }

        const shortlistDressIds = isAuthenticated
          ? (() => {
              return api.get('/shortlists/me').then((shortlistResponse) => {
                const shortlistItems = Array.isArray(shortlistResponse)
                  ? (shortlistResponse as ShortlistItem[])
                  : [];
                return shortlistItems.map((item) => item.dress_id);
              });
            })()
          : Promise.resolve(guestDressIds);
        const directDressId = normalizedDressId;

        const resolvedIds = await shortlistDressIds;
        const mergedDressIds = Array.from(
          new Set([
            ...resolvedIds,
            ...(directDressId && !Number.isNaN(directDressId) ? [directDressId] : []),
          ])
        ).slice(0, 4);

        setSelectedDressIds(mergedDressIds);

        if (mergedDressIds.length > 0) {
          const dresses = await Promise.all(
            mergedDressIds.map(async (dressId) => {
              try {
                return await api.get(`/dresses/${dressId}`);
              } catch (error) {
                console.error(`Failed to load dress ${dressId}:`, error);
                return null;
              }
            })
          );

          setSelectedDressNames(
            dresses
              .filter(Boolean)
              .map((dress) => (dress as Dress).name)
          );
        } else {
          setSelectedDressNames([]);
        }
      } catch (error) {
        Alert.alert(
          'Booking',
          error instanceof Error
            ? error.message
            : selectionSource === 'cart'
              ? 'Could not load selected cart dresses.'
              : 'Could not load shortlist.'
        );
      } finally {
        setLoading(false);
      }
    };

    loadSelectedDresses();
  }, [guestDressIds, isAuthenticated, normalizedDressId, selectedCartItems, selectionSource]);

  const scheduleLabel = useMemo(() => `Tuesday, ${selectedDate.toString().padStart(2, '0')} May - 10:00 AM`, [selectedDate]);

  const handleSubmit = async () => {
    if (!isAuthenticated) {
      Alert.alert('Login Required', 'Please create an account or log in to book an appointment.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => router.replace('/auth-choice') },
      ]);
      return;
    }

    if (selectedDressIds.length === 0) {
      Alert.alert(
        'Booking',
        selectionSource === 'cart'
          ? 'Select at least one dress in your cart before creating a booking.'
          : 'Add at least one dress to your wishlist before creating a booking.'
      );
      return;
    }

    setSubmitting(true);

    try {
      if (bookingId) {
        await api.put(`/bookings/${bookingId}`, {
          status: 'rescheduled',
          scheduled_for: scheduleLabel,
          language: selectedLanguage,
          location: appointmentType === 'in_store' ? 'Boutique location to be confirmed' : null,
        });
        Alert.alert('Booking', 'Your booking request was updated.', [
          { text: 'OK', onPress: () => router.replace('/(tabs)/booking') },
        ]);
      } else {
        await api.post('/bookings/', {
          appointment_type: appointmentType,
          scheduled_for: scheduleLabel,
          language: selectedLanguage,
          dress_ids: selectedDressIds,
          location: appointmentType === 'in_store' ? 'Boutique location to be confirmed' : null,
          appointment_fee: 49.9,
          is_paid: false,
        });
        Alert.alert('Booking', 'Your booking request was submitted.', [
          { text: 'OK', onPress: () => router.replace('/(tabs)/booking') },
        ]);
      }
    } catch (error) {
      Alert.alert('Booking', error instanceof Error ? error.message : 'Could not save your booking.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View 
        className="px-6 flex-row items-center mb-6"
        style={{ paddingTop: insets.top + 10 }}
      >
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#1A1A1A" />
        </View>
      ) : (
      <ScrollView showsVerticalScrollIndicator={false} className="px-8">
        <Text className="text-black text-lg font-medium mb-4">
          {appointmentType === 'video' ? 'Booking Calendar Video Call' : 'Booking Calendar Visit Store'}
        </Text>
        <Text className="text-black/50 text-[12px] leading-5 mb-8">
          {appointmentType === 'video'
            ? 'During the video call, you can try on up to 4 selected dresses live using AI. Please ensure you are in a well-lit space and wearing fitted clothing.'
            : 'Select your preferred store visit date and we will send the request to the boutique for confirmation.'}
        </Text>

        <View className="border border-[#F0F0F0] p-4 mb-8">
          <Text className="text-black/30 text-[10px] font-bold uppercase mb-3 tracking-[0.5px]">
            Selected Dresses {selectedDressIds.length}/4
          </Text>
          {selectedDressNames.length === 0 ? (
            <Text className="text-black/50 text-[12px] leading-5">
              {selectionSource === 'cart'
                ? 'No cart dresses selected yet. Choose at least one dress in your cart first.'
                : 'No dresses selected yet. Add dresses to your wishlist first.'}
            </Text>
          ) : (
            selectedDressNames.map((dressName) => (
              <Text key={dressName} className="text-black text-[12px] mb-2">
                {dressName}
              </Text>
            ))
          )}
        </View>

        <Text className="text-black/30 text-[10px] font-bold uppercase mb-6 tracking-[0.5px]">
          Current Month Calendar Select a Date
        </Text>

        {/* Calendar Grid */}
        <View className="flex-row flex-wrap mb-10">
          {days.map((day) => (
            <View key={day} style={{ width: (width - 64) / 7 }} className="items-center mb-4">
              <Text className="text-black/30 text-[10px] font-medium">{day}</Text>
            </View>
          ))}
          {dates.map((date, idx) => {
            const isSelected = date === selectedDate && idx > 0 && idx < 32;
            const isOtherMonth = idx === 0 || idx > 31;
            
            return (
              <TouchableOpacity 
                key={idx} 
                onPress={() => !isOtherMonth && setSelectedDate(date)}
                style={{ 
                  width: (width - 64) / 7, 
                  height: 40,
                  backgroundColor: isSelected ? 'black' : 'transparent',
                }} 
                className="items-center justify-center"
              >
                <Text 
                  style={{ 
                    color: isSelected ? 'white' : isOtherMonth ? '#E0E0E0' : 'black',
                    fontSize: 10,
                    fontWeight: isSelected ? 'bold' : '400'
                  }}
                >
                  {date.toString().padStart(2, '0')}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Language Selection */}
        <Text className="text-black/30 text-[10px] font-bold uppercase mb-4 tracking-[0.5px]">
          LANGUAGES *
        </Text>
        <TouchableOpacity 
          onPress={() => setDropdownVisible(true)}
          className="border border-[#F0F0F0] p-4 flex-row justify-between items-center mb-10"
        >
          <Text className="text-black text-xs uppercase tracking-[0.5px]">{selectedLanguage}</Text>
          <Ionicons name="chevron-down" size={16} color="black" />
        </TouchableOpacity>

        <TouchableOpacity 
          activeOpacity={0.9}
          onPress={handleSubmit}
          disabled={submitting}
          className="w-full bg-black py-4 items-center justify-center mb-10"
        >
          <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">
            {submitting ? 'Submitting...' : bookingId ? 'Update Request' : 'Submit Request'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
      )}

      {/* Language Dropdown Modal */}
      <Modal
        visible={dropdownVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDropdownVisible(false)}
      >
        <Pressable 
          className="flex-1 bg-black/40 items-center justify-center px-8"
          onPress={() => setDropdownVisible(false)}
        >
          <View className="bg-white w-full rounded-sm overflow-hidden p-6">
            <Text className="text-black/30 text-[10px] font-bold uppercase mb-6 tracking-[1px] text-center">Language Dropdown</Text>
            {['English', 'German', 'French'].map((lang) => {
              const isSelected = selectedLanguage === lang;
              return (
                <TouchableOpacity 
                  key={lang}
                  onPress={() => {
                    setSelectedLanguage(lang);
                    setDropdownVisible(false);
                  }}
                  className={`flex-row items-center px-6 py-4 mb-2 ${isSelected ? 'bg-black' : 'bg-white border border-[#F0F0F0]/50'}`}
                >
                  {isSelected && <Ionicons name="checkmark" size={18} color="white" className="mr-4" />}
                  <Text 
                    className={`text-sm font-medium ${isSelected ? 'text-white ml-2' : 'text-black'}`}
                    style={{ fontFamily: 'Helvetica Neue' }}
                  >
                    {lang}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

