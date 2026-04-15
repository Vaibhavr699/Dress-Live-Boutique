import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '@shared/api/api';
import { useAuthStore } from '@shared/store/useAuthStore';
import { useShortlistStore } from '@/store/useShortlistStore';

type ShortlistItem = {
  id: number;
  dress_id: number;
};

type Dress = {
  id: number;
  name: string;
  price: number;
  image_url?: string | null;
  boutique_id: number;
};

export default function WishlistScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const guestDressIds = useShortlistStore((state) => state.dressIds);
  const removeGuest = useShortlistStore((state) => state.remove);
  const [wishlistItems, setWishlistItems] = useState<Dress[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWishlist = useCallback(async () => {
    try {
      const shortlistDressIds = isAuthenticated
        ? (() => {
            // backend shortlist
            return api
              .get('/shortlists/me')
              .then((shortlistItems) => {
                const normalizedShortlist = Array.isArray(shortlistItems) ? (shortlistItems as ShortlistItem[]) : [];
                return normalizedShortlist.map((item) => item.dress_id);
              });
          })()
        : Promise.resolve(guestDressIds);

      const resolvedDressIds = await shortlistDressIds;
      if (resolvedDressIds.length === 0) {
        setWishlistItems([]);
        return;
      }

      const dresses = await Promise.all(
        resolvedDressIds.map(async (dressId) => {
          try {
            return await api.get(`/dresses/${dressId}`);
          } catch (error) {
            console.error(`Failed to load shortlisted dress ${dressId}:`, error);
            return null;
          }
        })
      );

      setWishlistItems(dresses.filter(Boolean) as Dress[]);
    } catch (error) {
      console.error('Failed to load wishlist:', error);
      Alert.alert('Wishlist', error instanceof Error ? error.message : 'Could not load wishlist.');
    } finally {
      setLoading(false);
    }
  }, [guestDressIds, isAuthenticated]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadWishlist();
    }, [loadWishlist])
  );

  const removeFromWishlist = async (dressId: number) => {
    if (!isAuthenticated) {
      removeGuest(dressId);
      setWishlistItems((prev) => prev.filter((item) => item.id !== dressId));
      return;
    }
    try {
      await api.delete(`/shortlists/me/${dressId}`);
      setWishlistItems((prev) => prev.filter((item) => item.id !== dressId));
    } catch (error) {
      Alert.alert('Wishlist', error instanceof Error ? error.message : 'Could not remove this dress.');
    }
  };

  const isEmpty = wishlistItems.length === 0;

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View 
        className="px-6 items-center border-b border-[#F0F0F0] pb-4" 
        style={{ paddingTop: insets.top + 10 }}
      >
        <Text className="text-black text-sm font-bold uppercase tracking-[2px]">
          Wishlist {wishlistItems.length}
        </Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#1A1A1A" />
        </View>
      ) : isEmpty ? (
        <View className="flex-1 items-center justify-center px-10">
          <View className="mb-8 opacity-20">
            <MaterialCommunityIcons name="cards-heart-outline" size={64} color="black" />
          </View>
          <Text className="text-black text-sm font-medium uppercase tracking-[2px] mb-2 text-center">
            You do not have any wishlist items
          </Text>
          <Text className="text-black/40 text-[10px] text-center font-light leading-4 px-6">
            Save your favorites and share them with anyone you like
          </Text>
          
          <TouchableOpacity 
            onPress={() => router.push('/')}
            className="mt-10 border-b border-black pb-1"
          >
            <Text className="text-black text-xs font-bold uppercase tracking-[1px]">Shop Now</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView 
          showsVerticalScrollIndicator={false} 
          className="flex-1"
          contentContainerStyle={{ paddingTop: 24, paddingBottom: 100 }}
        >
          {wishlistItems.map((item) => (
            <View key={item.id} className="flex-row items-start px-8 mb-8">
              {/* Product Image */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/product-details',
                    params: { id: String(item.id) },
                  })
                }
              >
                <Image 
                source={
                  item.image_url
                    ? { uri: item.image_url }
                    : require('@/assets/images/Dashboard image 1.png')
                } 
                style={{ width: 80, height: 100, borderRadius: 2 }}
                contentFit="cover"
                />
              </TouchableOpacity>
              
              {/* Info & Actions */}
              <View className="flex-1 ml-6">
                <View className="flex-row justify-between items-start mb-1">
                  <Text className="text-black text-[12px] font-medium">{item.name}</Text>
                </View>
                <Text className="text-black/40 text-[10px] font-light mb-auto">
                  {typeof item.price === 'number' ? `${item.price.toFixed(0)} EUR` : 'Price on request'}
                </Text>
                
                {/* Divider Line */}
                <View className="h-[1px] bg-[#F0F0F0] w-full mb-3 mt-6" />
                
                {/* Bottom Icons */}
                <View className="flex-row justify-between items-center pr-2">
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() =>
                      router.push({
                        pathname: '/(tabs)/booking-calendar',
                        params: {
                          dressId: String(item.id),
                          appointmentType: 'video',
                        },
                      })
                    }
                  >
                    <Ionicons name="add" size={20} color="black" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeFromWishlist(item.id)}>
                    <Ionicons name="heart" size={18} color="black" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

