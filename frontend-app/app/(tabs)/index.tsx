import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
  Dimensions,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { api } from '@shared/api/api';
import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { FlashList, ListRenderItemInfo } from '@shopify/flash-list';
import { FadeInView } from '@/components/ui/fade-in-view';

const MARKER_ICON = require('@/assets/svg/marker.svg');
const PLUS_ICON = require('@/assets/svg/plus.svg');
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
  sizes?: string | null;
  colors?: string | null;
  is_ai_enabled?: boolean | null;
  created_at?: string | null;
};

type Boutique = {
  id: number;
  name: string;
  location?: string | null;
  is_visible_to_customers?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  header_image_url?: string | null;
};

type BoutiqueCard = {
  boutiqueId: number;
  boutiqueName: string;
  boutiqueLocation: string;
  coverImageUrl: string | null;
  matchingDressCount: number;
};

function formatBoutiqueCardLocation(location?: string | null): string {
  const raw = (location || '').trim();
  if (!raw) return 'Location unavailable';

  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const country = parts[parts.length - 1];
    const cityCandidate = [...parts.slice(0, -1)]
      .reverse()
      .find((part) => !/\d/.test(part));

    if (cityCandidate) {
      return `${cityCandidate}, ${country}`;
    }

    return `${parts[parts.length - 2]}, ${country}`;
  }

  return raw;
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const screenWidth = Dimensions.get('window').width;
  const showHomeFilters = false;
  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [dresses, setDresses] = useState<Dress[]>([]);
  const [boutiques, setBoutiques] = useState<Record<number, Boutique>>({});
  const [currentLocationLabel, setCurrentLocationLabel] = useState('Current Location');
  const [locationLoading, setLocationLoading] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Debounced copy of the query used for the (expensive) filtering. Typing only
  // updates `searchQuery` (cheap → keeps the TextInput in sync); the heavy
  // re-filter/re-render runs after a short pause. Without this, filtering on
  // every keystroke desynced the controlled input and duplicated characters.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => clearTimeout(t);
  }, [searchQuery]);
  const [activePriceFilter, setActivePriceFilter] = useState<(typeof PRICE_FILTERS)[number]['id']>('any');
  const [activeLocationFilter, setActiveLocationFilter] = useState<string>('All');
  const [activeDistanceFilter, setActiveDistanceFilter] = useState<DistanceFilterId>('any');
  const [sortId, setSortId] = useState<SortId>('featured');
  const [activeSizeFilter, setActiveSizeFilter] = useState<string>('Any');
  const [activeColorFilter, setActiveColorFilter] = useState<string>('Any');
  const [activeAiOnly, setActiveAiOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersAnchor, setFiltersAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const filtersButtonRef = useRef<View | null>(null);

  const [draftPriceFilter, setDraftPriceFilter] = useState<(typeof PRICE_FILTERS)[number]['id']>('any');
  const [draftLocationFilter, setDraftLocationFilter] = useState<string>('All');
  const [draftDistanceFilter, setDraftDistanceFilter] = useState<DistanceFilterId>('any');
  const [draftSortId, setDraftSortId] = useState<SortId>('featured');
  const [draftSizeFilter, setDraftSizeFilter] = useState<string>('Any');
  const [draftColorFilter, setDraftColorFilter] = useState<string>('Any');
  const [draftAiOnly, setDraftAiOnly] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'android') {
      // Enable LayoutAnimation on Android.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (UIManager as any).setLayoutAnimationEnabledExperimental?.(true);
    }
  }, []);

  const locationOptions = useMemo(() => {
    const raw = Object.values(boutiques)
      .map((b) => (b.location || '').trim())
      .filter(Boolean);
    const uniq = Array.from(new Set(raw));
    return ['All', ...uniq.slice(0, 6)];
  }, [boutiques]);

  const sizeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const d of dresses) {
      const raw = (d.sizes || '').trim();
      if (!raw) continue;
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => set.add(s));
    }
    const list = Array.from(set);
    list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    return ['Any', ...list.slice(0, 12)];
  }, [dresses]);

  const colorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const d of dresses) {
      const raw = (d.colors || '').trim();
      if (!raw) continue;
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => set.add(s));
    }
    const list = Array.from(set);
    list.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return ['Any', ...list.slice(0, 12)];
  }, [dresses]);

  const canUseDistanceFilter = useMemo(() => {
    if (!currentCoords) return false;
    return Object.values(boutiques).some((b) => typeof b.latitude === 'number' && typeof b.longitude === 'number');
  }, [boutiques, currentCoords]);

  // Stamp the last successful catalog refresh so the focus-effect below
  // can skip duplicate fetches when the buyer bounces between tabs.
  const lastCatalogFetchRef = useRef<number>(0);

  const loadCatalog = useCallback(async () => {
    try {
      const [dressData, boutiqueData] = await Promise.all([
        api.get('/dresses/?visible_only=true'),
        api.get('/boutiques/'),
      ]);

      const dressList = Array.isArray(dressData) ? (dressData as Dress[]) : [];
      const boutiqueList = Array.isArray(boutiqueData) ? (boutiqueData as Boutique[]) : [];

      setDresses(dressList);
      setBoutiques(
        boutiqueList.reduce((acc: Record<number, Boutique>, boutique: Boutique) => {
          acc[boutique.id] = boutique;
          return acc;
        }, {})
      );
      lastCatalogFetchRef.current = Date.now();

      // Warm the image cache for the first few boutique covers so they render
      // instantly when the user starts scrolling.
      const coverUrls = boutiqueList
        .map((b) => (b.header_image_url || '').trim())
        .filter((url): url is string => url.length > 0)
        .slice(0, 5);
      const dressFallbackUrls = dressList
        .map((d) => (d.image_url || '').trim())
        .filter((url): url is string => url.length > 0)
        .slice(0, 5);
      const toPrefetch = Array.from(new Set([...coverUrls, ...dressFallbackUrls])).slice(0, 6);
      if (toPrefetch.length > 0) {
        Image.prefetch(toPrefetch, 'memory-disk').catch(() => {
          // Prefetch is best-effort; ignore failures.
        });
      }
    } catch (error) {
      console.error('Failed to load customer catalog:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Skip the catalog refetch if we loaded within the last 60s — bouncing
  // between tabs used to fire a fresh /dresses + /boutiques pair each time.
  // Pull-to-refresh below always bypasses this gate.
  const CATALOG_STALE_MS = 60_000;
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastCatalogFetchRef.current < CATALOG_STALE_MS) return;
      setLoading(true);
      loadCatalog();
    }, [loadCatalog])
  );

  // Manual pull-to-refresh — bypasses the staleness gate.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadCatalog();
    } finally {
      setRefreshing(false);
    }
  }, [loadCatalog]);

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
    const normalizedQuery = debouncedQuery.trim().toLowerCase();
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

      if (activeAiOnly) {
        if (dress.is_ai_enabled === false) return false;
      }

      if (activeSizeFilter !== 'Any') {
        const sizes = (dress.sizes || '').split(',').map((s) => s.trim()).filter(Boolean);
        if (!sizes.includes(activeSizeFilter)) return false;
      }

      if (activeColorFilter !== 'Any') {
        const colors = (dress.colors || '').split(',').map((s) => s.trim()).filter(Boolean);
        const hit = colors.some((c) => c.toLowerCase() === activeColorFilter.toLowerCase());
        if (!hit) return false;
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
    activeAiOnly,
    activeSizeFilter,
    activeColorFilter,
    boutiques,
    canUseDistanceFilter,
    currentCoords,
    dresses,
    debouncedQuery,
    sortId,
  ]);

  const boutiqueCards = useMemo(() => {
    const grouped = new Map<number, { cover: string | null; count: number }>();
    for (const d of visibleDresses) {
      const id = d.boutique_id;
      if (!id) continue;
      const prev = grouped.get(id);
      const nextCover = prev?.cover || d.image_url || null;
      grouped.set(id, { cover: nextCover, count: (prev?.count || 0) + 1 });
    }

    const cards: BoutiqueCard[] = [];
    for (const [boutiqueId, meta] of grouped.entries()) {
      const b = boutiques[boutiqueId];
      if (!b) continue;
      const cover = (b.header_image_url || '').trim() || meta.cover || null;
      cards.push({
        boutiqueId,
        boutiqueName: (b.name || '').trim() || 'Boutique',
        boutiqueLocation: formatBoutiqueCardLocation(b.location),
        coverImageUrl: cover,
        matchingDressCount: meta.count,
      });
    }

    cards.sort((a, b) => a.boutiqueName.localeCompare(b.boutiqueName));
    return cards;
  }, [boutiques, visibleDresses]);

  const openFilters = () => {
    setDraftPriceFilter(activePriceFilter);
    setDraftLocationFilter(activeLocationFilter);
    setDraftDistanceFilter(activeDistanceFilter);
    setDraftSortId(sortId);
    setDraftSizeFilter(activeSizeFilter);
    setDraftColorFilter(activeColorFilter);
    setDraftAiOnly(activeAiOnly);

    const node = filtersButtonRef.current;
    // Anchor the popover next to the filter icon.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = node ? (node as any) : null;
    if (handle?.measureInWindow) {
      handle.measureInWindow((x: number, y: number, w: number, h: number) => {
        setFiltersAnchor({ x, y, w, h });
        setFiltersOpen(true);
      });
    } else {
      setFiltersAnchor(null);
      setFiltersOpen(true);
    }
  };

  const closeFilters = () => setFiltersOpen(false);

  const applyFilters = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActivePriceFilter(draftPriceFilter);
    setActiveLocationFilter(draftLocationFilter);
    setActiveDistanceFilter(draftDistanceFilter);
    setSortId(draftSortId);
    setActiveSizeFilter(draftSizeFilter);
    setActiveColorFilter(draftColorFilter);
    setActiveAiOnly(draftAiOnly);
    setFiltersOpen(false);
  };

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

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          if (currentCoords) return;
          const perm = await Location.getForegroundPermissionsAsync();
          if (perm.status !== 'granted') return;
          const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (cancelled) return;
          setCurrentCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });

          let nextLabel = `${position.coords.latitude.toFixed(3)}, ${position.coords.longitude.toFixed(3)}`;
          try {
            const places = await Location.reverseGeocodeAsync({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
            const firstPlace = places[0];
            if (firstPlace) {
              nextLabel = [firstPlace.city || firstPlace.subregion, firstPlace.region, firstPlace.country]
                .filter(Boolean)
                .join(', ');
            }
          } catch {
            // ignore
          }
          if (!cancelled) setCurrentLocationLabel(nextLabel || 'Current location loaded');
        } catch {
          // ignore
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [currentCoords])
  );

  return (
    <View className="flex-1 bg-white">
      {/* Fixed Header */}
      <View 
        className="px-5" 
        style={{ paddingTop: insets.top + 8, paddingBottom: 6 }}
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

          {/* Notification bell intentionally hidden — push notifications are the
              single source of truth; no in-app inbox surface for buyers right now. */}
        </View>

        <View style={{ paddingTop: 4, paddingBottom: 4 }}>
          <View
            style={{
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: '#E5E5E5',
              minHeight: 62,
              justifyContent: 'center',
              paddingHorizontal: 0,
              alignItems: 'center',
            }}
          >
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="WHAT ARE YOU LOOKING?"
              placeholderTextColor="#9B9B9B"
              className="text-[#1A1A1A]"
              style={{
                fontFamily: 'Helvetica Neue',
                fontWeight: '300',
                fontSize: 12,
                lineHeight: 12,
                letterSpacing: 0.72,
                width: '100%',
                height: 62,
                paddingHorizontal: 0,
                paddingVertical: 0,
                textAlign: 'center',
                textAlignVertical: 'center',
                includeFontPadding: false,
              }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>
        </View>
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center" style={{ paddingBottom: 80 }}>
          <ActivityIndicator color="#1A1A1A" />
        </View>
      ) : (
        <FlashList<BoutiqueCard>
          data={boutiqueCards}
          keyExtractor={(b) => String(b.boutiqueId)}
          estimatedItemSize={300}
          contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 20 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#1A1A1A"
              colors={['#1A1A1A']}
            />
          }
          ListHeaderComponent={
            <View style={{ marginHorizontal: -20 }}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleFetchCurrentLocation}
                className="flex-row items-center justify-center px-5"
                style={{ minHeight: 36, marginTop: 4, marginBottom: 10 }}
              >
                <Image source={MARKER_ICON} style={{ width: 17, height: 17 }} contentFit="contain" />
                {locationLoading ? (
                  <ActivityIndicator color="#1A1A1A" size="small" style={{ marginLeft: 8 }} />
                ) : (
                  <Text
                    className="text-[#1A1A1A] ml-2"
                    numberOfLines={1}
                    style={{
                      fontFamily: 'Helvetica Neue',
                      fontSize: 12,
                      fontWeight: '400',
                      lineHeight: 12,
                      letterSpacing: 0,
                    }}
                  >
                    {currentLocationLabel}
                  </Text>
                )}
              </TouchableOpacity>

              <View>
                <View className="relative">
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{
                      marginLeft: screenWidth < 400 ? 24 : 0,
                      marginRight: screenWidth < 400 ? 24 : 0,
                    }}
                    contentContainerStyle={{
                      flexGrow: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: 4,
                      paddingBottom: 14,
                      paddingLeft: 0,
                      paddingRight: showHomeFilters ? 64 : 0,
                    }}
                  >
                    {CATEGORIES.map((cat, idx) => (
                      <TouchableOpacity
                        key={cat}
                        onPress={() => {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setActiveCategory(cat);
                        }}
                        activeOpacity={0.85}
                        style={{
                          paddingLeft: idx === 0 ? 0 : screenWidth < 400 ? 4 : 8,
                          paddingRight: idx === CATEGORIES.length - 1 ? 0 : screenWidth < 400 ? 4 : 8,
                          paddingVertical: 6,
                          marginRight: idx === CATEGORIES.length - 1 ? 0 : screenWidth < 400 ? 2 : 12,
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

                  {showHomeFilters ? (
                    <View
                      ref={(n) => {
                        filtersButtonRef.current = n;
                      }}
                      className="absolute right-4 top-0 bottom-0 justify-center"
                      pointerEvents="box-none"
                    >
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={openFilters}
                        className="w-10 h-10 items-center justify-center border border-[#E7E7E7] bg-white"
                      >
                        <Ionicons name="options-outline" size={18} color="#1A1A1A" />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            <FadeInView>
              <View className="py-20 items-center justify-center">
                <Text className="text-[#1A1A1A] text-[14px] font-medium mb-2">No dresses available</Text>
                <Text className="text-[#1A1A1A]/40 text-[12px] text-center leading-5 px-8">
                  Try adjusting your search or browse another category to see more results.
                </Text>
              </View>
            </FadeInView>
          }
          renderItem={({ item: b, index: idx }: ListRenderItemInfo<BoutiqueCard>) => (
            <FadeInView delay={Math.min(idx * 60, 360)} className="mb-7" style={{ paddingTop: 8 }}>
              <TouchableOpacity
                activeOpacity={0.9}
                className="mb-3"
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/boutique-details',
                    params: { boutiqueId: String(b.boutiqueId), coverImageUrl: b.coverImageUrl ?? undefined },
                  })
                }
              >
                <View style={{ width: '100%', height: 196, overflow: 'hidden' }}>
                  <Image
                    source={
                      b.coverImageUrl
                        ? { uri: b.coverImageUrl }
                        : require('@/assets/images/Dashboard image 1.png')
                    }
                    style={{ width: '100%', height: 260, marginTop: -14 }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={180}
                    recyclingKey={String(b.boutiqueId)}
                  />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/boutique-details',
                    params: { boutiqueId: String(b.boutiqueId), coverImageUrl: b.coverImageUrl ?? undefined },
                  })
                }
                activeOpacity={0.85}
              >
                <View className="flex-row items-center justify-between mb-2 ">
                  <Text
                    className="flex-1 pr-3 mb-1.5"
                    style={{
                      color: '#000000',
                      fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Helvetica Neue',
                      fontWeight: '700',
                      fontSize: 14,
                      lineHeight: 14,
                      letterSpacing: 2,
                      includeFontPadding: false,
                    }}
                    numberOfLines={1}
                  >
                    {b.boutiqueName}
                  </Text>
                  <Image source={PLUS_ICON} style={{ width: 10, height: 10 }} contentFit="contain" />
                </View>
                <Text
                  style={{
                    color: '#6E6E6E',
                    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Helvetica Neue',
                    fontWeight: '600',
                    fontSize: 14,
                    lineHeight: 14,
                    letterSpacing: 0,
                    includeFontPadding: false,
                  }}
                  numberOfLines={1}
                >
                  {b.boutiqueLocation}
                </Text>
              </TouchableOpacity>
            </FadeInView>
          )}
        />
      )}

      {/* Filters Popover - hidden for now */}
      {showHomeFilters ? (
      <Modal visible={filtersOpen} transparent animationType="fade" onRequestClose={closeFilters}>
        <Pressable className="flex-1" onPress={closeFilters}>
          <BlurView intensity={22} tint="dark" style={{ ...StyleSheet.absoluteFillObject }} />
          <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.20)' }} />
          {(() => {
            const screen = Dimensions.get('window');
            const popW = Math.min(320, screen.width - 24);
            const maxH = screen.height - (insets.top + insets.bottom) - 80;
            const popH = Math.max(420, Math.min(640, maxH));
            const x = (screen.width - popW) / 2;
            const y = Math.max(insets.top + 24, (screen.height - popH) / 2);

            return (
              <Pressable
                onPress={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  left: x,
                  top: y,
                  width: popW,
                  height: popH,
                  backgroundColor: 'white',
                  borderWidth: 1,
                  borderColor: '#EFEFEF',
                  shadowColor: '#000',
                  shadowOpacity: 0.12,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 10 },
                  elevation: 8,
                }}
              >
                <View className="px-5 pt-5 pb-4 border-b border-[#F2F2F2]">
                  <Text className="text-black text-[12px] font-bold tracking-[2px]">FILTERS</Text>
                  <Text className="text-black/40 text-[11px] mt-2">Apply filters to refine your catalog.</Text>
                </View>

                <ScrollView
                  style={{ flex: 1 }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ padding: 16, paddingBottom: 14 }}
                >
                  {canUseDistanceFilter ? (
                    <View className="mb-5">
                      <Text className="text-black/60 text-[10px] tracking-[1.5px] mb-2">DISTANCE</Text>
                      <View className="flex-row flex-wrap">
                        {DISTANCE_FILTERS.map((f) => {
                          const active = draftDistanceFilter === f.id;
                          return (
                            <TouchableOpacity
                              key={f.id}
                              activeOpacity={0.85}
                              onPress={() => setDraftDistanceFilter(f.id)}
                              className={`mr-2 mb-2 px-3 py-2 border ${active ? 'bg-black border-black' : 'border-[#D9D9D9]'}`}
                            >
                              <Text className={`text-[11px] ${active ? 'text-white' : 'text-black/70'}`}>{f.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  <View className="mb-5">
                    <Text className="text-black/60 text-[10px] tracking-[1.5px] mb-2">AI TRY-ON</Text>
                    <View className="flex-row flex-wrap">
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setDraftAiOnly((v) => !v)}
                        className={`mr-2 mb-2 px-3 py-2 border ${draftAiOnly ? 'bg-black border-black' : 'border-[#D9D9D9]'}`}
                      >
                        <Text className={`text-[11px] ${draftAiOnly ? 'text-white' : 'text-black/70'}`}>AI Available</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View className="mb-5">
                    <Text className="text-black/60 text-[10px] tracking-[1.5px] mb-2">PRICE</Text>
                    <View className="flex-row flex-wrap">
                      {PRICE_FILTERS.map((f) => {
                        const active = draftPriceFilter === f.id;
                        return (
                          <TouchableOpacity
                            key={f.id}
                            activeOpacity={0.85}
                            onPress={() => setDraftPriceFilter(f.id)}
                            className={`mr-2 mb-2 px-3 py-2 border ${active ? 'bg-black border-black' : 'border-[#D9D9D9]'}`}
                          >
                            <Text className={`text-[11px] ${active ? 'text-white' : 'text-black/70'}`}>{f.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {sizeOptions.length > 1 ? (
                    <View className="mb-5">
                      <Text className="text-black/60 text-[10px] tracking-[1.5px] mb-2">SIZE</Text>
                      <View className="flex-row flex-wrap">
                        {sizeOptions.map((s) => {
                          const active = draftSizeFilter === s;
                          return (
                            <TouchableOpacity
                              key={s}
                              activeOpacity={0.85}
                              onPress={() => setDraftSizeFilter(s)}
                              className={`mr-2 mb-2 px-3 py-2 border ${active ? 'bg-black border-black' : 'border-[#D9D9D9]'}`}
                            >
                              <Text className={`text-[11px] ${active ? 'text-white' : 'text-black/70'}`}>{s}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  {colorOptions.length > 1 ? (
                    <View className="mb-5">
                      <Text className="text-black/60 text-[10px] tracking-[1.5px] mb-2">COLOR</Text>
                      <View className="flex-row flex-wrap">
                        {colorOptions.map((c) => {
                          const active = draftColorFilter === c;
                          return (
                            <TouchableOpacity
                              key={c}
                              activeOpacity={0.85}
                              onPress={() => setDraftColorFilter(c)}
                              className={`mr-2 mb-2 px-3 py-2 border ${active ? 'bg-black border-black' : 'border-[#D9D9D9]'}`}
                            >
                              <Text className={`text-[11px] ${active ? 'text-white' : 'text-black/70'}`}>{c}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  <View className="mb-5">
                    <Text className="text-black/60 text-[10px] tracking-[1.5px] mb-2">LOCATION</Text>
                    <View className="flex-row flex-wrap">
                      {locationOptions.map((loc) => {
                        const active = draftLocationFilter === loc;
                        return (
                          <TouchableOpacity
                            key={loc}
                            activeOpacity={0.85}
                            onPress={() => setDraftLocationFilter(loc)}
                            className={`mr-2 mb-2 px-3 py-2 border ${active ? 'bg-black border-black' : 'border-[#D9D9D9]'}`}
                          >
                            <Text className={`text-[11px] ${active ? 'text-white' : 'text-black/70'}`} numberOfLines={1}>
                              {loc}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  <View>
                    <Text className="text-black/60 text-[10px] tracking-[1.5px] mb-2">SORT</Text>
                    <View className="flex-row flex-wrap">
                      {SORT_OPTIONS.map((opt) => {
                        const active = draftSortId === opt.id;
                        return (
                          <TouchableOpacity
                            key={opt.id}
                            activeOpacity={0.85}
                            onPress={() => setDraftSortId(opt.id)}
                            className={`mr-2 mb-2 px-3 py-2 border ${active ? 'bg-black border-black' : 'border-[#D9D9D9]'}`}
                          >
                            <Text className={`text-[11px] ${active ? 'text-white' : 'text-black/70'}`}>{opt.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </ScrollView>

                <View className="flex-row px-4 pb-4 pt-3 border-t border-[#F2F2F2]">
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      setDraftPriceFilter('any');
                      setDraftLocationFilter('All');
                      setDraftDistanceFilter('any');
                      setDraftSortId('featured');
                      setDraftSizeFilter('Any');
                      setDraftColorFilter('Any');
                      setDraftAiOnly(false);
                    }}
                    className="flex-1 border border-black py-3 items-center mr-2"
                  >
                    <Text className="text-black text-[11px] font-bold tracking-[2px]">RESET</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.9} onPress={applyFilters} className="flex-1 bg-black py-3 items-center ml-2">
                    <Text className="text-white text-[11px] font-bold tracking-[2px]">APPLY</Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            );
          })()}
        </Pressable>
      </Modal>
      ) : null}
    </View>
  );
}
