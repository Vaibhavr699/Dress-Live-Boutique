import React from 'react';
import { View, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

type StoreHoursState = 'empty' | 'configured';

const DEFAULT_BUSINESS_HOURS = [
  { day: 'Monday', value: 'Open 09:00 AM To 05:00 PM' },
  { day: 'Tuesday', value: 'Open 09:00 AM To 05:00 PM' },
  { day: 'Wednesday', value: 'Open 09:00 AM To 05:00 PM' },
  { day: 'Thursday', value: 'Open 09:00 AM To 05:00 PM' },
  { day: 'Friday', value: 'Open 09:00 AM To 05:00 PM' },
  { day: 'Saturday', value: 'Open 09:00 AM To 05:00 PM' },
  { day: 'Sunday', value: 'Closed' },
];

export default function StoreOpeningHoursScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ state?: StoreHoursState; schedule?: string }>();
  const state = (params.state as StoreHoursState) || 'configured';
  const schedule = params.schedule
    ? (JSON.parse(params.schedule) as { day: string; value: string }[])
    : DEFAULT_BUSINESS_HOURS;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-5" style={{ paddingTop: insets.top + 8 }}>
        <TouchableOpacity onPress={() => router.back()} className="mb-8">
          <Ionicons name="arrow-back" size={18} color="black" />
        </TouchableOpacity>

        <Text
          className="text-[24px] text-black mb-1"
          style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
        >
          Set Store Opening Hours
        </Text>
        <Text className="text-[10px] text-black/45 leading-4 mb-6">
          {state === 'configured'
            ? 'Each shop can invite their consultant and availabilities'
            : 'Each shop can invite their consultant and availabilities'}
        </Text>

        <View className="border-t border-[#ECECEC] pt-6">
          <Text
            className="text-[12px] text-black mb-1"
            style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
          >
            Set Business Hours Availability
          </Text>
          <Text className="text-[10px] text-black/45 leading-4 mb-4">
            Let customers know when you are available
          </Text>

          {state === 'configured' ? (
            <>
              <View className="flex-row justify-between items-center mb-4">
                <View>
                  <Text
                    className="text-[12px] text-black mb-1"
                    style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
                  >
                    Business Hours
                  </Text>
                  <Text className="text-[10px] text-black/45">Always Open</Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push({
                      pathname: '/store-opening-hours-editor',
                      params: { schedule: JSON.stringify(schedule) },
                    })
                  }
                  className="border border-black px-6 py-4"
                >
                  <Text className="text-[11px] uppercase tracking-[1px] text-black">
                    Edit Availability
                  </Text>
                </TouchableOpacity>
              </View>

              <View className="border-t border-[#ECECEC] pt-5">
                {schedule.map((item) => (
                  <View key={item.day} className="flex-row justify-between items-center mb-2">
                    <Text className="text-[11px] text-black">{item.day}</Text>
                    <Text className="text-[11px] text-black/45">{item.value}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/store-opening-hours-editor')}
              className="border border-black py-4 items-center justify-center"
            >
              <Text className="text-[11px] uppercase tracking-[1px] text-black">
                Add Hours Availability
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View className="mt-auto flex-row pb-10 pt-8">
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.back()}
            className="flex-1 border border-black py-4 items-center justify-center mr-1"
          >
            <Text className="text-[11px] uppercase tracking-[1px] text-black">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.back()}
            className="flex-1 bg-black py-4 items-center justify-center ml-1"
          >
            <Text className="text-[11px] uppercase tracking-[1px] text-white">Save Changes</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
