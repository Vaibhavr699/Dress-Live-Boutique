import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@shared/api/api';
import { DEFAULT_TEAM_AVAILABILITY, TeamAvailabilityEntry } from '../store/useTeamStore';

// The "available" value we write when a day is toggled on. Matches the shape
// the partner-side availability editor uses so the owner sees the same strings.
const AVAILABLE_LABEL = 'Available: 11:00AM To 01:00PM';
const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type ApiTeamMember = {
  availability_on: boolean;
  availability_schedule: TeamAvailabilityEntry[] | null;
};

// Normalise whatever the server returns into a full 7-day schedule so the
// editor always renders every day even if the stored list is partial/empty.
function toFullSchedule(raw: TeamAvailabilityEntry[] | null | undefined): TeamAvailabilityEntry[] {
  const byDay = new Map((raw ?? []).map((entry) => [entry.day, entry.value]));
  return DAY_ORDER.map((day) => {
    const fallback = DEFAULT_TEAM_AVAILABILITY.find((d) => d.day === day)?.value ?? 'Closed';
    return { day, value: byDay.get(day) ?? fallback };
  });
}

export default function AdvisorAvailabilityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availabilityOn, setAvailabilityOn] = useState(false);
  const [schedule, setSchedule] = useState<TeamAvailabilityEntry[]>(() => toFullSchedule(null));

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = (await api.get('/team/me')) as ApiTeamMember;
      setAvailabilityOn(!!data.availability_on);
      setSchedule(toFullSchedule(data.availability_schedule));
    } catch (e: any) {
      setError(e?.message ?? 'Could not load your availability.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleDay = (day: string) => {
    setSchedule((current) =>
      current.map((entry) =>
        entry.day === day
          ? { ...entry, value: entry.value === 'Closed' ? AVAILABLE_LABEL : 'Closed' }
          : entry
      )
    );
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api.put('/team/me', {
        availability_on: availabilityOn,
        availability_schedule: schedule,
      });
      Alert.alert('Saved', 'Your availability has been updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 2, paddingHorizontal: 10, paddingBottom: 40, flexGrow: 1 }}
      >

        <Text className="text-[24px] text-black mb-1" style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}>
          My Availability
        </Text>
        <Text className="text-[10px] text-black/45 leading-4 mb-8">
          Control when you&apos;re available for customer bookings at this boutique.
        </Text>

        {loading ? (
          <View className="py-20 items-center">
            <ActivityIndicator color="#1A1A1A" />
          </View>
        ) : error ? (
          <View className="py-20 items-center">
            <Text className="text-[12px] text-black/50 mb-4 text-center">{error}</Text>
            <TouchableOpacity onPress={load} className="border border-black px-5 py-3">
              <Text className="text-[11px] uppercase tracking-[1px] text-black">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Master availability switch */}
            <View className="flex-row items-center justify-between border-b border-[#ECECEC] pb-5 mb-6">
              <View className="flex-1 pr-4">
                <Text className="text-[13px] text-black" style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}>
                  Available for bookings
                </Text>
                <Text className="text-[10px] text-black/45 mt-1">
                  {availabilityOn ? 'Customers can book you.' : 'You are hidden from new bookings.'}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setAvailabilityOn((v) => !v)}
                className={`w-12 h-7 rounded-full px-1 justify-center ${availabilityOn ? 'bg-black' : 'bg-[#E9E9E9]'}`}
              >
                <View className={`w-5 h-5 rounded-full bg-white ${availabilityOn ? 'self-end' : 'self-start'}`} />
              </TouchableOpacity>
            </View>

            {/* Weekly schedule */}
            <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-3">Weekly schedule</Text>
            {schedule.map((entry) => {
              const isOpen = entry.value !== 'Closed';
              return (
                <View key={entry.day} className="flex-row items-center justify-between py-3 border-b border-[#F2F2F2]">
                  <View className="flex-1 pr-4">
                    <Text className="text-[12px] text-black">{entry.day}</Text>
                    <Text className="text-[10px] text-black/45 mt-0.5">{isOpen ? entry.value : 'Closed'}</Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => toggleDay(entry.day)}
                    className={`w-11 h-6 rounded-full px-1 justify-center ${isOpen ? 'bg-black' : 'bg-[#E9E9E9]'}`}
                  >
                    <View className={`w-4 h-4 rounded-full bg-white ${isOpen ? 'self-end' : 'self-start'}`} />
                  </TouchableOpacity>
                </View>
              );
            })}

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handleSave}
              disabled={saving}
              className="bg-black py-4 items-center justify-center mt-10"
              style={saving ? { opacity: 0.6 } : undefined}
            >
              <Text className="text-[11px] uppercase tracking-[1px] text-white">
                {saving ? 'Saving…' : 'Save Availability'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
