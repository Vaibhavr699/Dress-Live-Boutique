import React, { useMemo, useState } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

type FieldKey = 'cardNumber' | 'expiration' | 'cardholderName' | 'securityCode';

function PaymentField({
  label,
  value,
  onChangeText,
  showError,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  showError: boolean;
  keyboardType?: 'default' | 'number-pad';
}) {
  return (
    <View className="mb-5">
      <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        className="pb-2 text-[12px] text-black"
        style={{ borderBottomWidth: 1, borderBottomColor: showError ? '#FF3B30' : '#ECECEC' }}
      />
      {showError ? (
        <View className="flex-row items-center mt-2">
          <Ionicons name="alert-circle-outline" size={14} color="#FF3B30" />
          <Text className="text-[10px] text-[#FF3B30] ml-1">This field is required.</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function PaymentMethodDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ method?: string }>();

  const [cardNumber, setCardNumber] = useState('');
  const [expiration, setExpiration] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [securityCode, setSecurityCode] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const errors = useMemo<Record<FieldKey, boolean>>(
    () => ({
      cardNumber: submitted && !cardNumber.trim(),
      expiration: submitted && !expiration.trim(),
      cardholderName: submitted && !cardholderName.trim(),
      securityCode: submitted && !securityCode.trim(),
    }),
    [submitted, cardNumber, expiration, cardholderName, securityCode]
  );

  const hasErrors = Object.values(errors).some(Boolean);
  const selectedMethod = params.method || 'paypal';

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-5" style={{ paddingTop: insets.top + 8 }}>
        <TouchableOpacity onPress={() => router.back()} className="mb-10">
          <Ionicons name="arrow-back" size={18} color="black" />
        </TouchableOpacity>

        <Text className="text-[13px] uppercase tracking-[2px] text-black/70 mb-10">
          Complete Payment Details
        </Text>

        <View className="flex-row items-center mb-10">
          <Text className="text-[18px] text-[#635BFF] mr-3" style={{ fontFamily: 'Helvetica Neue', fontWeight: '700' }}>
            stripe
          </Text>
          <Text className="text-[16px] text-[#1A4DFF] mr-3" style={{ fontFamily: 'Helvetica Neue', fontWeight: '700' }}>
            VISA
          </Text>
          <Text className="text-[16px] text-[#1A73E8] mr-3" style={{ fontFamily: 'Helvetica Neue', fontWeight: '700' }}>
            amazon
          </Text>
          <Text className="text-[16px] text-[#EA4335]" style={{ fontFamily: 'Helvetica Neue', fontWeight: '700' }}>
            MC
          </Text>
        </View>

        <PaymentField
          label="Card Number *"
          value={cardNumber}
          onChangeText={setCardNumber}
          showError={errors.cardNumber}
          keyboardType="number-pad"
        />
        <PaymentField
          label="Expiration (MM/YY) *"
          value={expiration}
          onChangeText={setExpiration}
          showError={errors.expiration}
        />
        <PaymentField
          label="Cardholder Name *"
          value={cardholderName}
          onChangeText={setCardholderName}
          showError={errors.cardholderName}
        />
        <PaymentField
          label="Security Code (CVV) *"
          value={securityCode}
          onChangeText={setSecurityCode}
          showError={errors.securityCode}
          keyboardType="number-pad"
        />

        {errors.securityCode ? (
          <View className="flex-row items-center -mt-2">
            <Ionicons name="alert-circle-outline" size={14} color="#FF3B30" />
            <Text className="text-[10px] text-[#FF3B30] ml-1">What is the security code?</Text>
          </View>
        ) : null}

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => {
            setSubmitted(true);
            if (!hasErrors && cardNumber.trim() && expiration.trim() && cardholderName.trim() && securityCode.trim()) {
              router.back();
            }
          }}
          className="bg-black py-4 items-center justify-center mt-auto mb-10"
        >
          <Text className="text-[11px] uppercase tracking-[1px] text-white">
            {selectedMethod === 'paypal' ? 'Payment Authorized' : 'Payment Authorized'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
