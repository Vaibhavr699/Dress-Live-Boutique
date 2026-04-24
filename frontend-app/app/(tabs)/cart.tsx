import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCartStore } from '@/store/useCartStore';
import { useAuthStore } from '@shared/store/useAuthStore';

const BASKET_EMPTY_SVG = require('@/assets/svg/basket.svg');

const EMPTY_STATE_HEADING_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '300' as const,
  fontSize: 14,
  lineHeight: 14,
  letterSpacing: 0.56,
  textAlign: 'center' as const,
  color: '#000000',
};

const EMPTY_STATE_SUBHEADING_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '300' as const,
  fontSize: 12,
  lineHeight: 12,
  letterSpacing: 0,
  textAlign: 'center' as const,
  color: '#000000',
};

export default function CartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const cartItems = useCartStore((state) => state.items);
  const removeItem = useCartStore((state) => state.removeItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const toggleSelected = useCartStore((state) => state.toggleSelected);

  const toggleSelect = (id: string) => {
    toggleSelected(id);
  };

  const selectedCount = useMemo(
    () => cartItems.filter((item) => item.selected).reduce((total, item) => total + item.quantity, 0),
    [cartItems]
  );
  const isEmpty = cartItems.length === 0;

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View 
        className="px-6 items-center border-b border-[#F0F0F0] pb-4" 
        style={{ paddingTop: insets.top + 10 }}
      >
        <Text className="text-black text-sm font-bold uppercase tracking-[2px]">
          Shopping Cart {cartItems.reduce((total, item) => total + item.quantity, 0)}
        </Text>
      </View>

      {isEmpty ? (
        <View className="flex-1 items-center justify-center px-10">
          <View className="mb-8 items-center justify-center">
            <Image
              source={BASKET_EMPTY_SVG}
              style={{ width: 68, height: 68 }}
              contentFit="contain"
            />
          </View>
          <Text className="mb-2" style={EMPTY_STATE_HEADING_STYLE}>
            Your basket is empty
          </Text>
          <Text style={EMPTY_STATE_SUBHEADING_STYLE}>
            The items you add will be shown here
          </Text>
          
          <TouchableOpacity 
            onPress={() => router.push('/')}
            className="mt-10 border-b border-black pb-1"
          >
            <Text className="text-black text-xs font-bold uppercase tracking-[1px]">Shop Now</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView 
            showsVerticalScrollIndicator={false} 
            className="flex-1"
            contentContainerStyle={{ paddingTop: 24, paddingBottom: 120 }}
          >
            {cartItems.map((item) => (
              <View key={item.id} className="flex-row items-start px-6 mb-8">
                {/* Checkbox */}
                <TouchableOpacity 
                  onPress={() => toggleSelect(item.id)}
                  className="w-5 h-5 border border-[#F0F0F0] items-center justify-center mt-8 mr-6"
                >
                  {item.selected && <View className="w-2.5 h-2.5 bg-black" />}
                </TouchableOpacity>

                {/* Product Info Row */}
                <View className="flex-1">
                  <View className="flex-row mb-2">
                    <Image 
                      source={item.imageUrl ? { uri: item.imageUrl } : require('@/assets/images/Dashboard image 3.png')} 
                      style={{ width: 100, height: 120, borderRadius: 2 }}
                      contentFit="cover"
                    />
                    <View className="ml-6 flex-1 py-1">
                      <Text className="text-black text-sm font-medium mb-1">{item.name}</Text>
                      <Text className="text-black/40 text-[12px] font-light">{item.price}</Text>
                      <View className="flex-row items-center mt-4">
                        <TouchableOpacity
                          onPress={() => updateQuantity(item.id, item.quantity - 1)}
                          className="w-8 h-8 border border-[#F0F0F0] items-center justify-center"
                        >
                          <Ionicons name="remove" size={14} color="black" />
                        </TouchableOpacity>
                        <Text className="mx-4 text-black text-[12px] font-medium">{item.quantity}</Text>
                        <TouchableOpacity
                          onPress={() => updateQuantity(item.id, item.quantity + 1)}
                          className="w-8 h-8 border border-[#F0F0F0] items-center justify-center"
                        >
                          <Ionicons name="add" size={14} color="black" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* Divider and Actions */}
                  <View className="ml-[1px]"> 
                    <View className="h-[1px] bg-[#F0F0F0] w-full mb-4 mt-6" />
                    <View className="flex-row justify-between items-center pr-2">
                      <TouchableOpacity onPress={() => removeItem(item.id)}>
                        <Text className="text-black/40 text-[10px] font-bold uppercase tracking-[0.5px]">Remove</Text>
                      </TouchableOpacity>
                      <TouchableOpacity>
                        <Ionicons name="heart-outline" size={18} color="black" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Footer Footer */}
          <View 
            className="absolute bottom-0 left-0 right-0 bg-white px-8 pt-4 pb-8 border-t border-[#F5F5F5]"
            style={{ paddingBottom: 30 }}
          >
            <TouchableOpacity 
              activeOpacity={0.9}
              disabled={selectedCount === 0}
              onPress={() => {
                if (!isAuthenticated) {
                  router.push('/auth-choice');
                  return;
                }
                router.push('/(tabs)/checkout');
              }}
              className={`w-full py-4 items-center justify-center ${selectedCount === 0 ? 'bg-black/30' : 'bg-black'}`}
            >
              <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">
                Continue ({selectedCount})
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}


