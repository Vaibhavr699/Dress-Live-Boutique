import React from 'react';
import { View, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

type AvailabilityState = 'empty' | 'business' | 'complete';

const BUSINESS_HOURS = [
  { day: 'Monday', value: 'Open 09:00 AM To 05:00 PM' },
  { day: 'Tuesday', value: 'Open 09:00 AM To 05:00 PM' },
  { day: 'Wednesday', value: 'Open 09:00 AM To 05:00 PM' },
  { day: 'Thursday', value: 'Open 09:00 AM To 05:00 PM' },
  { day: 'Friday', value: 'Open 09:00 AM To 05:00 PM' },
  { day: 'Saturday', value: 'Open 09:00 AM To 05:00 PM' },
  { day: 'Sunday', value: 'Closed' },
];

const CONSULTANT_HOURS = [
  { day: 'Monday', value: 'Available: 11:00AM To 01:00PM' },
  { day: 'Tuesday', value: 'Available: 11:00AM To 01:00PM' },
  { day: 'Wednesday', value: 'Available: 11:00AM To 01:00PM' },
  { day: 'Thursday', value: 'Available: 11:00AM To 01:00PM' },
  { day: 'Friday', value: 'Available: 11:00AM To 01:00PM' },
  { day: 'Saturday', value: 'Closed' },
  { day: 'Sunday', value: 'Closed' },
];

function HoursList({
  items,
}: {
  items: { day: string; value: string }[];
}) {
  return (
    <View className="mt-4">
      {items.map((item) => (
        <View key={item.day} className="flex-row justify-between items-center mb-2">
          <Text className="text-[11px] text-black">{item.day}</Text>
          <Text className="text-[11px] text-black/45">{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

export default function VideoCallAvailabilityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    state?: AvailabilityState;
    businessSchedule?: string;
    consultantSchedule?: string;
  }>();
  const state = (params.state as AvailabilityState) || 'empty';
  const businessSchedule = params.businessSchedule
    ? (JSON.parse(params.businessSchedule) as { day: string; value: string }[])
    : BUSINESS_HOURS;
  const consultantSchedule = params.consultantSchedule
    ? (JSON.parse(params.consultantSchedule) as { day: string; value: string }[])
    : CONSULTANT_HOURS;

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
          Set Video Call Availability
        </Text>
        <Text className="text-[10px] text-black/45 leading-4 mb-6">
          {state === 'empty'
            ? 'Each shop can invite their consultant and availabilities'
            : 'Each shop can invite their consultant and availabilities'}
        </Text>

        <View className="border-t border-[#EDEDED] pt-6 mb-6">
          <Text
            className="text-[12px] text-black mb-1"
            style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
          >
            Set Business Hours Availability
          </Text>
          <Text className="text-[10px] text-black/45 leading-4 mb-4">
            Let customers know when you are available
          </Text>

          {state === 'complete' ? (
            <>
              <HoursList items={consultantSchedule} />
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() =>
                  router.push({
                    pathname: '/video-call-availability-editor',
                    params: {
                      mode: 'consultant',
                      returnState: 'complete',
                      businessSchedule: JSON.stringify(businessSchedule),
                      consultantSchedule: JSON.stringify(consultantSchedule),
                    },
                  })
                }
                className="border border-black py-4 items-center justify-center mt-4"
              >
                <Text className="text-[11px] uppercase tracking-[1px] text-black">
                  Edit Video Call Availability
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() =>
                router.push({
                  pathname: '/video-call-availability-editor',
                  params: {
                    mode: 'consultant',
                    returnState: state,
                    businessSchedule: JSON.stringify(businessSchedule),
                    consultantSchedule: JSON.stringify(consultantSchedule),
                  },
                })
              }
              className="border border-black py-4 items-center justify-center"
            >
              <Text className="text-[11px] uppercase tracking-[1px] text-black">
                Set Video Call Availability
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View className="border-t border-[#EDEDED] pt-6">
          <Text
            className="text-[12px] text-black mb-1"
            style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
          >
            {state === 'empty' ? 'Set Business Hours Availability' : 'Already Business Hours Set'}
          </Text>
          <Text className="text-[10px] text-black/45 leading-4 mb-4">
            {state === 'empty' ? 'Let customers know when you are available' : 'Always Open'}
          </Text>

          {state === 'empty' ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() =>
                router.push({
                  pathname: '/video-call-availability-editor',
                  params: {
                    mode: 'business',
                    returnState: 'empty',
                    businessSchedule: JSON.stringify(businessSchedule),
                    consultantSchedule: JSON.stringify(consultantSchedule),
                  },
                })
              }
              className="border border-black py-4 items-center justify-center"
            >
              <Text className="text-[11px] uppercase tracking-[1px] text-black">
                Add Hours Availability
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() =>
                  router.push({
                    pathname: '/video-call-availability-editor',
                  params: {
                    mode: 'business',
                    returnState: state,
                    businessSchedule: JSON.stringify(businessSchedule),
                    consultantSchedule: JSON.stringify(consultantSchedule),
                  },
                  })
                }
                className="border border-black py-4 items-center justify-center mb-4"
              >
                <Text className="text-[11px] uppercase tracking-[1px] text-black">
                  Edit Availability
                </Text>
              </TouchableOpacity>
              <HoursList items={businessSchedule} />
            </>
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
            <Text className="text-[11px] uppercase tracking-[1px] text-white">
              {state === 'empty' ? 'Save & Published' : 'Save Changes'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
