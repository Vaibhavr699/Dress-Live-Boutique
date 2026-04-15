import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCartStore } from '@/store/useCartStore';
import { api } from '@shared/api/api';
import { useAuthStore } from '@shared/store/useAuthStore';
import { useShortlistStore } from '@/store/useShortlistStore';

export default function ProductDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const guestDressIds = useShortlistStore((state) => state.dressIds);
  const toggleGuest = useShortlistStore((state) => state.toggle);
  const [optionModalVisible, setOptionModalVisible] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [dress, setDress] = useState<any>(null);
  const [isShortlisted, setIsShortlisted] = useState(false);
  const [shortlistLoading, setShortlistLoading] = useState(false);

  const { addItem } = useCartStore();

  useEffect(() => {
    if (!id) {
      setDress(null);
      setIsShortlisted(false);
      setLoading(false);
      return;
    }

    let isActive = true;
    setLoading(true);
    setDress(null);
    setIsShortlisted(false);

    const loadDress = async () => {
      try {
        const dressData = await api.get(`/dresses/${id}`);

        if (!isActive) {
          return;
        }

        setDress(dressData);
        if (isAuthenticated) {
          const shortlistData = await api.get('/shortlists/me');
          if (!isActive) return;
          setIsShortlisted(
            Array.isArray(shortlistData)
              ? shortlistData.some((item: { dress_id: number }) => item.dress_id === Number(id))
              : false
          );
        } else {
          setIsShortlisted(guestDressIds.includes(Number(id)));
        }
      } catch (error) {
        if (isActive) {
          console.error('Failed to load dress details:', error);
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    loadDress();

    return () => {
      isActive = false;
    };
  }, [guestDressIds, id, isAuthenticated]);

  const product = useMemo(() => {
    const normalizedPrice =
      typeof dress?.price === 'number' ? `${dress.price.toFixed(0)} EUR` : '$1800';

    return {
      id: String(dress?.id ?? 'p-1'),
      name: dress?.name ?? 'Elegant Satin A-Line',
      price: normalizedPrice,
      imageUrl: dress?.image_url ?? null,
      selected: true,
    };
  }, [dress]);

  const productInfo = [
    { label: 'Dress Price:', value: product.price },
    { label: 'Dress Colors:', value: dress?.colors || 'Not specified' },
    { label: 'Available Sizes:', value: dress?.sizes || 'Not specified' },
    { label: 'Dress Status:', value: dress?.is_ai_enabled === false ? 'Preview Only' : 'Available' },
  ];


  const handleToggleWishlist = async () => {
    if (!dress?.id) {
      return;
    }

    if (!isAuthenticated) {
      const result = toggleGuest(Number(dress.id));
      if (!result.ok) {
        Alert.alert('Selection', 'You can select a maximum of 4 dresses.');
        return;
      }
      setIsShortlisted((prev) => !prev);
      return;
    }

    setShortlistLoading(true);
    try {
      if (isShortlisted) {
        await api.delete(`/shortlists/me/${dress.id}`);
        setIsShortlisted(false);
      } else {
        await api.post('/shortlists/me', { dress_id: dress.id });
        setIsShortlisted(true);
      }
    } catch (error) {
      Alert.alert('Selection', error instanceof Error ? error.message : 'Could not update selection.');
    } finally {
      setShortlistLoading(false);
    }
  };

  const handleAddToCart = () => {
    addItem(product);
    Alert.alert(
      'Added to Carts',
      'The item has been added your bag.',
      [{ text: 'OK' }]
    );
  };

  return (
    <View className="flex-1 bg-white">
      {loading ? (
        <View className="flex-1 items-center justify-center bg-white">
          <ActivityIndicator color="#1A1A1A" />
        </View>
      ) : (
        <>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Header Image Section */}
        <View className="relative w-full aspect-[1/1.1]">
          <Image 
            key={product.id}
            source={product.imageUrl ? { uri: product.imageUrl } : require('@/assets/images/Dashboard image 3.png')} 
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
          />
          
          {/* Top Buttons */}
          <View 
            className="absolute left-6 right-6 flex-row justify-between"
            style={{ top: insets.top + 10 }}
          >
            <TouchableOpacity 
              onPress={() => router.back()}
              className="w-10 h-10 items-center justify-center bg-white/20 rounded-full"
            >
              <Ionicons name="arrow-back" size={24} color="black" />
            </TouchableOpacity>
            
            <View className="flex-row gap-4">
              <TouchableOpacity 
                onPress={() => router.push('/(tabs)/cart')}
                className="w-10 h-10 items-center justify-center bg-white/20 rounded-full"
              >
                <Feather name="shopping-cart" size={20} color="black" />
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={handleToggleWishlist}
                disabled={shortlistLoading}
                className="w-10 h-10 items-center justify-center bg-white/20 rounded-full"
              >
                <Ionicons 
                  name={isShortlisted ? "heart" : "heart-outline"} 
                  size={22} 
                  color={isShortlisted ? "#FF3B30" : "black"} 
                />
              </TouchableOpacity>
            </View>

          </View>

          {/* AI Try On Button Overlay */}
          <View className="absolute bottom-6 right-6">
            <TouchableOpacity 
              onPress={() => router.push('/(tabs)/ai-try-on')}
              className="bg-white/80 px-4 py-2 rounded-lg flex-row items-center border border-black/10"
              activeOpacity={0.8}
            >

              <Image 
                source={require('@/assets/svg/AI try on logo.svg')}
                style={{ width: 16, height: 16, marginRight: 4 }}
                contentFit="contain"
              />
              <Text className="text-black text-xs font-medium uppercase tracking-[0.5px]">AI Try On</Text>

            </TouchableOpacity>
          </View>
        </View>

        {/* Product Info Section */}
        <View className="px-8 pt-8">
          <View className="flex-row justify-between items-start mb-1">
            <Text 
              className="text-black text-2xl font-medium"
              style={{ fontFamily: 'Helvetica Neue' }}
            >
              {product.name}
            </Text>
            <View className="flex-row items-center">
              <Text className="text-black text-xs font-medium mr-1">4.8</Text>
              <Ionicons name="star" size={14} color="#FFD700" />
            </View>
          </View>
          
          <View className="flex-row justify-between items-center mb-10">
            <View>
              <Text 
                className="text-black/40 text-[12px] font-light mb-1"
                style={{ fontFamily: 'Helvetica Neue' }}
              >
                {dress?.description || 'Partner catalog dress'}
              </Text>
              <Text 
                className="text-black/40 text-[10px] font-light uppercase tracking-[0.5px]"
                style={{ fontFamily: 'Helvetica Neue' }}
              >
                {dress?.colors || 'Visible in customer catalog'}
              </Text>
            </View>
          </View>

          {/* Details Grid */}
          <View className="flex-row flex-wrap justify-between">
            {productInfo.map((info, idx) => (
              <View key={idx} style={{ width: '48%', marginBottom: 30 }}>
                <Text className="text-black text-[12px] font-bold mb-1">{info.label}</Text>
                <Text className="text-black/50 text-[12px] font-light">{info.value}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Footer Buttons */}
      <View 
        className="absolute bottom-0 left-0 right-0 bg-white px-8 pt-4 border-t border-[#F5F5F5] flex-row justify-between items-center"
        style={{ paddingBottom: insets.bottom + 10 }}
      >
        <TouchableOpacity 
          onPress={() => setOptionModalVisible(true)}
          activeOpacity={0.8}
          className="flex-1 mr-4 border border-black py-4 items-center flex-row justify-center"
        >
          <Ionicons name="calendar-outline" size={18} color="black" style={{ marginRight: 8 }} />
          <Text className="text-black text-[12px] font-bold tracking-[2px] uppercase">Booking</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          activeOpacity={0.9}
          onPress={handleAddToCart}
          className="flex-1 bg-black py-4 items-center flex-row justify-center"
        >
          <Ionicons name="cart-outline" size={18} color="white" style={{ marginRight: 8 }} />
          <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">Add to Cart</Text>
        </TouchableOpacity>

      </View>

      {/* Booking Option Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={optionModalVisible}
        onRequestClose={() => setOptionModalVisible(false)}
      >
        <Pressable 
          className="flex-1 bg-black/40 items-center justify-center px-8"
          onPress={() => setOptionModalVisible(false)}
        >
          <Pressable className="bg-white w-full p-8 items-center rounded-sm">
            <Text className="text-[#1A1A1A] text-sm text-center mb-10 font-[300]">
              Choose the option that suits you best.
            </Text>
            
            <TouchableOpacity 
              activeOpacity={0.7}
              onPress={() => {
                setOptionModalVisible(false);
                router.push({
                  pathname: '/(tabs)/booking-calendar',
                  params: {
                    appointmentType: 'in_store',
                    dressId: String(product.id),
                  },
                });
              }}
              className="w-full border border-[#E0E0E0] py-4 items-center mb-4"
            >
              <Text className="text-[#1A1A1A] text-[12px] font-medium tracking-[1.5px] uppercase">In Store Visit</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              activeOpacity={0.7}
              onPress={() => {
                setOptionModalVisible(false);
                router.push({
                  pathname: '/(tabs)/booking-calendar',
                  params: {
                    appointmentType: 'video',
                    dressId: String(product.id),
                  },
                });
              }}
              className="w-full border border-[#E0E0E0] py-4 items-center"
            >
              <Text className="text-[#1A1A1A] text-[12px] font-medium tracking-[1.5px] uppercase">Video Call</Text>
            </TouchableOpacity>


          </Pressable>
        </Pressable>
      </Modal>
        </>
      )}
    </View>
  );
}
