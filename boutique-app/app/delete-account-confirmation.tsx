import React, { useState } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

function ConfirmationField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
}) {
  return (
    <View className="mb-5">
      <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        className="border-b border-[#ECECEC] pb-2 text-[12px] text-black"
      />
    </View>
  );
}

export default function DeleteAccountConfirmationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [region, setRegion] = useState('');
  const [postalCode, setPostalCode] = useState('');

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-5" style={{ paddingTop: insets.top + 8 }}>
        <TouchableOpacity onPress={() => router.back()} className="mb-10">
          <Ionicons name="arrow-back" size={18} color="black" />
        </TouchableOpacity>

        <Text className="text-[13px] uppercase tracking-[2px] text-black/70 mb-3">
          Confirm The Deletion Your Account
        </Text>
        <Text className="text-[11px] text-black/55 leading-6 mb-10">
          Enter your login details to continue.
        </Text>

        <ConfirmationField label="Region" value={region} onChangeText={setRegion} />
        <ConfirmationField label="Postal Code" value={postalCode} onChangeText={setPostalCode} />

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.replace('/')}
          className="bg-[#DD2C2C] py-4 items-center justify-center mt-20"
        >
          <Text className="text-[11px] uppercase tracking-[1px] text-white">Delete All</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
