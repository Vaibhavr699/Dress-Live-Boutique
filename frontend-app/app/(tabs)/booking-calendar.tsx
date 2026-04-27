import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions, Modal, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@shared/api/api';
import { useCartStore } from '@/store/useCartStore';
import { useAuthStore } from '@shared/store/useAuthStore';
import { useShortlistStore } from '@/store/useShortlistStore';
import { useBookingHistoryStore } from '@/store/useBookingHistoryStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import {
  buildBookingNotificationDetails,
  sendLocalPhoneNotification,
  syncScheduledBookingReminder,
} from '@/lib/buyerNotifications';

const { width } = Dimensions.get('window');

type ShortlistItem = {
  dress_id: number;
};

type Dress = {
  id: number;
  name: string;
  boutique_id?: number | null;
};

type CartItem = {
  id: string;
  name: string;
  selected: boolean;
};

type Boutique = {
  id: number;
  name?: string | null;
  location?: string | null;
  availability_schedule?: string | null;
};

type ScheduleItem = {
  day: string;
  value: string;
};

type CalendarCell = {
  key: string;
  date: Date;
  isCurrentMonth: boolean;
};

const DEFAULT_BUSINESS_HOURS: ScheduleItem[] = [
  { day: 'Monday', value: 'Open 09:00 AM To 05:00 PM' },
  { day: 'Tuesday', value: 'Open 09:00 AM To 05:00 PM' },
  { day: 'Wednesday', value: 'Open 09:00 AM To 05:00 PM' },
  { day: 'Thursday', value: 'Open 09:00 AM To 05:00 PM' },
  { day: 'Friday', value: 'Open 09:00 AM To 05:00 PM' },
  { day: 'Saturday', value: 'Open 09:00 AM To 05:00 PM' },
  { day: 'Sunday', value: 'Closed' },
];

const TIME_OPTIONS = [
  '09:00 AM',
  '10:00 AM',
  '11:00 AM',
  '12:00 PM',
  '01:00 PM',
  '02:00 PM',
  '03:00 PM',
  '04:00 PM',
  '05:00 PM',
];

function parseSchedule(raw: string | null | undefined): ScheduleItem[] {
  if (!raw || !raw.trim()) return DEFAULT_BUSINESS_HOURS;
  try {
    const parsed = JSON.parse(raw) as ScheduleItem[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_BUSINESS_HOURS;
  } catch {
    return DEFAULT_BUSINESS_HOURS;
  }
}

function timeToMinutes(label: string): number {
  const match = label.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return -1;
  let hour = Number(match[1]) % 12;
  const minutes = Number(match[2]);
  const suffix = match[3].toUpperCase();
  if (suffix === 'PM') hour += 12;
  return hour * 60 + minutes;
}

function buildTimeSlots(value: string | undefined): string[] {
  if (!value || value === 'Closed') return [];
  const normalized = value.replace('Open ', '').replace('Available: ', '');
  const [open, close] = normalized.split(' To ');
  const openMinutes = timeToMinutes(open || '');
  const closeMinutes = timeToMinutes(close || '');
  if (openMinutes < 0 || closeMinutes < 0 || closeMinutes <= openMinutes) return [];
  return TIME_OPTIONS.filter((time) => {
    const mins = timeToMinutes(time);
    return mins >= openMinutes && mins < closeMinutes;
  });
}

function buildCalendarDays(baseDate: Date): CalendarCell[] {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const cells: CalendarCell[] = [];

  for (let i = firstWeekday - 1; i >= 0; i -= 1) {
    cells.push({
      key: `prev-${i}`,
      date: new Date(year, month - 1, prevMonthDays - i),
      isCurrentMonth: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      key: `current-${day}`,
      date: new Date(year, month, day),
      isCurrentMonth: true,
    });
  }

  const extra = (7 - (cells.length % 7)) % 7;
  for (let day = 1; day <= extra; day += 1) {
    cells.push({
      key: `next-${day}`,
      date: new Date(year, month + 1, day),
      isCurrentMonth: false,
    });
  }

  return cells;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatScheduleLabel(date: Date, time: string): string {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  return `${weekday}, ${String(date.getDate()).padStart(2, '0')} ${month} - ${time}`;
}

function extractTimeFromScheduledFor(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.match(/-\s*(\d{1,2}:\d{2}\s*[AP]M)$/i);
  return match?.[1]?.toUpperCase() || null;
}

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
  const [monthBase] = useState(() => {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState(normalizedLanguage);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [selectedDressIds, setSelectedDressIds] = useState<number[]>([]);
  const [selectedDressNames, setSelectedDressNames] = useState<string[]>([]);
  const [boutique, setBoutique] = useState<Boutique | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const upsertBookingHistory = useBookingHistoryStore((state) => state.upsert);
  const addNotification = useNotificationStore((s) => s.add);

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const appointmentType = normalizedAppointmentType;
  const bookingId = normalizedBookingId;
  const calendarDays = useMemo(() => buildCalendarDays(monthBase), [monthBase]);
  const parsedSchedule = useMemo(
    () => parseSchedule(boutique?.availability_schedule),
    [boutique?.availability_schedule]
  );
  const selectedWeekday = useMemo(
    () => selectedDate.toLocaleDateString('en-US', { weekday: 'long' }),
    [selectedDate]
  );
  const availableSlots = useMemo(() => {
    const daySchedule = parsedSchedule.find((item) => item.day === selectedWeekday);
    return buildTimeSlots(daySchedule?.value);
  }, [parsedSchedule, selectedWeekday]);
  const scheduleLabel = useMemo(
    () => (selectedTime ? formatScheduleLabel(selectedDate, selectedTime) : ''),
    [selectedDate, selectedTime]
  );
  const monthTitle = useMemo(
    () => monthBase.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    [monthBase]
  );

  useEffect(() => {
    const incomingDate = normalizedScheduledFor?.match(/,\s*(\d{1,2})\s+[A-Za-z]{3}/);
    if (incomingDate?.[1]) {
      const next = new Date(monthBase.getFullYear(), monthBase.getMonth(), Number(incomingDate[1]));
      if (!Number.isNaN(next.getTime())) {
        setSelectedDate(next);
      }
    }
    const incomingTime = extractTimeFromScheduledFor(normalizedScheduledFor);
    if (incomingTime) {
      setSelectedTime(incomingTime);
    }
  }, [monthBase, normalizedScheduledFor]);

  useEffect(() => {
    const loadSelectedDresses = async () => {
      try {
        const cartDressIds = (selectedCartItems as CartItem[])
          .map((item) => Number(item.id))
          .filter((item) => !Number.isNaN(item))
          .slice(0, 4);
        const shortlistDressIds =
          selectionSource === 'cart'
            ? Promise.resolve(cartDressIds)
            : isAuthenticated
              ? api.get('/shortlists/me').then((shortlistResponse) => {
                  const shortlistItems = Array.isArray(shortlistResponse)
                    ? (shortlistResponse as ShortlistItem[])
                    : [];
                  return shortlistItems.map((item) => item.dress_id);
                })
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
          const validDresses = dresses.filter(Boolean) as Dress[];

          setSelectedDressNames(
            validDresses.map((dress) => dress.name)
          );

          const boutiqueId = validDresses[0]?.boutique_id;
          if (boutiqueId) {
            try {
              const boutiqueData = await api.get(`/boutiques/${boutiqueId}`);
              setBoutique((boutiqueData as Boutique) || null);
            } catch {
              setBoutique(null);
            }
          } else {
            setBoutique(null);
          }
        } else {
          setSelectedDressNames([]);
          setBoutique(null);
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

  useEffect(() => {
    if (availableSlots.length === 0) {
      setSelectedTime(null);
      return;
    }
    setSelectedTime((current) => (current && availableSlots.includes(current) ? current : availableSlots[0]));
  }, [availableSlots]);

  const handleSubmit = async () => {
    if (!isAuthenticated) {
      Alert.alert('Login Required', 'Please create an account or log in to book an appointment.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Up', onPress: () => router.replace('/signup') },
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

    if (!selectedTime) {
      Alert.alert('Booking', 'Please choose an available time for the selected date.');
      return;
    }

    setSubmitting(true);

    try {
      if (bookingId) {
        const updated = await api.put(`/bookings/${bookingId}`, {
          status: 'rescheduled',
          scheduled_for: scheduleLabel,
          language: selectedLanguage,
          location: appointmentType === 'in_store' ? (boutique?.location || 'Boutique location to be confirmed') : null,
        });
        if (updated && typeof updated === 'object') {
          upsertBookingHistory(updated as any);
          const notification = buildBookingNotificationDetails(updated as any, 'booking_updated');
          addNotification(notification);
          void sendLocalPhoneNotification(notification);
          void syncScheduledBookingReminder(updated as any);
        }
        Alert.alert('Booking', 'Your booking request was updated.', [
          { text: 'OK', onPress: () => router.replace('/(tabs)/booking') },
        ]);
      } else {
        const created = await api.post('/bookings/', {
          appointment_type: appointmentType,
          scheduled_for: scheduleLabel,
          language: selectedLanguage,
          dress_ids: selectedDressIds,
          location: appointmentType === 'in_store' ? (boutique?.location || 'Boutique location to be confirmed') : null,
          appointment_fee: 49.9,
          is_paid: false,
        });
        if (created && typeof created === 'object') {
          upsertBookingHistory(created as any);
          const notification = buildBookingNotificationDetails(created as any, 'booking_requested');
          addNotification(notification);
          void sendLocalPhoneNotification(notification);
          void syncScheduledBookingReminder(created as any);
        }
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
          {monthTitle} - Select a Date
        </Text>

        {/* Calendar Grid */}
        <View className="flex-row flex-wrap mb-10">
          {days.map((day) => (
            <View key={day} style={{ width: (width - 64) / 7 }} className="items-center mb-4">
              <Text className="text-black/30 text-[10px] font-medium">{day}</Text>
            </View>
          ))}
          {calendarDays.map((cell) => {
            const isSelected = cell.isCurrentMonth && isSameDay(cell.date, selectedDate);
            const isOtherMonth = !cell.isCurrentMonth;
            
            return (
              <TouchableOpacity 
                key={cell.key} 
                onPress={() => !isOtherMonth && setSelectedDate(cell.date)}
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
                  {String(cell.date.getDate()).padStart(2, '0')}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <Text className="text-black/30 text-[10px] font-bold uppercase mb-4 tracking-[0.5px]">
          Available Times *
        </Text>
        {availableSlots.length === 0 ? (
          <View className="border border-[#F0F0F0] p-4 mb-10">
            <Text className="text-black/50 text-[12px] leading-5">
              This boutique is not available on {selectedWeekday}. Please choose another date.
            </Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap mb-4">
            {availableSlots.map((slot) => {
              const selected = selectedTime === slot;
              return (
                <TouchableOpacity
                  key={slot}
                  activeOpacity={0.85}
                  onPress={() => setSelectedTime(slot)}
                  className={`px-4 py-3 mr-3 mb-3 border ${selected ? 'bg-black border-black' : 'bg-white border-[#E9E9E9]'}`}
                >
                  <Text className={`text-[11px] uppercase tracking-[0.6px] ${selected ? 'text-white' : 'text-black'}`}>
                    {slot}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {selectedTime ? (
          <Text className="text-black/45 text-[11px] mb-10">
            Selected slot: {scheduleLabel}
          </Text>
        ) : null}

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
          disabled={submitting || !selectedTime}
          className={`w-full py-4 items-center justify-center mb-10 ${submitting || !selectedTime ? 'bg-black/30' : 'bg-black'}`}
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

