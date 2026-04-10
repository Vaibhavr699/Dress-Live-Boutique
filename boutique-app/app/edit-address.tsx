import React, { useState } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

function AddressField({
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

export default function EditAddressScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [fullAddress, setFullAddress] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [stateValue, setStateValue] = useState('');
  const [region, setRegion] = useState('');
  const [postalCode, setPostalCode] = useState('');

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-5" style={{ paddingTop: insets.top + 8 }}>
        <TouchableOpacity onPress={() => router.back()} className="mb-8">
          <Ionicons name="arrow-back" size={18} color="black" />
        </TouchableOpacity>

        <Text className="text-[13px] uppercase tracking-[2px] text-black/70 mb-8">Edit Address</Text>
        <Text className="text-[11px] text-black/45 leading-8 mb-8">
          To complete your order, you must first enter your account information. You can update it at any time from your account.
        </Text>

        <AddressField label="Full Address *" value={fullAddress} onChangeText={setFullAddress} />
        <AddressField label="House / Apartment Number" value={houseNumber} onChangeText={setHouseNumber} />
        <AddressField label="State / Province" value={stateValue} onChangeText={setStateValue} />
        <AddressField label="Region" value={region} onChangeText={setRegion} />
        <AddressField label="Postal Code" value={postalCode} onChangeText={setPostalCode} />

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.back()}
          className="bg-black py-4 items-center justify-center mt-auto mb-10"
        >
          <Text className="text-[11px] uppercase tracking-[1px] text-white">Save</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
