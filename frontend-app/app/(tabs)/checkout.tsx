import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

export default function CheckoutScreen() {
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
        <Text className="text-black text-lg font-medium">Checkout</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="px-6 pt-6">
        {/* Order Summary */}
        <Text className="text-black text-[12px] font-bold uppercase mb-4 tracking-[0.5px]">Order Summary</Text>
        <View className="flex-row items-center mb-10 pb-6 border-b border-[#F0F0F0]">
          <Image 
            source={require('@/assets/images/Dashboard image 3.png')} 
            style={{ width: 80, height: 100, borderRadius: 2 }}
            contentFit="cover"
          />
          <View className="ml-6 flex-1">
            <Text className="text-black text-sm font-medium mb-1">Dress title show here</Text>
            <Text className="text-black/40 text-[12px] mb-2">Shop name here</Text>
            <Text className="text-black text-sm font-bold">$1,455</Text>
          </View>
        </View>

        {/* Action Button */}
        <TouchableOpacity 
          activeOpacity={0.9}
          onPress={() => router.push('/(tabs)/order-summary')}
          className="w-full bg-black py-4 items-center justify-center mb-10"
        >
          <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">Pay Now</Text>
        </TouchableOpacity>


        {/* Payment Method */}
        <Text className="text-black text-[12px] font-bold uppercase mb-4 tracking-[0.5px]">Payment Method</Text>
        <View className="flex-row justify-between items-center bg-[#F9F9F9] p-4 border border-[#F0F0F0] mb-10">
          <View className="flex-row items-center">
            <View className="w-10 h-6 bg-white border border-[#E0E0E0] items-center justify-center mr-4">
              <Text className="text-blue-800 text-[10px] font-bold">VISA</Text>
            </View>
            <Text className="text-black text-sm">Visa ending in 3400</Text>
          </View>
          <TouchableOpacity>
            <Text className="text-black text-[10px] font-bold uppercase tracking-[1px] border-b border-black">Change</Text>
          </TouchableOpacity>
        </View>

        {/* No Returns Policy */}
        <View className="bg-[#FFF8F2] p-4 flex-row items-start border border-[#FFF0E0] mb-20">
          <Ionicons name="alert-circle-outline" size={20} color="#FF9500" style={{ marginRight: 12, marginTop: 2 }} />
          <View className="flex-1">
            <Text className="text-[#FF9500] text-[12px] font-bold mb-1 uppercase tracking-[0.5px]">No Returns Policy</Text>
            <Text className="text-black/60 text-[11px] leading-4">
              Since this dress is made-to-order based on your unique measurements, we cannot accept returns or exchanges once production begins.
            </Text>
          </View>
        </View>

        {/* Secure Message */}
        <View className="items-center flex-row justify-center pb-20">
          <Feather name="lock" size={14} color="black" style={{ opacity: 0.3, marginRight: 8 }} />
          <Text className="text-black/30 text-[10px]">Payments are secure and encrypted</Text>
        </View>
      </ScrollView>
    </View>
  );
}
