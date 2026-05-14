import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, useWindowDimensions } from 'react-native';
import { FadeInView } from '@/components/ui/fade-in-view';
import { useFloatingHeart } from '@/components/ui/floating-heart';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCartStore } from '@/store/useCartStore';
import { useShortlistStore } from '@/store/useShortlistStore';
import { useAuthStore } from '@shared/store/useAuthStore';
import { api } from '@shared/api/api';

const PLUS_ICON = require('@/assets/svg/plus.svg');
const STAR_ICON = require('@/assets/svg/Star.svg');
const CATEGORIES = ['All', 'Abendkleider', 'Hochzeitskleider', 'Add-Ons'];

function formatPriceWithSpaces(price: number): string {
  return Math.round(price).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatBoutiqueStateCountry(location?: string | null): string {
  const parts = (location || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) return (location || '').trim() || 'Location unavailable';

  const country = parts[parts.length - 1];
  const region = [...parts.slice(0, -1)]
    .reverse()
    .map((part) => part.replace(/^\d{4,6}\s*/, '').trim())
    .find((part) => part && !/^\d+$/.test(part));

  return region ? `${region}, ${country}` : country;
}

type Boutique = {
  id: number;
  name?: string | null;
  location?: string | null;
  header_image_url?: string | null;
};

type Dress = {
  id: number;
  name: string;
  price: number;
  image_url?: string | null;
  boutique_id: number;
  category?: string | null;
  categories?: string[] | null;
};

export default function BoutiqueDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  // Floating heart animation — fires when adding to wishlist from a card.
  // Wishlist is the middle (3rd of 5) bottom-tab, so targetX = 0 (centered)
  // and targetY flies down to just above the safe-area inset.
  const { overlay: heartOverlay, trigger: triggerHeartAnim } = useFloatingHeart({
    targetX: 0,
    targetY: height / 2 - (insets.bottom + 28),
  });
  const addItem = useCartStore((state) => state.addItem);
  const isAuthenticated = useAuthStore((state: { isAuthenticated: boolean }) => state.isAuthenticated);
  const guestDressIds = useShortlistStore((s) => s.dressIds);
  const toggleGuestShortlist = useShortlistStore((s) => s.toggle);

  const params = useLocalSearchParams<{ boutiqueId?: string; coverImageUrl?: string }>();
  const boutiqueId = params.boutiqueId ? Number(params.boutiqueId) : NaN;
  const coverFromHome = typeof params.coverImageUrl === 'string' ? params.coverImageUrl : null;

  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [boutique, setBoutique] = useState<Boutique | null>(null);
  const [dresses, setDresses] = useState<Dress[]>([]);
  const [authShortlistIds, setAuthShortlistIds] = useState<number[]>([]);
  const [shortlistBusyId, setShortlistBusyId] = useState<number | null>(null);
  const [heroImageIndex, setHeroImageIndex] = useState(0);

  const loadAuthShortlist = useCallback(async () => {
    if (!isAuthenticated) {
      setAuthShortlistIds([]);
      return;
    }
    try {
      const data = await api.get('/shortlists/me');
      const ids = Array.isArray(data)
        ? (data as { dress_id: number }[]).map((i) => Number(i.dress_id))
        : [];
      setAuthShortlistIds(ids.filter((n) => Number.isFinite(n)));
    } catch {
      setAuthShortlistIds([]);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void loadAuthShortlist();
  }, [loadAuthShortlist, boutiqueId]);

  useFocusEffect(
    useCallback(() => {
      void loadAuthShortlist();
    }, [loadAuthShortlist])
  );

  const isDressShortlisted = (dressId: number) =>
    isAuthenticated ? authShortlistIds.includes(dressId) : guestDressIds.includes(dressId);

  const handleToggleShortlist = async (dress: Dress) => {
    if (!isAuthenticated) {
      const wasOn = guestDressIds.includes(dress.id);
      const r = toggleGuestShortlist(dress.id);
      if (!r.ok) {
        Alert.alert('Wishlist', 'You can select a maximum of 4 dresses.');
        return;
      }
      if (!wasOn) triggerHeartAnim();
      return;
    }
    const on = authShortlistIds.includes(dress.id);
    // Client-side gate matching the backend's 4-dress cap so we don't
    // fire the heart animation and immediately get a 400 alert.
    if (!on && authShortlistIds.length >= 4) {
      Alert.alert('Wishlist', 'You can save up to 4 dresses. Remove one first to add this.');
      return;
    }
    if (!on) triggerHeartAnim();
    setShortlistBusyId(dress.id);
    try {
      if (on) {
        await api.delete(`/shortlists/me/${dress.id}`);
        setAuthShortlistIds((prev) => prev.filter((id) => id !== dress.id));
      } else {
        await api.post('/shortlists/me', { dress_id: dress.id });
        setAuthShortlistIds((prev) => (prev.includes(dress.id) ? prev : [...prev, dress.id]));
      }
    } catch (error) {
      Alert.alert('Wishlist', error instanceof Error ? error.message : 'Could not update wishlist.');
    } finally {
      setShortlistBusyId(null);
    }
  };

  useEffect(() => {
    if (!Number.isFinite(boutiqueId)) {
      setBoutique(null);
      setDresses([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setBoutique(null);
    setDresses([]);

    let alive = true;
    (async () => {
      try {
        const [b, ds] = await Promise.all([
          api.get(`/boutiques/${boutiqueId}`),
          api.get(`/dresses/?boutique_id=${boutiqueId}&limit=200`),
        ]);
        if (!alive) return;
        setBoutique(b as Boutique);
        setDresses(Array.isArray(ds) ? (ds as Dress[]) : []);
      } catch {
        if (alive) {
          setBoutique(null);
          setDresses([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [boutiqueId]);

  const headerImageUrl = useMemo(() => {
    const fromBoutique = (boutique?.header_image_url || '').trim();
    if (fromBoutique) return fromBoutique;
    if (coverFromHome && coverFromHome.trim()) return coverFromHome.trim();
    const firstDress = dresses.find((d) => !!d.image_url)?.image_url || '';
    return firstDress.trim() || null;
  }, [boutique, coverFromHome, dresses]);

  const heroImages = useMemo(() => {
    const items: Array<{ key: string; source: any }> = [];

    if (headerImageUrl) {
      items.push({ key: 'hero-header', source: { uri: headerImageUrl } });
    } else {
      items.push({ key: 'hero-fallback', source: require('@/assets/images/Dashboard image 1.png') });
    }

    // Add a few product images so the hero carousel can actually scroll.
    // This is especially helpful for Elysian Bridal Boutique, which has multiple products.
    const seen = new Set<string>();
    if (headerImageUrl) seen.add(headerImageUrl.trim());

    const extraUrls = dresses
      .map((d) => (typeof d.image_url === 'string' ? d.image_url.trim() : ''))
      .filter(Boolean)
      .filter((url) => {
        if (seen.has(url)) return false;
        seen.add(url);
        return true;
      })
      .slice(0, 5);

    extraUrls.forEach((url, idx) => {
      items.push({ key: `hero-dress-${idx}`, source: { uri: url } });
    });

    return items;
  }, [headerImageUrl, dresses]);

  const filteredDresses = useMemo(() => {
    if (activeCategory === 'All') return dresses;
    const needle = activeCategory.toLowerCase();
    return dresses.filter((dress) => {
      const raw =
        (typeof dress.category === 'string' ? dress.category : null) ??
        (Array.isArray(dress.categories) ? dress.categories.join(' ') : null) ??
        '';
      return raw.toLowerCase().includes(needle);
    });
  }, [activeCategory, dresses]);

  const heroImageHeight = useMemo(() => {
    const referenceHeight = (width * 300) / 428;
    return Math.max(235, Math.min(referenceHeight, 350));
  }, [width]);

  const dressCardWidth = useMemo(() => Math.max((width - 55) / 2, 145), [width]);
  const dressImageHeight = dressCardWidth;

  const isStale = Number.isFinite(boutiqueId) && boutique != null && boutique.id !== boutiqueId;
  if (loading || isStale) {
    return (
      <View className="flex-1 bg-white items-center justify-center" style={{ paddingTop: insets.top }}>
        <ActivityIndicator color="#1A1A1A" />
        <Text className="text-[#1A1A1A]/50 text-[12px] mt-4" style={{ fontFamily: 'Helvetica Neue' }}>
          Loading boutique...
        </Text>
      </View>
    );
  }

  if (!boutique) {
    return (
      <View className="flex-1 bg-white" style={{ paddingTop: insets.top }}>
        <View className="px-5 pt-3">
          <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-start justify-center">
            <Ionicons name="arrow-back" size={20} color="black" />
          </TouchableOpacity>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-[#1A1A1A] text-[14px] font-medium mb-2">Boutique unavailable</Text>
          <Text className="text-[#1A1A1A]/45 text-[12px] text-center leading-5">
            We could not load this boutique right now. Please try again.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      {heartOverlay}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Header Image */}
        <View className="w-full" style={{ height: heroImageHeight }}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => {
              const nextIndex = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));
              setHeroImageIndex(nextIndex);
            }}
            scrollEventThrottle={16}
          >
            {heroImages.map((image) => (
              <Image
                key={image.key}
                source={image.source}
                style={{ width, height: heroImageHeight }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={180}
                recyclingKey={image.key}
              />
            ))}
          </ScrollView>
          <TouchableOpacity
            onPress={() => router.back()}
            className="absolute left-5 w-10 h-10 items-center justify-center rounded-full"
            style={{ top: insets.top + 12, backgroundColor: 'rgba(255,255,255,0.86)' }}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-back" size={20} color="black" />
          </TouchableOpacity>
          <View className="absolute left-0 right-0 bottom-0 h-[3px] bg-white/90">
            <View
              className="absolute left-0 top-0 bottom-0 bg-black"
              style={{
                width: `${100 / Math.max(heroImages.length, 1)}%`,
                transform: [{ translateX: heroImageIndex * (width / Math.max(heroImages.length, 1)) }],
              }}
            />
          </View>
        </View>

        <View className="px-5 pt-2 pb-6">
          {/* Boutique Info */}
          <View className="flex-row justify-between items-start mb-1 mt-2">
            <View className="flex-1 pr-4">
              <Text
                className="mb-2"
                style={{
                  color: '#000000',
                  fontFamily: 'Helvetica Neue',
                  fontWeight: '600',
                  fontSize: 24,
                  lineHeight: 24,
                  letterSpacing: 0,
                }}
                numberOfLines={1}
              >
                {(boutique?.name || '').trim() || 'Boutique'}
              </Text>
              <Text
                className="mt-1"
                style={{
                  color: '#6E6E6E',
                  fontFamily: 'Helvetica Neue',
                  fontWeight: '400',
                  fontSize: 12,
                  lineHeight: 12,
                  letterSpacing: 0,
                }}
                numberOfLines={1}
              >
                {formatBoutiqueStateCountry(boutique?.location)}
              </Text>
            </View>
            <View className="items-end pt-1 mt-1">
              <View className="flex-row items-center">
                <Text className="text-[#F2C94C] text-[10px] font-bold mr-1">4.6</Text>
                <Image source={STAR_ICON} style={{ width: 15, height: 14 }} contentFit="contain" />
              </View>
              <Text className="text-[#1A1A1A]/50 text-[10px] mt-3">EN | DE | FR</Text>
            </View>
          </View>

          <View className="items-end mb-5 mt-5">
            <Text
              style={{
                color: '#004CC4',
                fontFamily: 'Helvetica Neue',
                fontWeight: '400',
                fontSize: 14,
                lineHeight: 14,
                letterSpacing: 0,
              }}
            >
              Filters
            </Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-4"
            style={{
              marginLeft: width < 400 ? 4 : 0,
              marginRight: width < 400 ? 4 : 0,
            }}
            contentContainerStyle={{
              flexGrow: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: width < 400 ? 'flex-start' : 'space-between',
              paddingTop: 10,
              paddingBottom: 14,
              paddingLeft: 0,
              paddingRight: 0,
            }}
          >
            {CATEGORIES.map((cat, idx) => (
              <TouchableOpacity
                key={cat}
                onPress={() => setActiveCategory(cat)}
                activeOpacity={0.85}
                style={{
                  paddingLeft: idx === 0 ? 0 : width < 400 ? 10 : 14,
                  paddingRight: idx === CATEGORIES.length - 1 ? 0 : width < 400 ? 6 : 12,
                  paddingVertical: 6,
                  marginRight: idx === CATEGORIES.length - 1 ? 0 : width < 400 ? 6 : width < 380 ? 10 : 16,
                }}
              >
                <Text
                  numberOfLines={1}
                  className={activeCategory === cat ? 'text-[#1A1A1A]' : 'text-[#6E6E6E]'}
                  style={{
                    fontFamily: 'Helvetica Neue',
                    fontWeight: '400',
                    fontSize: 14,
                    lineHeight: 14,
                    letterSpacing: 0,
                  }}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {filteredDresses.length === 0 ? (
            <FadeInView className="py-16 items-center justify-center">
              <Text className="text-[#1A1A1A] text-[14px] font-medium mb-2">No dresses available</Text>
              <Text className="text-[#1A1A1A]/40 text-[12px] text-center leading-5 px-8">
                This boutique has no matching dresses in this category.
              </Text>
            </FadeInView>
          ) : (
            <View className="flex-row flex-wrap justify-between">
              {filteredDresses.map((dress, idx) => {
                const priceLabel =
                  typeof dress.price === 'number' ? `${formatPriceWithSpaces(dress.price)} €` : `${dress.price} €`;
                const imageSource = dress.image_url
                  ? { uri: dress.image_url }
                  : require('@/assets/images/Dashboard image 3.png');

                return (
                  <FadeInView key={dress.id} delay={Math.min(idx * 40, 240)} style={{ width: dressCardWidth, minHeight: 231, marginBottom: 20 }}>
                    <View className="relative mb-3">
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() =>
                          router.push({
                            pathname: '/(tabs)/product-details',
                            params: {
                              id: String(dress.id),
                              boutiqueId: String(boutiqueId),
                              coverImageUrl: headerImageUrl ?? undefined,
                            },
                          })
                        }
                      >
                        <Image
                          source={imageSource}
                          style={{ width: '100%', height: dressImageHeight }}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          transition={150}
                          recyclingKey={String(dress.id)}
                        />
                      </TouchableOpacity>
                    </View>

                    <View className="flex-row justify-between items-start">
                      <TouchableOpacity
                        onPress={() =>
                          router.push({
                            pathname: '/(tabs)/product-details',
                            params: {
                              id: String(dress.id),
                              boutiqueId: String(boutiqueId),
                              coverImageUrl: headerImageUrl ?? undefined,
                            },
                          })
                        }
                        className="flex-1"
                      >
                        <Text
                          className="text-black mb-3"
                          style={{
                            fontFamily: 'Helvetica Neue',
                            fontWeight: '500',
                            fontSize: 14,
                            lineHeight: 18,
                            letterSpacing: 0,
                          }}
                          numberOfLines={1}
                        >
                          {dress.name}
                        </Text>
                        <Text
                          className="text-[#6E6E6E]"
                          style={{
                            fontFamily: 'Helvetica Neue',
                            fontWeight: '400',
                            fontSize: 12,
                            lineHeight: 12,
                            letterSpacing: 0,
                          }}
                        >
                          {priceLabel}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          addItem({
                            id: String(dress.id),
                            name: dress.name,
                            price: priceLabel,
                            imageUrl: dress.image_url ?? null,
                            boutiqueId,
                            selected: true,
                          });
                          Alert.alert('Added', `${dress.name} has been added to your bag.`);
                        }}
                        className="items-center justify-center"
                        style={{ width: 24, height: 18 }}
                      >
                        <Image source={PLUS_ICON} style={{ width: 10, height: 10 }} contentFit="contain" />
                      </TouchableOpacity>
                    </View>
                  </FadeInView>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
