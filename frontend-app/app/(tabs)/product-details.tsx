import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Pressable, ActivityIndicator, Alert, GestureResponderEvent, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCartStore } from '@/store/useCartStore';
import { api } from '@shared/api/api';
import { useAuthStore } from '@shared/store/useAuthStore';
import { useShortlistStore } from '@/store/useShortlistStore';

const STAR_ICON = require('@/assets/svg/Star.svg');
const BOOKING_SMALL_ICON = require('@/assets/svg/booking_small.svg');
const CART_SMALL_ICON = require('@/assets/svg/cart small.svg');
const CART_BLACK_ICON = require('@/assets/svg/Cart Black.svg');
const HEART_ICON = require('@/assets/svg/Heart.svg');

export default function ProductDetailsScreen() {
  const router = useRouter();
  const { id, boutiqueId, coverImageUrl } = useLocalSearchParams<{
    id?: string;
    boutiqueId?: string;
    coverImageUrl?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isAuthenticated = useAuthStore((state: any) => state.isAuthenticated);
  const toggleGuest = useShortlistStore((state: any) => state.toggle);
  const [optionModalVisible, setOptionModalVisible] = useState(false);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [dress, setDress] = useState<any>(null);
  const [isShortlisted, setIsShortlisted] = useState(false);
  const [shortlistLoading, setShortlistLoading] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [productImageIndex, setProductImageIndex] = useState(0);
  const [viewerZoom, setViewerZoom] = useState(1);
  const [viewerOffset, setViewerOffset] = useState({ x: 0, y: 0 });
  const pinchStateRef = useRef<{ initialDistance: number; initialZoom: number } | null>(null);
  const panStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const lastTapAtRef = useRef(0);

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
          setIsShortlisted(useShortlistStore.getState().dressIds.includes(Number(id)));
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
  }, [id, isAuthenticated]);

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

  const headerImageUrl = useMemo(() => {
    const img = (dress?.image_url || '').trim();
    return img || null;
  }, [dress?.image_url]);

  const galleryImages = useMemo(
    () => [
      {
        key: 'primary',
        source: headerImageUrl ? { uri: headerImageUrl } : require('@/assets/images/Dashboard image 3.png'),
      },
    ],
    [headerImageUrl]
  );

  const productInfo = [
    { label: 'Dress Price:', value: product.price },
    { label: 'Dress Colors:', value: dress?.colors || 'Not specified' },
    { label: 'Available Sizes:', value: dress?.sizes || 'Not specified' },
    { label: 'Dress Status:', value: dress?.is_ai_enabled === false ? 'Preview Only' : 'Available' },
  ];

  const productImageWidth = width;
  const productImageHeight = (productImageWidth * 347) / 430;


  const handleToggleWishlist = async () => {
    if (!dress?.id) {
      return;
    }

    if (!isAuthenticated) {
      const wasShortlisted = isShortlisted;
      const result = toggleGuest(Number(dress.id));
      if (!result.ok) {
        Alert.alert('Selection', 'You can select a maximum of 4 dresses.');
        return;
      }
      setIsShortlisted(!wasShortlisted);
      return;
    }

    const wasShortlisted = isShortlisted;
    setIsShortlisted(!wasShortlisted);
    setShortlistLoading(true);
    try {
      if (wasShortlisted) {
        await api.delete(`/shortlists/me/${dress.id}`);
      } else {
        await api.post('/shortlists/me', { dress_id: dress.id });
      }
    } catch (error) {
      setIsShortlisted(wasShortlisted);
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

  const handleBack = () => {
    if (boutiqueId) {
      router.replace({
        pathname: '/(tabs)/boutique-details',
        params: {
          boutiqueId,
          coverImageUrl: typeof coverImageUrl === 'string' ? coverImageUrl : undefined,
        },
      });
      return;
    }

    router.back();
  };

  const openImageViewer = (index = 0) => {
    setViewerIndex(index);
    setViewerZoom(1);
    setImageViewerVisible(true);
  };

  const closeImageViewer = () => {
    setImageViewerVisible(false);
    setViewerZoom(1);
    setViewerOffset({ x: 0, y: 0 });
    setViewerIndex(0);
  };

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const getTouchDistance = (touches: readonly { pageX: number; pageY: number }[]) => {
    if (touches.length < 2) return 0;
    const [first, second] = touches;
    const dx = second.pageX - first.pageX;
    const dy = second.pageY - first.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const resetViewerTransform = () => {
    setViewerZoom(1);
    setViewerOffset({ x: 0, y: 0 });
    pinchStateRef.current = null;
    panStateRef.current = null;
  };

  const handleViewerTouchStart = (event: GestureResponderEvent) => {
    const touches = event.nativeEvent.touches;

    if (touches.length === 2) {
      pinchStateRef.current = {
        initialDistance: getTouchDistance(touches),
        initialZoom: viewerZoom,
      };
      panStateRef.current = null;
      return;
    }

    if (touches.length !== 1) return;

    const now = Date.now();
    if (now - lastTapAtRef.current < 260) {
      if (viewerZoom > 1.05) {
        resetViewerTransform();
      } else {
        setViewerZoom(2);
        setViewerOffset({ x: 0, y: 0 });
      }
      lastTapAtRef.current = 0;
      return;
    }

    lastTapAtRef.current = now;

    if (viewerZoom > 1.05) {
      panStateRef.current = {
        startX: touches[0].pageX,
        startY: touches[0].pageY,
        originX: viewerOffset.x,
        originY: viewerOffset.y,
      };
    }
  };

  const handleViewerTouchMove = (event: GestureResponderEvent) => {
    const touches = event.nativeEvent.touches;

    if (touches.length === 2 && pinchStateRef.current) {
      const distance = getTouchDistance(touches);
      const baseDistance = pinchStateRef.current.initialDistance || distance || 1;
      const nextZoom = clamp((distance / baseDistance) * pinchStateRef.current.initialZoom, 1, 3);
      setViewerZoom(nextZoom);
      if (nextZoom <= 1.05) {
        setViewerOffset({ x: 0, y: 0 });
      }
      return;
    }

    if (touches.length === 1 && viewerZoom > 1.05 && panStateRef.current) {
      const dx = touches[0].pageX - panStateRef.current.startX;
      const dy = touches[0].pageY - panStateRef.current.startY;
      const maxOffset = (viewerZoom - 1) * 140;
      setViewerOffset({
        x: clamp(panStateRef.current.originX + dx, -maxOffset, maxOffset),
        y: clamp(panStateRef.current.originY + dy, -maxOffset, maxOffset),
      });
    }
  };

  const handleViewerTouchEnd = () => {
    pinchStateRef.current = null;
    panStateRef.current = null;
    if (viewerZoom <= 1.05) {
      setViewerZoom(1);
      setViewerOffset({ x: 0, y: 0 });
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white" style={{ paddingTop: insets.top }}>
        <ActivityIndicator color="#1A1A1A" />
        <Text className="text-[#1A1A1A]/50 text-[12px] mt-4" style={{ fontFamily: 'Helvetica Neue' }}>
          Loading dress...
        </Text>
      </View>
    );
  }

  if (!dress) {
    return (
      <View className="flex-1 bg-white" style={{ paddingTop: insets.top }}>
        <View className="px-6 pt-3">
          <TouchableOpacity onPress={handleBack} className="w-10 h-10 items-start justify-center">
            <Ionicons name="arrow-back" size={22} color="black" />
          </TouchableOpacity>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-[#1A1A1A] text-[14px] font-medium mb-2">Dress unavailable</Text>
          <Text className="text-[#1A1A1A]/45 text-[12px] text-center leading-5">
            We could not load this dress right now. Please try again.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View
          className="flex-row items-center justify-between px-5"
          style={{ paddingTop: insets.top + 12, paddingBottom: 10 }}
        >
          <TouchableOpacity
            onPress={handleBack}
            className="w-8 h-8 items-start justify-center"
          >
            <Ionicons name="arrow-back" size={22} color="black" />
          </TouchableOpacity>

          <View className="flex-row items-center gap-5">
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/cart')}
              className="w-8 h-8 items-center justify-center"
            >
              <Image source={CART_BLACK_ICON} style={{ width: 16, height: 15 }} contentFit="contain" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleToggleWishlist}
              disabled={shortlistLoading}
              className="w-8 h-8 items-center justify-center"
            >
              {isShortlisted ? (
                <Ionicons name="heart" size={18} color="#FF3B30" />
              ) : (
                <Image source={HEART_ICON} style={{ width: 14, height: 13 }} contentFit="contain" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Header Image Section */}
        <View className="relative w-full" style={{ height: productImageHeight }}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => {
              const nextIndex = Math.round(event.nativeEvent.contentOffset.x / Math.max(productImageWidth, 1));
              setProductImageIndex(nextIndex);
            }}
            scrollEventThrottle={16}
          >
            {galleryImages.map((image, index) => (
              <TouchableOpacity key={image.key} activeOpacity={0.92} onPress={() => openImageViewer(index)}>
                <Image
                  source={image.source}
                  style={{ width: productImageWidth, height: productImageHeight }}
                  contentFit="cover"
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View className="absolute left-3 right-3 bottom-2 h-[3px] bg-white/90">
            <View
              className="absolute left-0 top-0 bottom-0 bg-black"
              style={{
                width: `${100 / Math.max(galleryImages.length, 4)}%`,
                transform: [{ translateX: (productImageIndex * (productImageWidth - 24)) / Math.max(galleryImages.length, 4) }],
              }}
            />
          </View>

          {/* AI Try On Button Overlay */}
          {dress?.is_ai_enabled === false ? null : (
            <View className="absolute bottom-4 right-5">
              <TouchableOpacity 
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/ai-try-on',
                    params: {
                      dressId: String(product.id),
                      source: 'product-details',
                    },
                  })
                }
                className="bg-white/80 flex-row items-center justify-center border border-black/10"
                style={{ width: 72, height: 25 }}
                activeOpacity={0.8}
              >
                <Image 
                  source={require('@/assets/svg/AI try on logo.svg')}
                  style={{ width: 12, height: 12, marginRight: 3 }}
                  contentFit="contain"
                />
                <Text className="text-black text-[10px] font-medium tracking-[0.2px]">AI Try On</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Product Info Section */}
        <View className="px-5 py-6">
          <View className="flex-row justify-between items-start mb-1">
            <Text 
              className="text-black flex-1 pr-4"
              style={{
                fontFamily: 'Helvetica Neue',
                fontWeight: '500',
                fontSize: 24,
                lineHeight: 24,
                letterSpacing: 0,
              }}
              numberOfLines={1}
            >
              {product.name}
            </Text>
            <View className="items-end pt-1">
              <View className="flex-row items-center">
                <Text className="text-[#F2C94C] text-xs font-medium mr-1">4.8</Text>
                <Image source={STAR_ICON} style={{ width: 15, height: 14 }} contentFit="contain" />
              </View>
              <Text className="text-[#1A1A1A]/50 text-[10px] mt-3">EN | DE | FR</Text>
            </View>
          </View>
          
          <View className="flex-row justify-between items-center mb-10">
            <View>
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
                <Text
                  className="text-black mb-1"
                  style={{
                    fontFamily: 'Helvetica Neue',
                    fontWeight: '500',
                    fontSize: 14,
                    lineHeight: 14,
                    letterSpacing: 0,
                  }}
                >
                  {info.label}
                </Text>
                <Text
                  className="text-black/50"
                  style={{
                    fontFamily: 'Helvetica Neue',
                    fontWeight: '300',
                    fontSize: 12,
                    lineHeight: 12,
                    letterSpacing: 0,
                  }}
                >
                  {info.value}
                </Text>
              </View>
            ))}
          </View>

          <View className="mt-2">
            <Text
              className="text-black mb-4"
              style={{
                fontFamily: 'Helvetica Neue',
                fontWeight: '500',
                fontSize: 14,
                lineHeight: 14,
                letterSpacing: 0,
              }}
            >
              Dress Description:
            </Text>
            <Text
              className="text-black/40"
              style={{
                fontFamily: 'Helvetica Neue',
                fontWeight: '300',
                fontSize: 12,
                lineHeight: 20,
                letterSpacing: 0,
              }}
            >
              {dress?.description || 'No description available for this dress.'}
            </Text>
          </View>

        </View>
      </ScrollView>

      {/* Footer Buttons */}
      <View 
        className="absolute bottom-0 left-0 right-0 bg-white px-8 pt-4 flex-row justify-between items-center"
        style={{ paddingBottom: insets.bottom + 10 }}
      >
        <TouchableOpacity 
          onPress={() => setOptionModalVisible(true)}
          activeOpacity={0.8}
          className="flex-1 mr-4 border border-black items-center flex-row justify-center"
          style={{ height: 48 }}
        >
          <Image source={BOOKING_SMALL_ICON} style={{ width: 21, height: 21, marginRight: 8 }} contentFit="contain" />
          <Text className="text-black text-[12px] font-bold tracking-[2px] uppercase">Booking</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          activeOpacity={0.9}
          onPress={handleAddToCart}
          className="flex-1 bg-black items-center flex-row justify-center"
          style={{ height: 48 }}
        >
          <Image source={CART_SMALL_ICON} style={{ width: 18, height: 18, marginRight: 8 }} contentFit="contain" />
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
          className="flex-1 items-center justify-center px-8"
          style={{ backgroundColor: 'rgba(255,255,255,0.72)' }}
          onPress={() => setOptionModalVisible(false)}
        >
          <Pressable className="bg-white w-full p-8 items-center rounded-sm border border-black">
            <Text
              className="text-[#1A1A1A] text-left mb-10"
              style={{
                fontFamily: 'Helvetica Neue',
                fontWeight: '400',
                fontSize: 12,
                lineHeight: 18,
                letterSpacing: 0.48,
                alignSelf: 'stretch',
              }}
            >
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
              className="w-full border border-black py-4 items-center mb-4"
            >
              <Text
                className="text-[#1A1A1A] uppercase"
                style={{
                  fontFamily: 'Helvetica Neue',
                  fontWeight: '300',
                  fontSize: 14,
                  lineHeight: 14,
                  letterSpacing: 0.56,
                }}
              >
                In Store Visit
              </Text>
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
              className="w-full border border-black py-4 items-center"
            >
              <Text
                className="text-[#1A1A1A] uppercase"
                style={{
                  fontFamily: 'Helvetica Neue',
                  fontWeight: '300',
                  fontSize: 14,
                  lineHeight: 14,
                  letterSpacing: 0.56,
                }}
              >
                Video Call
              </Text>
            </TouchableOpacity>


          </Pressable>
        </Pressable>
      </Modal>

      {/* Full-screen image viewer */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={imageViewerVisible}
        onRequestClose={closeImageViewer}
      >
        <View className="flex-1 bg-black">
          <View
            className="absolute left-0 right-0 z-20 flex-row items-center justify-between px-6"
            style={{ top: insets.top + 12 }}
          >
            <View className="bg-white/15 px-3 py-2 rounded-full">
              <Text className="text-white text-[12px]" style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}>
                {viewerIndex + 1} / {galleryImages.length}
              </Text>
            </View>
            <TouchableOpacity
              onPress={closeImageViewer}
              activeOpacity={0.8}
              className="w-10 h-10 rounded-full bg-white/15 items-center justify-center"
            >
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>

          <View className="flex-1 items-center justify-center px-4">
            <View
              className="w-full items-center justify-center"
              onTouchStart={handleViewerTouchStart}
              onTouchMove={handleViewerTouchMove}
              onTouchEnd={handleViewerTouchEnd}
              onTouchCancel={handleViewerTouchEnd}
            >
              <Image
                source={galleryImages[viewerIndex]?.source}
                style={{
                  width: '100%',
                  height: '78%',
                  transform: [
                    { translateX: viewerOffset.x },
                    { translateY: viewerOffset.y },
                    { scale: viewerZoom },
                  ],
                }}
                contentFit="contain"
              />
            </View>
          </View>

          <View className="absolute bottom-0 left-0 right-0 px-6" style={{ paddingBottom: insets.bottom + 24 }}>
            <View className="items-center mb-4">
              <Text className="text-white/80 text-[11px]" style={{ fontFamily: 'Helvetica Neue', fontWeight: '400' }}>
                Pinch or double-tap to zoom. Drag to move the image.
              </Text>
            </View>
            <View className="items-center">
              <Text className="text-white text-[12px]" style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}>
                {`${viewerZoom.toFixed(1)}x`}
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
