import React, { useMemo, useState } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

type RequestBooking = {
  id: string;
  bride: string;
  dress: string;
  date: string;
  language: string;
  location: string;
};

type ActiveBooking = RequestBooking & {
  type: string;
  notes: string;
};

const NEW_REQUESTS: RequestBooking[] = [
  {
    id: '1',
    bride: 'Elife T',
    dress: 'Data & Time:',
    date: 'Tuesday, 14 May - 10:00 AM',
    language: 'English, French',
    location: '',
  },
  {
    id: '2',
    bride: 'Emy T',
    dress: 'Data & Time:',
    date: 'Tuesday, 14 May - 10:30 AM',
    language: 'English, French',
    location: '',
  },
];

const IN_PROGRESS_BOOKINGS: ActiveBooking[] = [
  {
    id: '3',
    bride: 'Elife T',
    dress: 'Veil Lace Dress & Accessories',
    date: 'Tuesday, 14 May - 10:30 AM',
    language: 'English, French',
    location: 'Lyon, France',
    type: 'Custom Fitting Booking',
    notes: 'Bride wants light lace veil & custom accessories. Session focused on final fit review and styling notes.',
  },
  {
    id: '4',
    bride: 'Soly',
    dress: 'Lace Trim Fit',
    date: 'Tuesday, 17 May - 02:30 PM',
    language: 'English, French',
    location: 'Lyon, France',
    type: 'Custom Fitting Booking',
    notes: 'Customer requested a quick fitting review before confirming alterations and production timeline.',
  },
];

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
  const [selectedBookingId, setSelectedBookingId] = useState(IN_PROGRESS_BOOKINGS[0]?.id ?? null);

  const selectedBooking = useMemo(
    () => IN_PROGRESS_BOOKINGS.find((booking) => booking.id === selectedBookingId) ?? null,
    [selectedBookingId]
  );

  const activeList = activeTab === 'new' ? NEW_REQUESTS : IN_PROGRESS_BOOKINGS;

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
                In Progress Booking
              </Text>
              {activeTab === 'progress' ? <View className="mt-3 h-[1px] w-28 bg-black" /> : <View className="mt-3 h-[1px] w-28 bg-transparent" />}
            </TouchableOpacity>
          </View>
        </View>

        <View className="px-6">
          <Text className="text-[12px] uppercase tracking-[0.5px] text-black/80 mb-5">
            {activeTab === 'new' ? `Video Call Booked | ${NEW_REQUESTS.length} |` : `Video Call Booked | ${IN_PROGRESS_BOOKINGS.length} |`}
          </Text>

          {activeList.length === 0 ? (
            <View className="items-center justify-center py-24">
              <View className="w-14 h-14 rounded-full border border-[#EAEAEA] items-center justify-center mb-4">
                <Ionicons name="calendar-outline" size={22} color="#1A1A1A" />
              </View>
              <Text className="text-[11px] font-bold uppercase tracking-[1.3px] text-black/55 mb-2">
                No Calendar Booking Yet
              </Text>
              <Text className="text-[10px] text-black/35 text-center leading-5 px-8">
                Once customers book a fitting, their requests and active appointments will appear here.
              </Text>
            </View>
          ) : activeTab === 'new' ? (
            <View className="gap-4">
              {NEW_REQUESTS.map((booking) => (
                <View key={booking.id} className="border border-[#2B2B2B] bg-white px-5 py-5">
                  <View className="flex-row items-center mb-6">
                    <Image
                      source={require('../../assets/images/avatar.png')}
                      style={{ width: 46, height: 46 }}
                      contentFit="cover"
                    />
                    <View className="ml-3 flex-1">
                      <Text className="text-[16px] text-black">{booking.bride}</Text>
                    </View>
                  </View>

                  <DetailRow label="Data & Time:" icon="calendar-outline" text={booking.date} />
                  <DetailRow label="Languages" icon="globe-outline" text={booking.language} />

                  <View className="flex-row mt-2">
                    <TouchableOpacity
                      activeOpacity={0.85}
                      className="flex-1 border border-[#1A1A1A] py-4 items-center justify-center mr-1"
                    >
                      <Text className="text-[10px] text-black/80">
                        Accept Call Request
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      className="flex-1 bg-[#C9491A] py-4 items-center justify-center ml-1"
                    >
                      <Text className="text-[10px] text-white">
                        Reject Call Request
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <>
              <View className="gap-4">
                {IN_PROGRESS_BOOKINGS.map((booking) => {
                  const isSelected = booking.id === selectedBookingId;

                  return (
                    <TouchableOpacity
                      key={booking.id}
                      activeOpacity={0.9}
                      onPress={() => setSelectedBookingId(booking.id)}
                      className={`border bg-white px-5 py-5 ${isSelected ? 'border-[#1A1A1A]' : 'border-[#CFCFCF]'}`}
                    >
                      <View className="flex-row items-center mb-5">
                        <Image
                          source={require('../../assets/images/avatar.png')}
                          style={{ width: 46, height: 46 }}
                          contentFit="cover"
                        />
                        <View className="ml-3 flex-1">
                          <Text className="text-[16px] text-black">{booking.bride}</Text>
                        </View>
                      </View>

                      <DetailRow label="Data & Time:" icon="calendar-outline" text={booking.date} />
                      <DetailRow label="Languages" icon="globe-outline" text={booking.language} />
                      <DetailRow label="Location" icon="location-outline" text={booking.location} />

                      <TouchableOpacity
                        activeOpacity={0.85}
                        className="mt-2 bg-black py-4 items-center"
                        onPress={() => router.push('/video-call')}
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
                    Custom Fitting Booking
                  </Text>
                  <View className="border border-[#2B2B2B] px-5 py-5 bg-white">
                    <Text className="text-[15px] text-black mb-1">{selectedBooking.dress}</Text>
                    <Text className="text-[11px] text-black/45 mb-5">{selectedBooking.type}</Text>

                    <DetailRow label="Data & Time:" icon="calendar-outline" text={selectedBooking.date} />
                    <DetailRow label="Languages" icon="globe-outline" text={selectedBooking.language} />
                    <DetailRow label="Location" icon="location-outline" text={selectedBooking.location} />

                    <View className="mt-2 pt-4 border-t border-[#EFEFEF]">
                      <Text className="text-[11px] text-black/70 mb-2">
                        Notes
                      </Text>
                      <Text className="text-[11px] text-black/60 leading-5">{selectedBooking.notes}</Text>
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
