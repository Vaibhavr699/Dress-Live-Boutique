import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

const PAYMENT_LOGOS = require('../assets/svg/Group 1171277496.svg');
const ERROR_ICON = require('../assets/svg/diamond-exclamation.svg');

export default function PaymentDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fields = [
    { id: 'cardNumber', label: 'Card Number', placeholder: '**** **** **** ****' },
    { id: 'expiry', label: 'Expiration (MM/YY)', placeholder: 'MM/YY' },
    { id: 'cardholder', label: 'Cardholder Name', placeholder: 'Name' },
    { id: 'cvv', label: 'Security Code (CVV)', placeholder: '***', hasHelp: true },
  ];

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="px-6 flex-row items-center border-b border-[#F0F0F0] pb-4" style={{ paddingTop: insets.top + 10 }}>
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="px-8 pt-8" contentContainerStyle={{ paddingBottom: 150 }}>
        <Text
          className="text-black mb-10"
          style={{
            fontFamily: 'Helvetica Neue',
            fontWeight: '200',
            fontSize: 18,
            lineHeight: 18,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          Complete Payment Details
        </Text>

        <View className="mb-10">
          <Image source={PAYMENT_LOGOS} style={{ width: 240, height: 28 }} contentFit="contain" />
        </View>

        {fields.map((field) => (
          <View key={field.id} className="mb-8">
            <Text
              className="text-black/40 uppercase mb-2"
              style={{
                fontFamily: 'Helvetica Neue',
                fontWeight: '300',
                fontSize: 12,
                lineHeight: 12,
                letterSpacing: 0.72,
              }}
            >
              {field.label} <Text style={{ color: '#FF3B30' }}>*</Text>
            </Text>
            <TextInput
              placeholder={field.placeholder}
              className="border-b text-black"
              style={{
                paddingVertical: 0,
                height: 28,
                borderBottomColor: showErrors ? '#FF3B30' : '#F0F0F0',
                fontFamily: 'Helvetica Neue',
                fontWeight: '300',
                fontSize: 14,
                lineHeight: 14,
                letterSpacing: 0.84,
              }}
            />
            {showErrors && (
              <View className="flex-row items-center mt-2">
                <Image source={ERROR_ICON} style={{ width: 12, height: 12, marginRight: 6 }} contentFit="contain" />
                <Text className="text-[#FF3B30] text-[10px]">This field is required.</Text>
              </View>
            )}
            {field.hasHelp && (
              <TouchableOpacity onPress={() => setShowErrors(true)} className="mt-2">
                <View className="flex-row items-center">
                  <Image source={ERROR_ICON} style={{ width: 12, height: 12, marginRight: 6 }} contentFit="contain" />
                  <Text className="text-[#FF3B30] text-[10px]">What is the security code?</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 bg-white px-8 pt-4 pb-8 border-t border-[#F5F5F5]" style={{ paddingBottom: 30 }}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={async () => {
            setShowErrors(true);
            if (submitting) return;
            setSubmitting(true);
            try {
              await new Promise((r) => setTimeout(r, 400));
            } finally {
              setSubmitting(false);
            }
          }}
          className="w-full bg-black py-4 items-center justify-center"
        >
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">Payment Authorized</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
