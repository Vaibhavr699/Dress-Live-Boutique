import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions, SafeAreaView } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Modal, Pressable, Animated, Alert } from 'react-native';
import { BlurView } from 'expo-blur';
import { useCartStore } from '@/store/useCartStore';
import { useWishlistStore } from '@/store/useWishlistStore';


const { width } = Dimensions.get('window');

const PRODUCTS = [
  { id: '1', name: 'Bella Gown', price: '1800 EUR', image: require('@/assets/images/Dashboard image 3.png') },
  { id: '2', name: 'Queen Dress', price: '1600 EUR', image: require('@/assets/images/Dashboard image 2.png') },
  { id: '3', name: 'Bride Whiteness', price: '1800 EUR', image: require('@/assets/images/Dashboard image 1.png') },
  { id: '4', name: 'Bella Gown', price: '1800 EUR', image: require('@/assets/images/Dashboard image 3.png') },
];

const CATEGORIES = ["All", "Abendkleider", "Hochzeitskleider", "Add-Ons"];

export default function BoutiqueDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { addItem } = useCartStore();
  const { toggleItem, isInWishlist } = useWishlistStore();
  
  const [activeCategory, setActiveCategory] = useState('All');

  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const [selectedPrice, setSelectedPrice] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);

  const priceRanges = ["0 - 500 EUR", "500 - 1500 EUR", "1500+ EUR"];
  const sizes = ["34", "36", "38", "40", "42", "44"];

  const filteredProducts = PRODUCTS.filter(item => {
    // Category filter
    if (activeCategory !== 'All' && item.name !== activeCategory) {
       // Note: Currently PRODUCTS don't have category field, but for demo we filter by name or keep as is
    }
    
    // Price filter logic would go here if PRODUCTS had numeric prices
    return true;
  });

  const resetFilters = () => {
    setSelectedPrice(null);
    setSelectedSize(null);
    setActiveCategory('All');
  };

  return (
    <View className="flex-1 bg-white">
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ paddingBottom: 100, paddingTop: insets.top }}
      >
        {/* Header Image Section */}
        <View className="relative w-full aspect-[4/3] px-6">
          <Image 
            source={require('@/assets/images/Dashboard image 1.png')} 
            style={{ width: '100%', height: '100%'}}
            contentFit="cover"
          />
          <TouchableOpacity 
            onPress={() => router.back()}
            className="absolute left-10 top-4 w-10 h-10 items-center justify-center bg-white/20 rounded-full"
          >
            <Ionicons name="arrow-back" size={24} color="black" />
          </TouchableOpacity>
        </View>


        {/* Boutique Info */}
        <View className="px-6 py-6">
          <View className="flex-row justify-between items-start mb-1">
            <Text 
              className="text-black text-2xl font-medium"
              style={{ fontFamily: 'Helvetica Neue' }}
            >
              Parla Weddings
            </Text>
            <View className="flex-row items-center">
              <Text className="text-black text-xs font-medium mr-1">4.8</Text>
              <Ionicons name="star" size={14} color="#FFD700" />
            </View>
          </View>
          
          {/* Row 2: Location and Languages */}
          <View className="flex-row justify-between items-center mb-6">
            <Text 
              className="text-[#1A1A1A50] text-[15px] font-normal"
              style={{ fontFamily: 'Helvetica Neue' }}
            >
              Weil Am Rhein
            </Text>
            
            <Text 
              className="text-[#1A1A1A50] text-[14px] font-normal uppercase tracking-[0.5px]"
              style={{ fontFamily: 'Helvetica Neue' }}
            >
              EN | DE | FR
            </Text>
          </View>

          {/* Row 3: Filters */}
          <View className="items-end mb-8">
            <TouchableOpacity onPress={() => setIsFilterVisible(true)}>
              <Text className="text-[#004CC4] text-[14px] font-normal">Filters</Text>
            </TouchableOpacity>
          </View>




          {/* Categories */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            className="mb-8"
            contentContainerStyle={{ paddingRight: 40 }}
          >
            {CATEGORIES.map((cat) => (
              <TouchableOpacity 
                key={cat} 
                onPress={() => setActiveCategory(cat)}
                className="mr-8 items-center"
              >
                <Text 
                  className={activeCategory === cat ? 'text-[#1A1A1A]' : 'text-[#1A1A1A50]'}
                  style={{ 
                    fontFamily: 'Helvetica Neue',
                    fontWeight: '500',
                    fontSize: 12,
                    lineHeight: 12,
                    letterSpacing: 0.5
                  }}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View className="flex-row flex-wrap justify-between">
            {filteredProducts.map((item) => (
              <View key={item.id} style={{ width: '48%', marginBottom: 24 }}>
                <View className="relative mb-3">
                  <TouchableOpacity 
                    activeOpacity={0.9} 
                    onPress={() => router.push('/(tabs)/product-details')}
                  >
                    <Image 
                      source={item.image} 
                      style={{ width: '100%', height: 180 }}
                      contentFit="cover"
                    />
                  </TouchableOpacity>
                  
                  {/* Heart Button Overlay */}
                  <TouchableOpacity 
                    onPress={() => toggleItem(item)}
                    className="absolute top-2 right-2 w-8 h-8 items-center justify-center bg-white/60 rounded-full"
                  >
                    <Ionicons 
                      name={isInWishlist(item.id) ? "heart" : "heart-outline"} 
                      size={18} 
                      color={isInWishlist(item.id) ? "#FF3B30" : "black"} 
                    />
                  </TouchableOpacity>
                </View>

                <View className="flex-row justify-between items-center px-1">
                  <TouchableOpacity 
                    onPress={() => router.push('/(tabs)/product-details')}
                    className="flex-1"
                  >
                    <Text 
                      className="text-black text-[14px] font-[500] mb-1"
                      style={{ fontFamily: 'Helvetica Neue' }}
                    >
                      {item.name}
                    </Text>
                    <Text 
                      className="text-black/40 text-[12px] font-[400]"
                      style={{ fontFamily: 'Helvetica Neue' }}
                    >
                      {item.price}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => {
                      addItem(item);
                      Alert.alert('Added', `${item.name} has been added your bag.`);
                    }}
                    className="p-1 items-center justify-center w-8 h-8 rounded-full border border-black/10"
                  >
                    <Ionicons name="add" size={18} color="black" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>


        </View>
      </ScrollView>

      {/* Filter Modal */}
      <Modal
        visible={isFilterVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsFilterVisible(false)}
      >
        <Pressable 
          className="flex-1 bg-black/40" 
          onPress={() => setIsFilterVisible(false)}
        />
        <View 
          className="bg-white rounded-t-[32px] absolute bottom-0 left-0 right-0 p-8"
          style={{ paddingBottom: insets.bottom + 20 }}
        >
          <View className="flex-row justify-between items-center mb-10">
            <Text className="text-black text-xl font-medium">Filters</Text>
            <TouchableOpacity onPress={resetFilters}>
              <Text className="text-black/40 text-sm">Reset all</Text>
            </TouchableOpacity>
          </View>

          {/* Price Range */}
          <View className="mb-10">
            <Text className="text-black text-[12px] font-bold uppercase tracking-[1px] mb-6 opacity-30">Price Range</Text>
            <View className="flex-row flex-wrap">
              {priceRanges.map((range) => (
                <TouchableOpacity
                  key={range}
                  onPress={() => setSelectedPrice(range)}
                  className={`mr-3 mb-3 px-6 py-3 rounded-full border ${selectedPrice === range ? 'bg-black border-black' : 'border-[#F0F0F0]'}`}
                >
                  <Text className={`text-[12px] ${selectedPrice === range ? 'text-white font-medium' : 'text-black'}`}>
                    {range}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Size */}
          <View className="mb-12">
            <Text className="text-black text-[12px] font-bold uppercase tracking-[1px] mb-6 opacity-30">Size</Text>
            <View className="flex-row flex-wrap">
              {sizes.map((size) => (
                <TouchableOpacity
                  key={size}
                  onPress={() => setSelectedSize(size)}
                  className={`mr-3 mb-3 w-[50px] h-[50px] items-center justify-center rounded-full border ${selectedSize === size ? 'bg-black border-black' : 'border-[#F0F0F0]'}`}
                >
                  <Text className={`text-[12px] ${selectedSize === size ? 'text-white font-medium' : 'text-black'}`}>
                    {size}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity 
            activeOpacity={0.9}
            onPress={() => setIsFilterVisible(false)}
            className="w-full bg-black py-5 items-center justify-center"
          >
            <Text className="text-white text-sm font-bold uppercase tracking-[2px]">Apply Filters</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

