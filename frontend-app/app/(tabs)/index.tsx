import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { api } from '@shared/api/api';
import { useFocusEffect } from '@react-navigation/native';
import { useCartStore } from '@/store/useCartStore';
import { useNotificationStore } from '@/store/useNotificationStore';

const CATEGORIES = ["All", "Abendkleider", "Hochzeitskleider", "Add-Ons"];
const PRICE_FILTERS = [
  { id: 'any', label: 'Any', test: (_price: number) => true },
  { id: 'lt500', label: '< 500', test: (price: number) => price < 500 },
  { id: '500to1000', label: '500–1000', test: (price: number) => price >= 500 && price <= 1000 },
  { id: 'gt1000', label: '> 1000', test: (price: number) => price > 1000 },
] as const;

const DISTANCE_FILTERS = [
  { id: 'any', label: 'Any', maxKm: null as number | null },
  { id: '5', label: '< 5 km', maxKm: 5 },
  { id: '20', label: '< 20 km', maxKm: 20 },
  { id: '50', label: '< 50 km', maxKm: 50 },
] as const;

type DistanceFilterId = (typeof DISTANCE_FILTERS)[number]['id'];

type SortId = 'featured' | 'newest' | 'price_low' | 'price_high' | 'name_az';
const SORT_OPTIONS: Array<{ id: SortId; label: string }> = [
  { id: 'featured', label: 'Featured' },
  { id: 'newest', label: 'Newest' },
  { id: 'price_low', label: 'Price: Low' },
  { id: 'price_high', label: 'Price: High' },
  { id: 'name_az', label: 'Name: A–Z' },
];

type Dress = {
  id: number;
  name: string;
  price: number;
  image_url?: string | null;
  boutique_id: number;
  category?: string | null;
  categories?: string[] | null;
  created_at?: string | null;
};

type Boutique = {
  id: number;
  name: string;
  location?: string | null;
  is_visible_to_customers?: boolean;
  latitude?: number | null;
  longitude?: number | null;
};

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const unreadCount = useNotificationStore((s) => s.items.filter((n) => !n.readAt).length);
  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [dresses, setDresses] = useState<Dress[]>([]);
  const [boutiques, setBoutiques] = useState<Record<number, Boutique>>({});
  const [currentLocationLabel, setCurrentLocationLabel] = useState('Tap to use current location');
  const [locationLoading, setLocationLoading] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activePriceFilter, setActivePriceFilter] = useState<(typeof PRICE_FILTERS)[number]['id']>('any');
  const [activeLocationFilter, setActiveLocationFilter] = useState<string>('All');
  const [activeDistanceFilter, setActiveDistanceFilter] = useState<DistanceFilterId>('any');
  const [sortId, setSortId] = useState<SortId>('featured');

  const locationOptions = useMemo(() => {
    const raw = Object.values(boutiques)
      .map((b) => (b.location || '').trim())
      .filter(Boolean);
    const uniq = Array.from(new Set(raw));
    return ['All', ...uniq.slice(0, 6)];
  }, [boutiques]);

  const canUseDistanceFilter = useMemo(() => {
    if (!currentCoords) return false;
    return Object.values(boutiques).some((b) => typeof b.latitude === 'number' && typeof b.longitude === 'number');
  }, [boutiques, currentCoords]);

  const loadCatalog = useCallback(async () => {
    try {
      const [dressData, boutiqueData] = await Promise.all([
        api.get('/dresses/?visible_only=true'),
        api.get('/boutiques/'),
      ]);

      setDresses(Array.isArray(dressData) ? dressData : []);
      setBoutiques(
        Array.isArray(boutiqueData)
          ? boutiqueData.reduce((acc: Record<number, Boutique>, boutique: Boutique) => {
              acc[boutique.id] = boutique;
              return acc;
            }, {})
          : {}
      );
    } catch (error) {
      console.error('Failed to load customer catalog:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadCatalog();
    }, [loadCatalog])
  );

  const visibleDresses = useMemo(() => {
    const categoryFiltered =
      activeCategory === 'All'
        ? dresses
        : dresses.filter((dress) => {
            const raw =
              (typeof dress.category === 'string' ? dress.category : null) ??
              (Array.isArray(dress.categories) ? dress.categories.join(' ') : null) ??
              ((dress as any)?.dress_category as string | null) ??
              ((dress as any)?.type as string | null) ??
              '';
            return raw.toLowerCase().includes(activeCategory.toLowerCase());
          });
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const priceTest = PRICE_FILTERS.find((p) => p.id === activePriceFilter)?.test ?? PRICE_FILTERS[0].test;
    const activeDistance = DISTANCE_FILTERS.find((d) => d.id === activeDistanceFilter)?.maxKm ?? null;

    const haversineKm = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const R = 6371;
      const dLat = toRad(b.latitude - a.latitude);
      const dLon = toRad(b.longitude - a.longitude);
      const lat1 = toRad(a.latitude);
      const lat2 = toRad(b.latitude);
      const x =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
      return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    };

    const filtered = categoryFiltered.filter((dress) => {
      const boutique = boutiques[dress.boutique_id];

      if (activeLocationFilter !== 'All') {
        const loc = (boutique?.location || '').trim();
        if (loc !== activeLocationFilter) return false;
      }

      if (activeDistance && canUseDistanceFilter && currentCoords) {
        const lat = boutique?.latitude;
        const lon = boutique?.longitude;
        if (typeof lat !== 'number' || typeof lon !== 'number') return false;
        const km = haversineKm(currentCoords, { latitude: lat, longitude: lon });
        if (!(km <= activeDistance)) return false;
      }

      if (!priceTest(typeof dress.price === 'number' ? dress.price : Number(dress.price))) {
        return false;
      }

      if (!normalizedQuery) return true;

      const searchableText = [dress.name, boutique?.name, boutique?.location]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(normalizedQuery);
    });

    const sorted = [...filtered];
    if (sortId === 'newest') {
      sorted.sort((a, b) => {
        const da = a.created_at ? Date.parse(a.created_at) : NaN;
        const db = b.created_at ? Date.parse(b.created_at) : NaN;
        if (Number.isFinite(da) && Number.isFinite(db)) return db - da;
        return (b.id ?? 0) - (a.id ?? 0);
      });
    } else if (sortId === 'price_low') {
      sorted.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    } else if (sortId === 'price_high') {
      sorted.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    } else if (sortId === 'name_az') {
      sorted.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    }

    return sorted;
  }, [
    activeCategory,
    activeDistanceFilter,
    activeLocationFilter,
    activePriceFilter,
    boutiques,
    canUseDistanceFilter,
    currentCoords,
    dresses,
    searchQuery,
    sortId,
  ]);

  const handleFetchCurrentLocation = async () => {
    if (locationLoading) {
      return;
    }

    setLocationLoading(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location Permission', 'Please allow location access to use your current location.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setCurrentCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      let nextLabel = `${position.coords.latitude.toFixed(3)}, ${position.coords.longitude.toFixed(3)}`;

      try {
        const places = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        const firstPlace = places[0];
        if (firstPlace) {
          nextLabel = [
            firstPlace.city || firstPlace.subregion,
            firstPlace.region,
            firstPlace.country,
          ]
            .filter(Boolean)
            .join(', ');
        }
      } catch (error) {
        console.warn('Reverse geocoding unavailable, using coordinates instead.', error);
      }

      setCurrentLocationLabel(nextLabel || 'Current location loaded');
    } catch (error) {
      Alert.alert(
        'Location Error',
        error instanceof Error ? error.message : 'Could not fetch your current location.'
      );
    } finally {
      setLocationLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-white">
      {/* Fixed Header */}
      <View 
        className="pt-4 pb-2 px-6 border-b border-[#F0F0F0]" 
        style={{ paddingTop: insets.top + 10 }}
      >
        <View className="flex-row justify-center items-center relative mb-4">
          <Text 
            className="text-black"
            style={{ 
              fontFamily: 'Helvetica Neue',
              fontWeight: '400',
              fontSize: 16,
              lineHeight: 16,
              letterSpacing: 0
            }}
          >
            Dress Live
          </Text>

          <TouchableOpacity
            onPress={() => router.push({ pathname: '/notifications' } as any)}
            className="absolute right-0"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View className="relative">
              <Ionicons name="notifications-outline" size={20} color="#1A1A1A" />
              {unreadCount > 0 ? (
                <View
                  className="absolute -top-1 -right-2 bg-black rounded-full min-w-[16px] h-[16px] items-center justify-center px-1"
                >
                  <Text className="text-white text-[9px] font-bold">
                    {unreadCount > 9 ? '9+' : String(unreadCount)}
                  </Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        </View>

        <View className="pt-2 mt-2">
          <View className="flex-row items-center rounded-full border border-[#E7E7E7] bg-[#FAFAFA] px-4 py-3">
            <Ionicons name="search-outline" size={18} color="#8C8C8C" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search dresses, boutiques, locations"
              placeholderTextColor="#A0A0A0"
              className="flex-1 ml-3 text-[#1A1A1A]"
              style={{
                fontFamily: 'Helvetica Neue',
                fontWeight: '300',
                fontSize: 14,
                lineHeight: 18,
                paddingVertical: 0,
              }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchQuery ? (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color="#8C8C8C" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        
      </View>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleFetchCurrentLocation}
        className="flex-row items-center justify-center mt-4 mb-2 px-6"
      >
          <Ionicons name="location-outline" size={16} color="#1A1A1A" />
          {locationLoading ? (
            <ActivityIndicator color="#1A1A1A" size="small" style={{ marginLeft: 8 }} />
          ) : (
            <Text
              className="text-[#1A1A1A] text-xs font-light ml-2 tracking-[0.5px]"
              numberOfLines={1}
            >
              {currentLocationLabel}
            </Text>
          )}
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Categories Tab Bar */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          className="px-6 py-6 border-b border-[#F0F0F0]"
          contentContainerStyle={{ paddingRight: 40 }}
        >
          {CATEGORIES.map((cat) => (
            <TouchableOpacity 
              key={cat} 
              onPress={() => setActiveCategory(cat)}
              className="mr-10 items-center"
            >
              <Text 
                className={activeCategory === cat ? 'text-[#1A1A1A]' : 'text-[#1A1A1A50]'}
                style={{ 
                  fontFamily: 'Helvetica Neue',
                  fontWeight: '400',
                  fontSize: 14,
                  lineHeight: 14,
                  letterSpacing: 2
                }}
              >
                {cat}
              </Text>

              {activeCategory === cat && <View className="w-1 h-1 rounded-full bg-black mt-1" />}
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Filters + Sorting (premium browsing) */}
        <View className="px-6 pt-5">
          {canUseDistanceFilter ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 24 }}>
              {DISTANCE_FILTERS.map((f) => {
                const active = activeDistanceFilter === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    activeOpacity={0.85}
                    onPress={() => setActiveDistanceFilter(f.id)}
                    className={`mr-3 px-4 py-2 border ${active ? 'bg-black border-black' : 'border-[#D9D9D9]'}`}
                  >
                    <Text className={`text-[11px] ${active ? 'text-white' : 'text-black/70'}`}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 24 }}>
            {PRICE_FILTERS.map((f) => {
              const active = activePriceFilter === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  activeOpacity={0.85}
                  onPress={() => setActivePriceFilter(f.id)}
                  className={`mr-3 px-4 py-2 border ${active ? 'bg-black border-black' : 'border-[#D9D9D9]'}`}
                >
                  <Text className={`text-[11px] ${active ? 'text-white' : 'text-black/70'}`}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerStyle={{ paddingRight: 24 }}>
            {locationOptions.map((loc) => {
              const active = activeLocationFilter === loc;
              return (
                <TouchableOpacity
                  key={loc}
                  activeOpacity={0.85}
                  onPress={() => setActiveLocationFilter(loc)}
                  className={`mr-3 px-4 py-2 border ${active ? 'bg-black border-black' : 'border-[#D9D9D9]'}`}
                >
                  <Text className={`text-[11px] ${active ? 'text-white' : 'text-black/70'}`} numberOfLines={1}>
                    {loc}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerStyle={{ paddingRight: 24 }}>
            {SORT_OPTIONS.map((opt) => {
              const active = sortId === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  activeOpacity={0.85}
                  onPress={() => setSortId(opt.id)}
                  className={`mr-3 px-4 py-2 border ${active ? 'bg-black border-black' : 'border-[#D9D9D9]'}`}
                >
                  <Text className={`text-[11px] ${active ? 'text-white' : 'text-black/70'}`}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Product Feed */}
        <View className="px-6 py-6">
          {loading ? (
            <View className="py-20 items-center justify-center">
              <ActivityIndicator color="#1A1A1A" />
            </View>
          ) : visibleDresses.length === 0 ? (
            <View className="py-20 items-center justify-center">
              <Text className="text-[#1A1A1A] text-[14px] font-medium mb-2">No visible dresses yet</Text>
              <Text className="text-[#1A1A1A]/40 text-[12px] text-center leading-5 px-8">
                Partner-uploaded dresses will appear here once a boutique enables customer visibility.
              </Text>
            </View>
          ) : (
            visibleDresses.map((dress) => {
              const boutique = boutiques[dress.boutique_id];

              return (
                <View key={dress.id} className="mb-10">
                  <TouchableOpacity
                    activeOpacity={0.9}
                    className="mb-4"
                    onPress={() =>
                      router.push({
                        pathname: '/(tabs)/product-details',
                        params: { id: String(dress.id) },
                      })
                    }
                  >
                    <Image
                      source={
                        dress.image_url
                          ? { uri: dress.image_url }
                          : require('@/assets/images/Dashboard image 1.png')
                      }
                      style={{ width: '100%', height: 200 }}
                      contentFit="cover"
                    />
                  </TouchableOpacity>

                  <View className="flex-row justify-between items-start">
                    <TouchableOpacity
                      onPress={() =>
                        router.push({
                          pathname: '/(tabs)/product-details',
                          params: { id: String(dress.id) },
                        })
                      }
                      className="flex-1"
                    >
                      <Text
                        className="text-[#1A1A1A] text-[14px] mb-1"
                        style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
                      >
                        {dress.name}
                      </Text>
                      <Text
                        className="text-[#1A1A1A]/40 text-[13px] mb-1"
                        style={{ fontFamily: 'Helvetica Neue', fontWeight: '400' }}
                      >
                        {boutique?.name || 'Boutique Partner'}
                      </Text>
                      <Text
                        className="text-[#1A1A1A]/35 text-[12px]"
                        style={{ fontFamily: 'Helvetica Neue', fontWeight: '400' }}
                      >
                        {boutique?.location || 'Location unavailable'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="p-1"
                    onPress={() =>
                      addItem({
                        id: String(dress.id),
                        name: dress.name,
                        price:
                          typeof dress.price === 'number'
                            ? `${dress.price.toFixed(0)} EUR`
                            : `${dress.price} EUR`,
                        imageUrl: dress.image_url ?? null,
                        selected: true,
                      })
                    }
                    >
                      <Ionicons
                        name="add"
                        size={20}
                        color="#1A1A1A"
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>

      </ScrollView>
    </View>
  );
}
