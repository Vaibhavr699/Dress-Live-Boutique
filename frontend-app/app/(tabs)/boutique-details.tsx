import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCartStore } from '@/store/useCartStore';
import { useWishlistStore } from '@/store/useWishlistStore';
import { api } from '@shared/api/api';

const { width } = Dimensions.get('window');
const CATEGORIES = ['All', 'Abendkleider', 'Hochzeitskleider', 'Add-Ons'];

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
  const { addItem } = useCartStore();
  const { toggleItem, isInWishlist } = useWishlistStore();

  const params = useLocalSearchParams<{ boutiqueId?: string; coverImageUrl?: string }>();
  const boutiqueId = params.boutiqueId ? Number(params.boutiqueId) : NaN;
  const coverFromHome = typeof params.coverImageUrl === 'string' ? params.coverImageUrl : null;

  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [boutique, setBoutique] = useState<Boutique | null>(null);
  const [dresses, setDresses] = useState<Dress[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!Number.isFinite(boutiqueId)) {
          setBoutique(null);
          setDresses([]);
          return;
        }
        setLoading(true);
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

  return (
    <View className="flex-1 bg-white">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100, paddingTop: insets.top }}
      >
        {/* Header Image */}
        <View className="relative w-full aspect-[4/3] px-6">
          <Image
            source={
              headerImageUrl
                ? { uri: headerImageUrl }
                : require('@/assets/images/Dashboard image 1.png')
            }
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
          />
          <TouchableOpacity
            onPress={() => router.back()}
            className="absolute left-10 top-4 w-10 h-10 items-center justify-center bg-white/20 rounded-full"
          >
            <Ionicons name="arrow-back" size={24} color="black" />
          </TouchableOpacity>
        </View>

        <View className="px-6 py-6">
          {/* Boutique Info */}
          <View className="flex-row justify-between items-start mb-1">
            <Text className="text-black text-2xl font-medium" style={{ fontFamily: 'Helvetica Neue' }}>
              {(boutique?.name || '').trim() || 'Boutique'}
            </Text>
          </View>
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-[#1A1A1A50] text-[15px] font-normal" style={{ fontFamily: 'Helvetica Neue' }}>
              {(boutique?.location || '').trim() || 'Location unavailable'}
            </Text>
          </View>

          {/* Categories */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-8"
            contentContainerStyle={{ paddingRight: 40 }}
          >
            {CATEGORIES.map((cat) => (
              <TouchableOpacity key={cat} onPress={() => setActiveCategory(cat)} className="mr-8 items-center">
                <Text
                  className={activeCategory === cat ? 'text-[#1A1A1A]' : 'text-[#1A1A1A50]'}
                  style={{
                    fontFamily: 'Helvetica Neue',
                    fontWeight: '500',
                    fontSize: 12,
                    lineHeight: 12,
                    letterSpacing: 0.5,
                  }}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loading ? (
            <View className="py-16 items-center justify-center">
              <ActivityIndicator color="#1A1A1A" />
            </View>
          ) : filteredDresses.length === 0 ? (
            <View className="py-16 items-center justify-center">
              <Text className="text-[#1A1A1A] text-[14px] font-medium mb-2">No dresses available</Text>
              <Text className="text-[#1A1A1A]/40 text-[12px] text-center leading-5 px-8">
                This boutique has no matching dresses in this category.
              </Text>
            </View>
          ) : (
            <View className="flex-row flex-wrap justify-between">
              {filteredDresses.map((dress) => {
                const priceLabel =
                  typeof dress.price === 'number' ? `${dress.price.toFixed(0)} EUR` : `${dress.price} EUR`;
                const imageSource = dress.image_url
                  ? { uri: dress.image_url }
                  : require('@/assets/images/Dashboard image 3.png');

                return (
                  <View key={dress.id} style={{ width: '48%', marginBottom: 24 }}>
                    <View className="relative mb-3">
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() =>
                          router.push({
                            pathname: '/(tabs)/product-details',
                            params: { id: String(dress.id) },
                          })
                        }
                      >
                        <Image source={imageSource} style={{ width: '100%', height: 180 }} contentFit="cover" />
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() =>
                          toggleItem({
                            id: String(dress.id),
                            name: dress.name,
                            price: priceLabel,
                            image: imageSource,
                          })
                        }
                        className="absolute top-2 right-2 w-8 h-8 items-center justify-center bg-white/60 rounded-full"
                      >
                        <Ionicons
                          name={isInWishlist(String(dress.id)) ? 'heart' : 'heart-outline'}
                          size={18}
                          color={isInWishlist(String(dress.id)) ? '#FF3B30' : 'black'}
                        />
                      </TouchableOpacity>
                    </View>

                    <View className="flex-row justify-between items-center px-1">
                      <TouchableOpacity
                        onPress={() =>
                          router.push({
                            pathname: '/(tabs)/product-details',
                            params: { id: String(dress.id) },
                          })
                        }
                        className="flex-1"
                      >
                        <Text className="text-black text-[14px] font-[500] mb-1" style={{ fontFamily: 'Helvetica Neue' }} numberOfLines={1}>
                          {dress.name}
                        </Text>
                        <Text className="text-black/40 text-[12px] font-[400]" style={{ fontFamily: 'Helvetica Neue' }}>
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
                            selected: true,
                          });
                          Alert.alert('Added', `${dress.name} has been added to your bag.`);
                        }}
                        className="p-1 items-center justify-center w-8 h-8 rounded-full border border-black/10"
                      >
                        <Ionicons name="add" size={18} color="black" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
