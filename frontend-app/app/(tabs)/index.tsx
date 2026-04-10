import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@shared/api/api';
import { useFocusEffect } from '@react-navigation/native';

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
  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [dresses, setDresses] = useState<Dress[]>([]);
  const [boutiques, setBoutiques] = useState<Record<number, Boutique>>({});
  const [shortlistDressIds, setShortlistDressIds] = useState<number[]>([]);
  const [updatingDressId, setUpdatingDressId] = useState<number | null>(null);

  const loadCatalog = useCallback(async () => {
    try {
      const [dressData, boutiqueData, shortlistData] = await Promise.all([
        api.get('/dresses/?visible_only=true'),
        api.get('/boutiques/'),
        api.get('/shortlists/me'),
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
      setShortlistDressIds(
        Array.isArray(shortlistData)
          ? shortlistData.map((item: { dress_id: number }) => item.dress_id)
          : []
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
    if (activeCategory === 'All') {
      return dresses;
    }

    return dresses;
  }, [activeCategory, dresses]);

  const toggleShortlist = async (dressId: number) => {
    setUpdatingDressId(dressId);
    try {
      if (shortlistDressIds.includes(dressId)) {
        await api.delete(`/shortlists/me/${dressId}`);
        setShortlistDressIds((prev) => prev.filter((id) => id !== dressId));
      } else {
        await api.post('/shortlists/me', { dress_id: dressId });
        setShortlistDressIds((prev) => [...prev, dressId]);
      }
    } catch (error) {
      Alert.alert('Wishlist', error instanceof Error ? error.message : 'Could not update wishlist.');
    } finally {
      setUpdatingDressId(null);
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


        {/* Separator / Search Prompt */}
        <View className="items-center justify-center border-t border-[#F0F0F0] py-4 mt-2">
          <Text 
            className="text-[#1A1A1A50] uppercase"
            style={{ 
              fontFamily: 'Helvetica Neue',
              fontWeight: '300',
              fontSize: 12,
              lineHeight: 12,
              letterSpacing: 0.72,
            }}
          >
            WHAT ARE YOU LOOKING?
          </Text>
        </View>


        {/* Location Picker */}
        
      </View>
      <View className="flex-row items-center justify-center mt-4">
          <Ionicons name="location-outline" size={16} color="#1A1A1A" />
          <Text className="text-[#1A1A1A] text-xs font-light ml-2 tracking-[0.5px]">
            Current Location
          </Text>
        </View>

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
                      disabled={updatingDressId === dress.id}
                      onPress={() => toggleShortlist(dress.id)}
                    >
                      <Ionicons
                        name={shortlistDressIds.includes(dress.id) ? 'heart' : 'add'}
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
