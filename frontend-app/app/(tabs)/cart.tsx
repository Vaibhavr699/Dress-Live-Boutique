import React, { useCallback, useMemo, useState } from 'react';
import { Alert, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCartStore } from '@/store/useCartStore';
import { useShortlistStore } from '@/store/useShortlistStore';
import { useAuthStore } from '@shared/store/useAuthStore';
import { api } from '@shared/api/api';

const BASKET_EMPTY_SVG = require('@/assets/svg/basket.svg');
const HEART_OUTLINE_ICON = require('@/assets/svg/Heart.svg');

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
  const toggleSelected = useCartStore((state) => state.toggleSelected);
  const selectOnly = useCartStore((state) => state.selectOnly);
  const addGuestShortlist = useShortlistStore((state) => state.add);
  const [wishlistedIds, setWishlistedIds] = useState<number[]>([]);

  const toggleSelect = (id: string) => {
    const item = cartItems.find((i) => i.id === id);
    if (!item) return;

    if (!item.selected) {
      const nextBoutiqueId = item.boutiqueId ?? null;
      if (nextBoutiqueId != null) {
        const selectedOther = cartItems.filter((i) => i.selected && i.id !== id);
        const conflicting = selectedOther.some((i) => (i.boutiqueId ?? null) != null && (i.boutiqueId ?? null) !== nextBoutiqueId);

        if (conflicting) {
          Alert.alert(
            'Cart selection',
            'Please select dresses from the same boutique.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Select this only',
                onPress: () => selectOnly(id),
              },
            ]
          );
          return;
        }
      }
    }

    toggleSelected(id);
  };

  const selectedCount = useMemo(
    () => cartItems.filter((item) => item.selected).reduce((total, item) => total + item.quantity, 0),
    [cartItems]
  );
  const isEmpty = cartItems.length === 0;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      if (!isAuthenticated) {
        setWishlistedIds(useShortlistStore.getState().dressIds);
        return;
      }

      (async () => {
        try {
          const data = await api.get('/shortlists/me');
          if (cancelled) return;
          const ids = Array.isArray(data)
            ? data.map((item: { dress_id: number }) => Number(item.dress_id)).filter(Number.isFinite)
            : [];
          setWishlistedIds(ids);
        } catch {
          if (!cancelled) setWishlistedIds([]);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [isAuthenticated])
  );

  const handleAddToWishlist = async (itemId: string) => {
    const dressId = Number(itemId);
    if (!Number.isFinite(dressId)) return;
    if (wishlistedIds.includes(dressId)) return;

    setWishlistedIds((prev) => (prev.includes(dressId) ? prev : [...prev, dressId]));

    if (!isAuthenticated) {
      const result = addGuestShortlist(dressId);
      if (!result.ok) {
        setWishlistedIds((prev) => prev.filter((id) => id !== dressId));
        Alert.alert('Wishlist', 'You can select a maximum of 4 dresses.');
      }
      return;
    }

    try {
      await api.post('/shortlists/me', { dress_id: dressId });
    } catch (error) {
      setWishlistedIds((prev) => prev.filter((id) => id !== dressId));
      Alert.alert('Wishlist', error instanceof Error ? error.message : 'Could not add this dress to your wishlist.');
    }
  };

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View 
        className="px-6 items-center border-b border-[#F0F0F0] pb-4" 
        style={{ paddingTop: insets.top + 10 }}
      >
        <Text className="text-black text-[14px] font-[400] uppercase tracking-[2px]">
          Shoping Cart {cartItems.reduce((total, item) => total + item.quantity, 0)}
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
              <View key={item.id} className="flex-row items-start px-5 mb-6" style={{ height: 110 }}>
                {/* Checkbox */}
                <TouchableOpacity 
                  onPress={() => toggleSelect(item.id)}
                  className="w-4 h-4 border border-[#1A1A1A]/40 items-center justify-center mr-5"
                  style={{ marginTop: 48 }}
                >
                  {item.selected && <View className="w-2 h-2 bg-black" />}
                </TouchableOpacity>

                {/* Product Info Row */}
                <Image 
                  source={item.imageUrl ? { uri: item.imageUrl } : require('@/assets/images/Dashboard image 3.png')} 
                  style={{ width: 110, height: 110 }}
                  contentFit="cover"
                />
                <View className="ml-6 flex-1" style={{ height: 110, position: 'relative' }}>
                  <View>
                    <Text className="text-black text-sm font-medium mb-2">{item.name}</Text>
                    <Text className="text-black/50 text-[12px] font-light">{item.price}</Text>
                  </View>

                  <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
                    <View className="h-[1px] bg-[#E5E5E5] w-full" />
                    <View className="flex-row justify-between items-start">
                      <TouchableOpacity onPress={() => removeItem(item.id)}>
                        <Text
                          className="text-black/50 uppercase"
                          style={{
                            fontFamily: 'Helvetica Neue',
                            fontWeight: '300',
                            fontSize: 12,
                            lineHeight: 24,
                            letterSpacing: 0.48,
                          }}
                        >
                          Remove
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        className="w-6 h-6 items-end justify-center"
                        onPress={() => handleAddToWishlist(item.id)}
                        activeOpacity={0.7}
                      >
                        {wishlistedIds.includes(Number(item.id)) ? (
                          <Ionicons name="heart" size={17} color="#000000" />
                        ) : (
                          <Image source={HEART_OUTLINE_ICON} style={{ width: 14, height: 13 }} contentFit="contain" />
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Footer Footer */}
          <View 
            className="absolute bottom-0 left-0 right-0 bg-white px-8 pt-4 pb-8"
            style={{ paddingBottom: 30 }}
          >
            <TouchableOpacity 
              activeOpacity={0.9}
              disabled={selectedCount === 0}
              onPress={() => {
                if (!isAuthenticated) {
                  router.push('/signup');
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


