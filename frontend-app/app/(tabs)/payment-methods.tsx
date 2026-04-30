import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

const { width } = Dimensions.get('window');
const PAYPAL_ICON = require('@/assets/svg/Paypal.svg');

export default function PaymentMethodsScreen() {
  const router = useRouter();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const insets = useSafeAreaInsets();
  const [selectedMethod, setSelectedMethod] = React.useState('paypal');
  const handleBack = () => {
    if (source === 'profile') {
      router.replace('/(tabs)/profile');
      return;
    }
    router.back();
  };

  const methods = [
    { id: 'card', label: 'CARD', icon: <Ionicons name="card-outline" size={24} color={selectedMethod === 'card' ? 'black' : 'black'} />, subtitle: 'Card' },
    { id: 'paypal', label: 'PAYPAL', icon: <Image source={PAYPAL_ICON} style={{ width: 24, height: 24 }} contentFit="contain" />, subtitle: 'PayPal' },
    { id: 'applepay', label: 'APPLE PAY', icon: <Ionicons name="logo-apple" size={24} color={selectedMethod === 'applepay' ? 'black' : 'black'} />, subtitle: 'Apple Pay' },
    { id: 'giftcard', label: 'GIFT CARD', icon: <Ionicons name="gift-outline" size={24} color={selectedMethod === 'giftcard' ? 'black' : 'black'} />, subtitle: 'Gift Card' },
    { id: 'incard', label: 'IN CARD', icon: <Ionicons name="apps-outline" size={24} color={selectedMethod === 'incard' ? 'black' : 'black'} />, subtitle: 'In Card' },
  ];

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View 
        className="px-6 flex-row items-center border-b border-[#F0F0F0] pb-4" 
        style={{ paddingTop: insets.top + 10 }}
      >
        <TouchableOpacity onPress={handleBack} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
        <Text className="text-black text-sm font-bold uppercase tracking-[2px] ml-4">Payment Methods</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="px-8 pt-8" contentContainerStyle={{ paddingBottom: 120 }}>
        <Text
          className="text-black mb-10 text-center"
          style={{
            fontFamily: 'Helvetica Neue',
            fontWeight: '200',
            fontSize: 18,
            lineHeight: 18,
            letterSpacing: 2,
            opacity: 0.7,
            textTransform: 'uppercase',
          }}
        >
          Please Choose a Payment Method
        </Text>
        
        <View className="flex-row flex-wrap justify-between">
          {methods.map((method) => {
            const isSelected = selectedMethod === method.id;
            const cardWidth = Math.min(185, (width - 64 - 24) / 2);
            return (
              <TouchableOpacity 
                key={method.id}
                activeOpacity={0.8}
                onPress={() => setSelectedMethod(method.id)}
                className={`items-center justify-center mb-6 border ${isSelected ? 'border-black' : 'border-[#F0F0F0]'}`}
                style={{
                  width: cardWidth,
                  height: 110,
                  borderWidth: 1,
                }}
              >
                <View className="mb-4">{method.icon}</View>
                <Text
                  className="text-black uppercase"
                  style={{
                    fontFamily: 'Helvetica Neue',
                    fontWeight: '300',
                    fontSize: 18,
                    lineHeight: 18,
                    letterSpacing: 1,
                  }}
                >
                  {method.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Continue Button */}
      <View 
          className="absolute bottom-0 left-0 right-0 bg-white px-8 pt-4 pb-8 border-t border-[#F5F5F5]"
          style={{ paddingBottom: 30 }}
        >
          <TouchableOpacity 
            activeOpacity={0.9}
            onPress={() =>
              router.push({
                pathname: source === 'profile' ? '/profile-payment-details' : '/(tabs)/payment-details',
                params: { source },
              })
            }
            className="w-full bg-black py-4 items-center justify-center"
          >
            <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">
              Continue
            </Text>
          </TouchableOpacity>
        </View>
    </View>
  );
}

