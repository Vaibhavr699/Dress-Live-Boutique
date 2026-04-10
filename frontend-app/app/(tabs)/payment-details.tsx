import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Image as RNImage } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PaymentDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [showErrors, setShowErrors] = useState(false);

  const fields = [
    { id: 'cardNumber', label: 'Card Number', placeholder: '**** **** **** ****' },
    { id: 'expiry', label: 'Expiration (MM/YY)', placeholder: 'MM/YY' },
    { id: 'cardholder', label: 'Cardholder Name', placeholder: 'Name' },
    { id: 'cvv', label: 'Security Code (CVV)', placeholder: '***', hasHelp: true },
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

      <ScrollView showsVerticalScrollIndicator={false} className="px-8 pt-8" contentContainerStyle={{ paddingBottom: 150 }}>
        <Text className="text-black text-[12px] font-bold uppercase mb-10 tracking-[1px] opacity-40">Complete Payment Details</Text>
        
        {/* Logos Placeholder */}
        <View className="flex-row gap-4 mb-10 items-center">
           <Text className="text-blue-800 font-bold italic text-base">stripe</Text>
           <Text className="text-blue-900 font-bold italic text-base">VISA</Text>
           <Text className="text-orange-500 font-bold italic text-base">amazon</Text>
           <View className="w-6 h-4 bg-red-500 rounded-full opacity-40 ml-2" />
        </View>

        {fields.map((field) => (
          <View key={field.id} className="mb-8">
            <Text className="text-black/30 text-[9px] font-bold uppercase mb-2 tracking-[0.5px]">{field.label} *</Text>
            <TextInput 
              placeholder={field.placeholder}
              className={`border-b border-[#F0F0F0] py-2 text-black text-sm ${showErrors ? 'border-red-500' : ''}`}
            />
            {showErrors && (
              <View className="flex-row items-center mt-2">
                <Ionicons name="alert-circle" size={10} color="#FF3B30" className="mr-1" />
                <Text className="text-[#FF3B30] text-[10px] ml-1">This field is required.</Text>
              </View>
            )}
            {field.hasHelp && (
              <TouchableOpacity onPress={() => setShowErrors(true)} className="mt-2">
                <Text className="text-black/30 text-[10px] italic">What is the security code?</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Action Button */}
      <View 
          className="absolute bottom-0 left-0 right-0 bg-white px-8 pt-4 pb-8 border-t border-[#F5F5F5]"
          style={{ paddingBottom: 30 }}
        >
          <TouchableOpacity 
            activeOpacity={0.9}
            onPress={() => setShowErrors(true)}
            className="w-full bg-black py-4 items-center justify-center"
          >
            <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">
              Payment Authorized
            </Text>
          </TouchableOpacity>
        </View>
    </View>
  );
}
