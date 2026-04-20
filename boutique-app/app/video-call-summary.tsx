import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PartnerVideoCallSummaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ bookingId?: string; notes?: string }>();

  return (
    <View className="flex-1 bg-white">
      <View className="px-6 flex-row items-center border-b border-[#F0F0F0] pb-4" style={{ paddingTop: insets.top + 10 }}>
        <TouchableOpacity onPress={() => router.back()} className="py-2 pr-4" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={22} color="black" />
        </TouchableOpacity>
        <Text className="text-black text-sm font-bold uppercase tracking-[2px]">Call Summary</Text>
      </View>

      <View className="px-8 pt-14">
        <Text className="text-black text-[16px] font-medium mb-3">Session completed</Text>
        <Text className="text-black/50 text-[12px] leading-5 mb-8">
          Booking #{typeof params.bookingId === 'string' ? params.bookingId : '—'} marked as completed.
        </Text>

        {typeof params.notes === 'string' && params.notes.trim().length ? (
          <View className="border border-[#F0F0F0] p-5 mb-10">
            <Text className="text-black/30 text-[10px] font-bold uppercase tracking-[1px] mb-3">Internal notes</Text>
            <Text className="text-black text-[12px] leading-5">{params.notes}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.replace('/(tabs)/bookings')}
          className="w-full bg-black py-4 items-center justify-center mb-4"
        >
          <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">Back to bookings</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.replace('/(tabs)')}
          className="w-full border border-black py-4 items-center justify-center"
        >
          <Text className="text-black text-[12px] font-bold tracking-[2px] uppercase">Go to dashboard</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

