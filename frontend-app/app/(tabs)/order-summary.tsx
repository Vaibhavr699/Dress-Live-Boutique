import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCartStore } from '@/store/useCartStore';

export default function OrderSummaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { type } = useLocalSearchParams();
  const cartItems = useCartStore((state) => state.items);
  
  const isConfirmed = type === 'confirmed';
  const selectedItems = useMemo(
    () => cartItems.filter((item) => item.selected),
    [cartItems]
  );
  const total = useMemo(
    () =>
      selectedItems.reduce((sum, item) => {
        const numericPrice = Number.parseFloat(item.price.replace(/[^\d.]/g, '')) || 0;
        return sum + numericPrice * item.quantity;
      }, 0) + (selectedItems.length > 0 ? 15 : 0),
    [selectedItems]
  );
  const firstItem = selectedItems[0] ?? null;
  const totalQuantity = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.quantity, 0),
    [selectedItems]
  );

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
        {selectedItems.length === 0 ? (
          <View className="items-center justify-center py-20">
            <Text className="text-black text-lg mb-3">No checkout items found</Text>
            <Text className="text-black/45 text-[12px] text-center leading-5 px-4">
              Add items to the cart and select them before opening the order summary.
            </Text>
            <TouchableOpacity
              onPress={() => router.replace('/(tabs)/cart')}
              className="mt-8 border-b border-black pb-1"
            >
              <Text className="text-black text-xs font-bold uppercase tracking-[1px]">Return to Cart</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
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
              : "You've selected pieces from your cart. Here is the summary before payment."
            }
          </Text>
          <Text className="text-black/40 text-[10px] font-bold uppercase tracking-[1px]">
            Order Number: {selectedItems.map((item) => item.id).join('-')}
          </Text>
        </View>

        {/* Product Card */}
        <View className="flex-row items-center mb-10 border-t border-b border-[#F0F0F0] py-6">
          <Image 
            source={firstItem?.imageUrl ? { uri: firstItem.imageUrl } : require('@/assets/images/Dashboard image 3.png')} 
            style={{ width: 80, height: 100, borderRadius: 2 }}
            contentFit="cover"
          />
          <View className="ml-6 flex-1">
            <Text className="text-black text-sm font-medium mb-1">{firstItem?.name}</Text>
            <Text className="text-black/40 text-[12px] mb-2">{totalQuantity} item(s) selected</Text>
            <Text className="text-black text-sm font-bold">{total.toFixed(0)} EUR</Text>
          </View>
        </View>

        <View className="mb-10">
          {selectedItems.map((item) => (
            <View key={item.id} className="flex-row justify-between mb-3">
              <Text className="text-black/60 text-[12px]">
                {item.name} x{item.quantity}
              </Text>
              <Text className="text-black text-[12px]">{item.price}</Text>
            </View>
          ))}
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
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/booking-calendar',
                  params: {
                    appointmentType: 'in_store',
                    source: 'cart',
                  },
                })
              }
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
              <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">
                Confirm Selection - {total.toFixed(0)} EUR
              </Text>
            </TouchableOpacity>
            <Text className="text-black/30 text-[10px] text-center italic">Payment collection will be added later. For now, continue to measurement scheduling.</Text>
          </View>
        )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
