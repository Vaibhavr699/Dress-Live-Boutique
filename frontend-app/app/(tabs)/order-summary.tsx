import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

export default function OrderSummaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { type } = useLocalSearchParams();
  
  const isConfirmed = type === 'confirmed';

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View 
        className="px-6 items-center mb-10"
        style={{ paddingTop: insets.top + 30 }}
      >
        <Text className="text-black text-lg font-bold uppercase tracking-[2px]">Session Summary</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="px-8">
        {/* Status Section */}
        <View className="items-center mb-10">
          <View className="w-16 h-16 bg-[#F2FBF6] rounded-full items-center justify-center mb-6">
            <Ionicons name="checkmark" size={32} color="#34C759" />
          </View>
          
          <Text 
            className="text-black text-2xl font-light mb-4"
            style={{ fontFamily: 'Helvetica Neue' }}
          >
            {isConfirmed ? 'Order Confirmed!' : 'Great Choice!'}
          </Text>
          
          <Text className="text-black/50 text-[12px] text-center px-4 leading-5 mb-2">
            {isConfirmed 
              ? 'Your measurements have been securely received. The boutique is reviewing your order.' 
              : "You've selected the Royal Princess Gown. Here is the summary of your fitting session."
            }
          </Text>
          <Text className="text-black/40 text-[10px] font-bold uppercase tracking-[1px]">Order Number: 234-K</Text>
        </View>

        {/* Product Card */}
        <View className="flex-row items-center mb-10 border-t border-b border-[#F0F0F0] py-6">
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

        {/* Action Buttons */}
        {isConfirmed ? (
          <View className="mb-20">
             <Text className="text-black text-[12px] font-bold uppercase mb-4 tracking-[0.5px]">Next Steps</Text>
             <TouchableOpacity 
              activeOpacity={0.9}
              className="w-full bg-black py-4 items-center justify-center mb-4"
            >
              <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">Use AI to take measurement</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => router.push('/(tabs)/booking-calendar')}
              activeOpacity={0.8}
              className="w-full border border-black py-4 items-center justify-center"
            >
              <Text className="text-black text-[12px] font-bold tracking-[2px] uppercase">Schedule In-Store Measurement</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="mb-20">
            <TouchableOpacity 
              activeOpacity={0.9}
              onPress={() => router.push('/(tabs)/order-summary?type=confirmed')}
              className="w-full bg-black py-4 items-center justify-center mb-6"
            >
              <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">Pay Now - $1,350</Text>
            </TouchableOpacity>
            <Text className="text-black/30 text-[10px] text-center italic">Includes secure payment & return policy acceptance.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
