import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCartStore } from '@/store/useCartStore';

export default function CheckoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cartItems = useCartStore((state) => state.items);
  const selectedItems = useMemo(
    () => cartItems.filter((item) => item.selected),
    [cartItems]
  );
  const totalQuantity = useMemo(
    () => selectedItems.reduce((total, item) => total + item.quantity, 0),
    [selectedItems]
  );
  const subtotal = useMemo(
    () =>
      selectedItems.reduce((total, item) => {
        const numericPrice = Number.parseFloat(item.price.replace(/[^\d.]/g, '')) || 0;
        return total + numericPrice * item.quantity;
      }, 0),
    [selectedItems]
  );
  const serviceFee = selectedItems.length > 0 ? 15 : 0;
  const total = subtotal + serviceFee;
  const isEmpty = selectedItems.length === 0;

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
        {isEmpty ? (
          <View className="items-center justify-center py-24">
            <Feather name="shopping-cart" size={56} color="black" style={{ opacity: 0.2 }} />
            <Text className="text-black text-base font-medium mt-6 mb-2">No items selected</Text>
            <Text className="text-black/40 text-[11px] text-center leading-5 px-8">
              Select at least one cart item before continuing to checkout.
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
            {/* Order Summary */}
            <Text className="text-black text-[12px] font-bold uppercase mb-4 tracking-[0.5px]">
              Order Summary ({totalQuantity})
            </Text>
            <View className="mb-10 border-b border-[#F0F0F0]">
              {selectedItems.map((item) => (
                <View key={item.id} className="flex-row items-center mb-6 pb-6">
                  <Image
                    source={item.imageUrl ? { uri: item.imageUrl } : require('@/assets/images/Dashboard image 3.png')}
                    style={{ width: 80, height: 100, borderRadius: 2 }}
                    contentFit="cover"
                  />
                  <View className="ml-6 flex-1">
                    <Text className="text-black text-sm font-medium mb-1">{item.name}</Text>
                    <Text className="text-black/40 text-[12px] mb-2">Quantity {item.quantity}</Text>
                    <Text className="text-black text-sm font-bold">{item.price}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View className="mb-10 rounded-sm border border-[#F0F0F0] bg-[#F9F9F9] p-4">
              <View className="flex-row justify-between mb-2">
                <Text className="text-black/50 text-[12px]">Subtotal</Text>
                <Text className="text-black text-[12px]">{subtotal.toFixed(0)} EUR</Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-black/50 text-[12px]">Service Fee</Text>
                <Text className="text-black text-[12px]">{serviceFee.toFixed(0)} EUR</Text>
              </View>
              <View className="flex-row justify-between pt-2 border-t border-[#ECECEC]">
                <Text className="text-black text-[12px] font-bold uppercase">Total</Text>
                <Text className="text-black text-[12px] font-bold">{total.toFixed(0)} EUR</Text>
              </View>
            </View>

            {/* Action Button */}
            <TouchableOpacity 
              activeOpacity={0.9}
              onPress={() => router.push('/(tabs)/order-summary')}
              className="w-full bg-black py-4 items-center justify-center mb-10"
            >
              <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">
                Review Selection - {total.toFixed(0)} EUR
              </Text>
            </TouchableOpacity>
          </>
        )}


        {/* Payment Method */}
        <Text className="text-black text-[12px] font-bold uppercase mb-4 tracking-[0.5px]">Payment Method</Text>
        <View className="bg-[#F9F9F9] p-4 border border-[#F0F0F0] mb-10">
          <Text className="text-black text-sm mb-2">Payment will be enabled in a later step.</Text>
          <Text className="text-black/45 text-[11px] leading-5">
            For now, the cart flow lets buyers review their selected dresses and continue to measurement scheduling without a live payment method.
          </Text>
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
          <Text className="text-black/30 text-[10px]">Checkout review is saved locally until payment is added</Text>
        </View>
      </ScrollView>
    </View>
  );
}
