import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View 
        className="px-6 flex-row items-center border-b border-[#F0F0F0] pb-4" 
        style={{ paddingTop: insets.top + 10 }}
      >
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="px-8 pt-8">
        <Text className="text-black text-xs font-bold uppercase mb-4 tracking-[1px] opacity-40">Delete your Account</Text>
        <Text className="text-black/50 text-[12px] leading-5 mb-12">
          You are about to begin the process to delete your account.
        </Text>

        <View className="mb-12">
          <Text className="text-black text-[12px] font-bold uppercase mb-4 tracking-[1px] opacity-40">REMEMBER:</Text>
          <Text className="text-black/50 text-[12px] leading-5 mb-10">
            You will not be able to track any purchase, return and/or exchange online.
          </Text>
          <Text className="text-black/50 text-[12px] leading-5">
            You will not be able to access your Live Dress account.
          </Text>
        </View>

        <TouchableOpacity 
          activeOpacity={0.9}
          onPress={() => router.push('/(tabs)/confirm-delete')}
          className="w-full bg-black py-4 items-center justify-center mt-auto mb-20"
          style={{ marginTop: 120 }}
        >
          <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
