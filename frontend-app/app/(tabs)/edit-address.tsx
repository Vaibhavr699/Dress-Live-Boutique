import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function EditAddressScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const fields = [
    { label: 'First Name', value: 'Naseeb', required: true },
    { label: 'Last Name', value: 'Zulfiqar', required: true },
    { label: 'Address', value: '', required: true },
    { label: 'House / Apartment Number', value: '' },
    { label: 'State / Province', value: '' },
    { label: 'Region', value: '' },
    { label: 'Postal Code', value: '' },
    { label: 'Country Code', value: '+92', isPhone: true },
  ];

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
        <Text className="text-black text-xs font-bold uppercase mb-4 tracking-[1px] opacity-40">Edit Address</Text>
        <Text className="text-black/50 text-[12px] leading-5 mb-10">
          To complete your order, you must first enter your account information. You can update it at any time from your account.
        </Text>

        {fields.map((field, idx) => (
          <View key={idx} className="mb-6">
            <Text className="text-black/30 text-[9px] font-bold uppercase mb-2 tracking-[0.5px]">
              {field.label} {field.required && '*'}
            </Text>
            {field.isPhone ? (
               <View className="flex-row gap-4">
                  <TextInput 
                    className="border-b border-[#F0F0F0] py-2 text-black text-sm flex-[0.3]"
                    defaultValue={field.value}
                  />
                  <TextInput 
                    placeholder="Phone Number"
                    className="border-b border-[#F0F0F0] py-2 text-black text-sm flex-1"
                  />
               </View>
            ) : (
                <TextInput 
                  className="border-b border-[#F0F0F0] py-2 text-black text-sm"
                  defaultValue={field.value}
                />
            )}
          </View>
        ))}

        <TouchableOpacity 
          activeOpacity={0.9}
          onPress={() => router.back()}
          className="w-full bg-black py-4 items-center justify-center mt-10 mb-20"
        >
          <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">Save</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
