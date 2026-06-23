import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, StyleSheet, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList, ListRenderItemInfo } from '@shopify/flash-list';
import { api } from '@shared/api/api';
import { useAuthStore } from '@shared/store/useAuthStore';
import { useShortlistStore } from '@/store/useShortlistStore';
import { FadeInView } from '@/components/ui/fade-in-view';

const WISHLIST_EMPTY_SVG = require('@/assets/svg/wishlist-heart 1.svg');
const PLUS_ICON = require('@/assets/svg/plus.svg');

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

const HEADER_TITLE_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '400' as const,
  fontSize: 14,
  lineHeight: 14,
  letterSpacing: 2,
  color: '#000000',
  textTransform: 'uppercase' as const,
};

const ITEM_NAME_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '500' as const,
  fontSize: 14,
  lineHeight: 18,
  letterSpacing: 0,
  color: '#000000',
};

const ITEM_PRICE_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '300' as const,
  fontSize: 12,
  lineHeight: 14,
  letterSpacing: 0,
  color: 'rgba(0,0,0,0.4)',
};

export default function WishlistScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((s: any) => s.isAuthenticated);
  const guestDressIds = useShortlistStore((s: any) => s.dressIds);
  const removeGuest = useShortlistStore((state) => state.remove);
  const [wishlistItems, setWishlistItems] = useState<Dress[]>([]);
  const [loading, setLoading] = useState(true);
  // Per-item "removing" lock so the heart icon can show a disabled state
  // and we drop double-taps that would race the optimistic removal.
  const [removingIds, setRemovingIds] = useState<Set<number>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

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
        resolvedDressIds.map(async (dressId: number) => {
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
    if (removingIds.has(dressId)) return;
    if (!isAuthenticated) {
      removeGuest(dressId);
      setWishlistItems((prev) => prev.filter((item) => item.id !== dressId));
      return;
    }
    setRemovingIds((prev) => {
      const next = new Set(prev);
      next.add(dressId);
      return next;
    });
    try {
      await api.delete(`/shortlists/me/${dressId}`);
      setWishlistItems((prev) => prev.filter((item) => item.id !== dressId));
    } catch (error) {
      Alert.alert('Wishlist', error instanceof Error ? error.message : 'Could not remove this dress.');
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(dressId);
        return next;
      });
    }
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadWishlist();
    } finally {
      setRefreshing(false);
    }
  }, [loadWishlist]);

  const isEmpty = wishlistItems.length === 0;

  return (
    <View className="flex-1 bg-white">
      {/* Header — centered, uppercase, count inline (e.g. WISHLIST 3) */}
      <View
        className="px-6 items-center border-b border-[#F0F0F0] pb-4"
        style={{ paddingTop: insets.top + 10 }}
      >
        <Text style={HEADER_TITLE_STYLE}>
          {!loading ? `Wishlist ${wishlistItems.length}` : 'Wishlist'}
        </Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#1A1A1A" />
        </View>
      ) : isEmpty ? (
        <FadeInView className="flex-1 items-center justify-center px-10">
          <View className="mb-8 items-center justify-center">
            <Image
              source={WISHLIST_EMPTY_SVG}
              style={{ width: 68, height: 68 }}
              contentFit="contain"
            />
          </View>
          <Text className="mb-2 px-2" style={EMPTY_STATE_HEADING_STYLE}>
            You do not have any wishlist items
          </Text>
          <Text className="px-6" style={EMPTY_STATE_SUBHEADING_STYLE}>
            Save your favorites and share them with anyone you like
          </Text>
          
          <TouchableOpacity 
            onPress={() => router.push('/')}
            className="mt-10 border-b border-black pb-1"
          >
            <Text className="text-black text-xs font-bold uppercase tracking-[1px]">Shop Now</Text>
          </TouchableOpacity>
        </FadeInView>
      ) : (
        <FlashList<Dress>
          data={wishlistItems}
          keyExtractor={(item) => String(item.id)}
          estimatedItemSize={148}
          contentContainerStyle={{ paddingTop: 28, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#1A1A1A"
              colors={['#1A1A1A']}
            />
          }
          renderItem={({ item, index }: ListRenderItemInfo<Dress>) => {
            const imageSource = item.image_url
              ? { uri: item.image_url }
              : require('@/assets/images/Dashboard image 1.png');
            const priceLabel =
              typeof item.price === 'number' ? `${item.price.toFixed(0)} EUR` : 'Price on request';

            return (
              <FadeInView delay={Math.min(index * 50, 300)} className="flex-row items-start px-6 mb-10">
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/product-details',
                      params: { id: String(item.id) },
                    })
                  }
                >
                  <Image
                    source={imageSource}
                    style={{ width: 100, height: 100, borderRadius: 0 }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={150}
                    recyclingKey={String(item.id)}
                  />
                </TouchableOpacity>

                <View className="flex-1 ml-5" style={{ minHeight: 100 }}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() =>
                      router.push({
                        pathname: '/(tabs)/product-details',
                        params: { id: String(item.id) },
                      })
                    }
                  >
                    <Text style={ITEM_NAME_STYLE} numberOfLines={2}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                  <Text style={[ITEM_PRICE_STYLE, { marginTop: 6 }]}>{priceLabel}</Text>

                  <View
                    style={{
                      height: StyleSheet.hairlineWidth,
                      backgroundColor: '#F0F0F0',
                      marginTop: 18,
                      marginBottom: 0,
                      alignSelf: 'stretch',
                    }}
                  />

                  <View
                    className="flex-row items-center justify-between"
                    style={{ marginTop: 14 }}
                  >
                    <TouchableOpacity
                      activeOpacity={0.7}
                      hitSlop={{ top: 14, bottom: 14, left: 8, right: 28 }}
                      onPress={() =>
                        router.push({
                          pathname: '/(tabs)/booking-calendar',
                          params: {
                            dressId: String(item.id),
                            appointmentType: 'video',
                          },
                        })
                      }
                      style={{
                        justifyContent: 'center',
                        alignItems: 'flex-start',
                        minHeight: 36,
                        paddingVertical: 8,
                      }}
                    >
                      <Image source={PLUS_ICON} style={{ width: 10, height: 10 }} contentFit="contain" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      hitSlop={{ top: 14, bottom: 14, left: 28, right: 8 }}
                      onPress={() => removeFromWishlist(item.id)}
                      disabled={removingIds.has(item.id)}
                      style={{
                        justifyContent: 'center',
                        alignItems: 'center',
                        minHeight: 36,
                        paddingVertical: 8,
                        opacity: removingIds.has(item.id) ? 0.4 : 1,
                      }}
                    >
                      {removingIds.has(item.id) ? (
                        <ActivityIndicator color="#1A1A1A" size="small" />
                      ) : (
                        <Ionicons name="heart" size={17} color="#000000" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </FadeInView>
            );
          }}
        />
      )}
    </View>
  );
}

