import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
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

type DaySchedule = {
  enabled: boolean;
  open: string;
  close: string;
};

export default function VideoCallAvailabilityEditorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    mode?: string;
    returnState?: string;
    businessSchedule?: string;
    consultantSchedule?: string;
  }>();
  const incomingSchedule = params.mode === 'business' ? params.businessSchedule : params.consultantSchedule;
  const parsedSchedule = incomingSchedule
    ? (JSON.parse(incomingSchedule) as { day: string; value: string }[])
    : null;
  const [daySchedules, setDaySchedules] = useState<Record<string, DaySchedule>>({
    Monday: { enabled: true, open: '11:00 AM', close: '01:00 PM' },
    Tuesday: { enabled: true, open: '11:00 AM', close: '01:00 PM' },
    Wednesday: { enabled: true, open: '11:00 AM', close: '01:00 PM' },
    Thursday: { enabled: true, open: '11:00 AM', close: '01:00 PM' },
    Friday: { enabled: true, open: '11:00 AM', close: '01:00 PM' },
    Saturday: { enabled: true, open: '11:00 AM', close: '01:00 PM' },
    Sunday: { enabled: false, open: '11:00 AM', close: '01:00 PM' },
    ...Object.fromEntries(
      (parsedSchedule ?? []).map((item) => {
        if (item.value === 'Closed') {
          return [item.day, { enabled: false, open: '11:00 AM', close: '01:00 PM' }];
        }

        const normalized = item.value
          .replace('Open ', '')
          .replace('Available: ', '')
          .split(' To ');

        return [
          item.day,
          {
            enabled: true,
            open: normalized[0] ?? '11:00 AM',
            close: normalized[1] ?? '01:00 PM',
          },
        ];
      })
    ),
  });
  const [activePicker, setActivePicker] = useState<string | null>(null);

  const summaryItems = useMemo(
    () =>
      DAYS.map((day) => {
        const schedule = daySchedules[day];
        return {
          day,
          value: schedule.enabled
            ? `${params.mode === 'business' ? 'Open' : 'Available:'} ${schedule.open} To ${schedule.close}`
            : 'Closed',
        };
      }),
    [daySchedules, params.mode]
  );

  const handleSave = () => {
    const returnState = params.returnState;
    const mode = params.mode;

    let nextState = 'complete';
    if (mode === 'business' && returnState === 'empty') {
      nextState = 'business';
    } else if (mode === 'consultant' && returnState === 'empty') {
      nextState = 'complete';
    } else if (returnState === 'business') {
      nextState = mode === 'consultant' ? 'complete' : 'business';
    } else if (returnState === 'complete') {
      nextState = 'complete';
    }

    router.replace({
      pathname: '/video-call-availability',
      params: {
        state: nextState,
        ...(mode === 'business'
          ? { businessSchedule: JSON.stringify(summaryItems) }
          : { consultantSchedule: JSON.stringify(summaryItems) }),
      },
    });
  };

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
          Let customers know when you are available
        </Text>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
          className="flex-1"
        >
          <View className="border-t border-[#ECECEC] pt-6">
            {DAYS.map((day, index) => {
              const schedule = daySchedules[day];
              const enabled = schedule.enabled;
              const openPickerKey = `${day}-open`;
              const closePickerKey = `${day}-close`;

              return (
                <View
                  key={day}
                  className="mb-6"
                  style={{ zIndex: activePicker?.startsWith(day) ? 100 : DAYS.length - index }}
                >
                <Text
                  className="text-[12px] text-black uppercase mb-2"
                  style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
                >
                  {day}
                </Text>

                {enabled ? (
                  <View className="flex-row items-end">
                    <View className="flex-1 mr-3" style={{ zIndex: activePicker === openPickerKey ? 120 : 1 }}>
                      <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">
                        Open *
                      </Text>
                      <View className="relative">
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() =>
                            setActivePicker((current) =>
                              current === openPickerKey ? null : openPickerKey
                            )
                          }
                          className="border-b border-[#ECECEC] pb-2 flex-row items-center justify-between"
                        >
                          <Text className="text-[12px] text-black/70">{schedule.open}</Text>
                          <Ionicons
                            name={activePicker === openPickerKey ? 'chevron-up' : 'chevron-down'}
                            size={13}
                            color="#7A7A7A"
                          />
                        </TouchableOpacity>

                        {activePicker === openPickerKey ? (
                          <View
                            className="absolute left-0 right-0 top-full mt-2 border border-[#D9D9D9] bg-white"
                            style={{
                              zIndex: 140,
                              elevation: 12,
                              shadowColor: '#000',
                              shadowOpacity: 0.08,
                              shadowRadius: 10,
                              shadowOffset: { width: 0, height: 6 },
                            }}
                          >
                            {TIME_OPTIONS.map((time, timeIndex) => (
                              <TouchableOpacity
                                key={time}
                                activeOpacity={0.85}
                                onPress={() => {
                                  setDaySchedules((current) => ({
                                    ...current,
                                    [day]: { ...current[day], open: time },
                                  }));
                                  setActivePicker(null);
                                }}
                                className="px-3 py-3 flex-row items-center"
                                style={{
                                  borderBottomWidth: timeIndex === TIME_OPTIONS.length - 1 ? 0 : 1,
                                  borderBottomColor: '#ECECEC',
                                }}
                              >
                                <View className="w-5">
                                  {schedule.open === time ? (
                                    <Ionicons name="checkmark" size={15} color="black" />
                                  ) : null}
                                </View>
                                <Text className="text-[12px] text-black">{time}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View className="flex-1 mr-4" style={{ zIndex: activePicker === closePickerKey ? 120 : 1 }}>
                      <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">
                        Close *
                      </Text>
                      <View className="relative">
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() =>
                            setActivePicker((current) =>
                              current === closePickerKey ? null : closePickerKey
                            )
                          }
                          className="border-b border-[#ECECEC] pb-2 flex-row items-center justify-between"
                        >
                          <Text className="text-[12px] text-black/70">{schedule.close}</Text>
                          <Ionicons
                            name={activePicker === closePickerKey ? 'chevron-up' : 'chevron-down'}
                            size={13}
                            color="#7A7A7A"
                          />
                        </TouchableOpacity>

                        {activePicker === closePickerKey ? (
                          <View
                            className="absolute left-0 right-0 top-full mt-2 border border-[#D9D9D9] bg-white"
                            style={{
                              zIndex: 140,
                              elevation: 12,
                              shadowColor: '#000',
                              shadowOpacity: 0.08,
                              shadowRadius: 10,
                              shadowOffset: { width: 0, height: 6 },
                            }}
                          >
                            {TIME_OPTIONS.map((time, timeIndex) => (
                              <TouchableOpacity
                                key={time}
                                activeOpacity={0.85}
                                onPress={() => {
                                  setDaySchedules((current) => ({
                                    ...current,
                                    [day]: { ...current[day], close: time },
                                  }));
                                  setActivePicker(null);
                                }}
                                className="px-3 py-3 flex-row items-center"
                                style={{
                                  borderBottomWidth: timeIndex === TIME_OPTIONS.length - 1 ? 0 : 1,
                                  borderBottomColor: '#ECECEC',
                                }}
                              >
                                <View className="w-5">
                                  {schedule.close === time ? (
                                    <Ionicons name="checkmark" size={15} color="black" />
                                  ) : null}
                                </View>
                                <Text className="text-[12px] text-black">{time}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() =>
                        setDaySchedules((current) => ({
                          ...current,
                          [day]: { ...current[day], enabled: !current[day].enabled },
                        }))
                      }
                      className="w-12 h-7 rounded-full bg-black px-1 justify-center"
                    >
                      <View className="w-5 h-5 rounded-full bg-white self-end" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View className="flex-row justify-end">
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() =>
                        setDaySchedules((current) => ({
                          ...current,
                          [day]: { ...current[day], enabled: !current[day].enabled },
                        }))
                      }
                      className="w-12 h-7 rounded-full bg-[#E9E9E9] px-1 justify-center"
                    >
                      <View className="w-5 h-5 rounded-full bg-white self-start" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              );
            })}
          </View>
        </ScrollView>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handleSave}
          className="bg-black py-4 items-center justify-center mb-10"
        >
          <Text className="text-[11px] uppercase tracking-[1.1px] text-white">Save</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
