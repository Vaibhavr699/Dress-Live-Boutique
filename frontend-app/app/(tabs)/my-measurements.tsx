import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MyMeasurementsScreen() {
  const router = useRouter();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    if (source === 'profile') {
      router.replace('/(tabs)/profile');
      return;
    }
    router.back();
  };

  return (
    <View className="flex-1 bg-white">
      <View
        className="px-6 flex-row items-center border-b border-[#F0F0F0] pb-4"
        style={{ paddingTop: insets.top + 10 }}
      >
        <TouchableOpacity onPress={handleBack} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
        <Text className="text-black text-lg font-medium">My Measurements</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="px-8 pt-8">
        <Text className="text-black/50 text-[12px] leading-5">
          This section will store your body measurements to improve dress accuracy.
          We’ll connect manual input and AI measurement here next.
        </Text>
      </ScrollView>
    </View>
  );
}

