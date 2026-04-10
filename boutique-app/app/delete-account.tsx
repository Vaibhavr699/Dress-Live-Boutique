import React from 'react';
import { View, Text, SafeAreaView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-5" style={{ paddingTop: insets.top + 8 }}>
        <TouchableOpacity onPress={() => router.back()} className="mb-10">
          <Ionicons name="arrow-back" size={18} color="black" />
        </TouchableOpacity>

        <Text className="text-[13px] uppercase tracking-[2px] text-black/70 mb-3">
          Delete Your Account
        </Text>
        <Text className="text-[11px] text-black/55 leading-6 mb-12">
          You are about to begin the process to delete your account.
        </Text>

        <Text className="text-[13px] uppercase tracking-[2px] text-black/70 mb-3">Remember:</Text>
        <Text className="text-[11px] text-black/55 leading-6 mb-12">
          You will not be able to track any purchase, return and/or exchange online.
        </Text>

        <Text className="text-[11px] text-black/55 leading-6">
          You will not able to access your Live Dress account.
        </Text>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.push('/delete-account-confirmation')}
          className="bg-black py-4 items-center justify-center mt-auto mb-10"
        >
          <Text className="text-[11px] uppercase tracking-[1px] text-white">Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
