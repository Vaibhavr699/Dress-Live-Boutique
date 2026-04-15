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

const CATEGORIES = ["All", "Abendkleider", "Hochzeitskleider", "Add-Ons"];

type Dress = {
  id: number;
  name: string;
  price: number;
  image_url?: string | null;
  boutique_id: number;
};

type Boutique = {
  id: number;
  name: string;
  location?: string | null;
  is_visible_to_customers?: boolean;
};

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [dresses, setDresses] = useState<Dress[]>([]);
  const [boutiques, setBoutiques] = useState<Record<number, Boutique>>({});
  const [currentLocationLabel, setCurrentLocationLabel] = useState('Tap to use current location');
  const [locationLoading, setLocationLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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
    const categoryFiltered = activeCategory === 'All' ? dresses : dresses;
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return categoryFiltered;
    }

    return categoryFiltered.filter((dress) => {
      const boutique = boutiques[dress.boutique_id];
      const searchableText = [dress.name, boutique?.name, boutique?.location]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(normalizedQuery);
    });
  }, [activeCategory, boutiques, dresses, searchQuery]);

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
