import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@shared/api/api';
import { useAuthStore } from '@shared/store/useAuthStore';

type StoreHoursState = 'empty' | 'configured';
type ScheduleItem = { day: string; value: string };

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
  const user = useAuthStore((s: any) => s.user);
  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState<ScheduleItem[]>(DEFAULT_BUSINESS_HOURS);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          if (!user?.boutique_id) {
            if (active) setSchedule(DEFAULT_BUSINESS_HOURS);
            return;
          }
          const boutique = await api.get(`/boutiques/${user.boutique_id}`);
          if (!active) return;
          const raw = typeof boutique?.availability_schedule === 'string'
            ? boutique.availability_schedule
            : '';
          if (raw.trim()) {
            try {
              const parsed = JSON.parse(raw) as ScheduleItem[];
              setSchedule(Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_BUSINESS_HOURS);
            } catch {
              setSchedule(DEFAULT_BUSINESS_HOURS);
            }
          } else {
            setSchedule(DEFAULT_BUSINESS_HOURS);
          }
        } catch {
          if (active) setSchedule(DEFAULT_BUSINESS_HOURS);
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [user?.boutique_id])
  );
  const state: StoreHoursState = schedule.length > 0 ? 'configured' : 'empty';

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
        <Text
          style={{
            fontFamily: 'Helvetica Neue',
            fontWeight: '400',
            fontSize: 14,
            lineHeight: 14,
            letterSpacing: 0,
            color: '#6E6E6E',
            marginBottom: 24,
          }}
        >
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

          {loading ? (
            <View className="py-16 items-center">
              <ActivityIndicator color="#1A1A1A" />
              <Text className="text-[11px] text-black/45 mt-3">Loading availability…</Text>
            </View>
          ) : state === 'configured' ? (
            <>
              <View className="flex-row justify-between items-center mb-4">
                <View>
                  <Text
                    className="text-[12px] text-black mb-1"
                    style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
                  >
                    Business Hours
                  </Text>
                  <Text className="text-[10px] text-black/45">Customer booking slots follow these hours</Text>
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
                  <View
                    key={item.day}
                    className="flex-row justify-between items-center"
                    style={{ paddingVertical: 6, marginBottom: 6 }}
                  >
                    <Text
                      style={{
                        fontFamily: 'Helvetica Neue',
                        fontWeight: '400',
                        fontSize: 14,
                        lineHeight: 14,
                        letterSpacing: 0,
                        color: '#000000',
                        paddingBottom:2,
                      }}
                    >
                      {item.day}
                    </Text>
                    <Text
                      style={{
                        fontFamily: 'Helvetica Neue',
                        fontWeight: '400',
                        fontSize: 14,
                        lineHeight: 14,
                        letterSpacing: 0,
                        color: '#6E6E6E',
                        textAlign: 'right',
                      }}
                    >
                      {item.value}
                    </Text>
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
