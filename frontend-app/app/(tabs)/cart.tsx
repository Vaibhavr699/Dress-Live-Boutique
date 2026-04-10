import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type CartItem = {
  id: string;
  name: string;
  price: string;
  image: any;
  selected: boolean;
};

export default function CartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  // Mock cart items
  const [cartItems, setCartItems] = useState<CartItem[]>([
    { id: '1', name: 'Bella Gown', price: '1800 EUR', image: require('@/assets/images/Dashboard image 1.png'), selected: true },
    { id: '2', name: 'Bella Gown', price: '1800 EUR', image: require('@/assets/images/Dashboard image 2.png'), selected: true },
    { id: '3', name: 'Bella Gown', price: '1800 EUR', image: require('@/assets/images/Dashboard image 3.png'), selected: false },
    { id: '4', name: 'Bella Gown', price: '1800 EUR', image: require('@/assets/images/Dashboard image 3.png'), selected: false },
  ]);

  const toggleSelect = (id: string) => {
    setCartItems(prev => prev.map(item => 
      item.id === id ? { ...item, selected: !item.selected } : item
    ));
  };

  const removeItem = (id: string) => {
    setCartItems(prev => prev.filter(item => item.id !== id));
  };

  const selectedCount = cartItems.filter(item => item.selected).length;
  const isEmpty = cartItems.length === 0;

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View 
        className="px-6 items-center border-b border-[#F0F0F0] pb-4" 
        style={{ paddingTop: insets.top + 10 }}
      >
        <Text className="text-black text-sm font-bold uppercase tracking-[2px]">
          Shopping Cart {cartItems.length}
        </Text>
      </View>

      {isEmpty ? (
        <View className="flex-1 items-center justify-center px-10">
          <View className="mb-8 opacity-20">
            <Feather name="shopping-cart" size={64} color="black" />
          </View>
          <Text className="text-black text-lg font-medium uppercase tracking-[2px] mb-2">
            Your basket is empty
          </Text>
          <Text className="text-black/40 text-xs text-center font-light">
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
                  className={`w-5 h-5 border border-[#F0F0F0] items-center justify-center mt-8 mr-6 ${item.selected ? 'bg-white' : ''}`}
                >
                  {item.selected && <View className="w-2.5 h-2.5 bg-black" />}
                </TouchableOpacity>

                {/* Product Info Row */}
                <View className="flex-1">
                  <View className="flex-row mb-2">
                    <Image 
                      source={item.image} 
                      style={{ width: 100, height: 120, borderRadius: 2 }}
                      contentFit="cover"
                    />
                    <View className="ml-6 flex-1 py-1">
                      <Text className="text-black text-sm font-medium mb-1">{item.name}</Text>
                      <Text className="text-black/40 text-[12px] font-light">{item.price}</Text>
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
              onPress={() => router.push('/(tabs)/checkout')}
              className="w-full bg-black py-4 items-center justify-center"
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


