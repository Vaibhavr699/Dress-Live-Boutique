import React, { useState } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const PAYMENT_OPTIONS = [
  { id: 'card', title: 'Card', subtitle: 'CARD', accent: 'AppleCard' },
  { id: 'paypal', title: 'PayPal', subtitle: 'PAYPAL', accent: 'PP' },
  { id: 'apple-pay', title: 'Apple Pay', subtitle: 'APPLE PAY', accent: 'ApplePay' },
  { id: 'gift-card', title: 'Gift Card', subtitle: 'GIFT CARD', accent: 'GIFT\nCARD.' },
  { id: 'in-card', title: 'In Card', subtitle: 'IN CARD', accent: 'IN' },
] as const;

export default function PaymentMethodsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedMethod, setSelectedMethod] = useState<(typeof PAYMENT_OPTIONS)[number]['id']>('paypal');

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-5" style={{ paddingTop: insets.top + 8 }}>
        <TouchableOpacity onPress={() => router.back()} className="mb-10">
          <Ionicons name="arrow-back" size={18} color="black" />
        </TouchableOpacity>

        <Text className="text-[13px] uppercase tracking-[2px] text-black/70 mb-10">
          Please Choose A Payment Method
        </Text>

        <View className="flex-row flex-wrap justify-between">
          {PAYMENT_OPTIONS.map((option) => {
            const selected = option.id === selectedMethod;

            return (
              <TouchableOpacity
                key={option.id}
                activeOpacity={0.85}
                onPress={() => setSelectedMethod(option.id)}
                className="w-[48.2%] border px-4 py-6 mb-5 items-center justify-center min-h-[110px]"
                style={{ borderColor: selected ? '#1A1A1A' : '#E2E2E2' }}
              >
                <Text
                  className="text-[18px] text-black mb-3 text-center"
                  style={{ fontFamily: 'Helvetica Neue', fontWeight: '700' }}
                >
                  {option.accent}
                </Text>
                <Text className="text-[16px] text-black text-center">{option.subtitle}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() =>
            router.push({
              pathname: '/payment-method-details',
              params: { method: selectedMethod },
            })
          }
          className="bg-black py-4 items-center justify-center mt-auto mb-10"
        >
          <Text className="text-[11px] uppercase tracking-[1px] text-white">Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
