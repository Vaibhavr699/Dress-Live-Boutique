import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@shared/store/useAuthStore';

export default function ConfirmDeleteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { logout } = useAuthStore();

  const handleFinalDelete = () => {
    Alert.alert(
      'Account Deleted',
      'Your account has been successfully removed. All data has been cleared.',
      [{ text: 'OK', onPress: logout }]
    );
  };

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

      <ScrollView showsVerticalScrollIndicator={false} className="px-8 pt-8" contentContainerStyle={{ paddingBottom: 150 }}>
        <Text className="text-black text-xs font-bold uppercase mb-4 tracking-[1px] opacity-40">Confirm the Deletion your Account</Text>
        <Text className="text-black/50 text-[12px] leading-5 mb-12">
          Enter your login details to continue.
        </Text>

        <View className="mb-8">
          <Text className="text-black/30 text-[9px] font-bold uppercase mb-2 tracking-[0.5px]">Region</Text>
          <TextInput 
            placeholder="Region"
            className="border-b border-[#F0F0F0] py-4 text-black text-sm"
          />
        </View>

        <View className="mb-10">
          <Text className="text-black/30 text-[9px] font-bold uppercase mb-2 tracking-[0.5px]">Postal Code</Text>
          <TextInput 
            placeholder="Postal Code"
            className="border-b border-[#F0F0F0] py-4 text-black text-sm"
            keyboardType="number-pad"
          />
        </View>

        <TouchableOpacity 
          activeOpacity={0.9}
          onPress={handleFinalDelete}
          className="w-full bg-[#FF3B30] py-4 items-center justify-center mt-10"
        >
          <Text className="text-white text-[12px] font-bold tracking-[2.5px] uppercase">Delete All</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
