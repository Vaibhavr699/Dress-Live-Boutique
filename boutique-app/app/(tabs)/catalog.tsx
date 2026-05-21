import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, useWindowDimensions, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@shared/api/api';
import { useAuthStore } from '@shared/store/useAuthStore';
import { FigmaConfirmModal } from '../../components/FigmaConfirmModal';

type SubStatus = 'none' | 'active' | 'past_due' | 'canceled' | 'incomplete' | null;

const PENCIL_ICON = require('../../assets/svg/pencil.svg');
const TRASH_ICON = require('../../assets/svg/trash.svg');

type Dress = {
  id: number;
  name: string;
  price: number;
  image_url?: string | null;
  ai_model_url?: string | null;
  is_ai_enabled?: boolean | null;
};

export default function CatalogScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { user } = useAuthStore();
  const boutiqueId = user?.boutique_id ?? null;
  const [loading, setLoading] = useState(true);
  const [dresses, setDresses] = useState<Dress[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [dressPendingDelete, setDressPendingDelete] = useState<Dress | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const cardWidth = Math.max(0, width - 40);
  const imageBaseWidth = 390;
  const imageBaseHeight = 148;
  const imageBaseTopOffset = 14;
  const imageScale = Math.max(1, cardWidth / imageBaseWidth);
  const imageCardHeight = Math.round(imageBaseHeight * imageScale);
  const imageTopOffset = Math.round(imageBaseTopOffset * imageScale);

  // Subscription gate: poll the partner's plan status on focus so we can
  // decide whether to let "Add Dress" navigate forward (active sub) or
  // bounce the partner to /subscribe (no sub). Same gate the backend
  // enforces server-side — surfacing it here saves the partner from
  // filling out the whole form just to hit a 402.
  const [subStatus, setSubStatus] = useState<SubStatus>(null);
  const refreshSubStatus = useCallback(async () => {
    try {
      const res = (await api.get('/partners/stripe/subscription/status')) as { status?: string };
      setSubStatus((res?.status ?? 'none') as SubStatus);
    } catch {
      // Leave previous status; failing closed (treating as inactive)
      // would block a partner from adding dresses just because the
      // status endpoint blipped.
    }
  }, []);

  // Add Dress is hard-gated by subscription. If the partner doesn't have
  // an active sub, the tap routes them straight to /subscribe instead of
  // opening the form — pay first, then publish. The matching `disabled`
  // styling on the button itself signals this visually so the tap isn't
  // a surprise. While subStatus is still null (initial load) we let the
  // tap through to /add-dress; the backend 402 guard inside add-dress.tsx
  // catches any race.
  const canPublish = subStatus === 'active' || subStatus == null;
  const handleAddDress = useCallback(() => {
    if (subStatus && subStatus !== 'active') {
      router.push('/subscribe' as any);
      return;
    }
    router.push('/add-dress');
  }, [router, subStatus]);

  const fetchDresses = useCallback(async () => {
    if (!boutiqueId) {
      setDresses([]);
      setLoading(false);
      return;
    }

    try {
      const data = await api.get(`/dresses/?boutique_id=${boutiqueId}`);
      setDresses(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch dresses for catalog:', error);
    } finally {
      setLoading(false);
    }
  }, [boutiqueId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchDresses();
      void refreshSubStatus();
    }, [fetchDresses, refreshSubStatus])
  );

  const openDelete = (dress: Dress) => {
    setDressPendingDelete(dress);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!dressPendingDelete?.id) return;
    setIsDeleting(true);
    try {
      await api.delete(`/dresses/${dressPendingDelete.id}`);
      setDeleteModalOpen(false);
      setDressPendingDelete(null);
      setLoading(true);
      await fetchDresses();
    } catch (error: any) {
      Alert.alert('Delete Failed', error?.message || 'Could not delete this dress listing.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Manual pull-to-refresh for the catalog list. Reuses fetchDresses but
  // keeps `loading` (the full-screen spinner) untouched so only the small
  // pull-to-refresh control spins.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchDresses();
    } finally {
      setRefreshing(false);
    }
  }, [fetchDresses]);

  const filteredDresses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return dresses;

    return dresses.filter((dress) => dress.name.toLowerCase().includes(query));
  }, [dresses, searchQuery]);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: 110 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#1A1A1A"
            colors={['#1A1A1A']}
          />
        }
      >
        {/* Subscription nudge — mirror the dashboard banner so a partner
            who taps Catalog first sees the same prompt instead of being
            surprised by a 402 after filling out Add Dress. */}
        {subStatus && subStatus !== 'active' ? (
          <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
            <View className="bg-[#FFF4EC] border border-[#FFD3B7] px-4 py-3 flex-row items-start">
              <Ionicons name="alert-circle-outline" size={18} color="#C9491A" style={{ marginRight: 10, marginTop: 1 }} />
              <View className="flex-1">
                <Text className="text-[#C9491A] text-[12px] font-bold uppercase tracking-[0.5px] mb-1">
                  {subStatus === 'past_due' ? 'Payment failed' : 'Subscription needed'}
                </Text>
                <Text className="text-[#7A3E1C] text-[11px] leading-4 mb-3">
                  {subStatus === 'past_due'
                    ? 'Update your card to keep publishing dresses.'
                    : 'Activate your plan to publish dresses for customers.'}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => router.push('/subscribe' as any)}
                  className="bg-[#C9491A] px-3 py-2 self-start"
                >
                  <Text className="text-white text-[10px] uppercase tracking-[1px]">
                    {subStatus === 'past_due' ? 'Update payment' : 'Activate plan'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}

        <View style={{ paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
            <Text
              style={{
                color: '#000000',
                fontFamily: 'Helvetica Neue',
                fontSize: 18,
                fontWeight: '500',
                lineHeight: 22,
                textAlign: 'center',
              }}
            >
              All Dress Catalog Listings
            </Text>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handleAddDress}
              style={{
                width: 125,
                height: 46,
                backgroundColor: '#000000',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                opacity: canPublish ? 1 : 0.55,
              }}
            >
              {!canPublish ? (
                <Ionicons name="lock-closed" size={12} color="#FFFFFF" style={{ marginRight: 6 }} />
              ) : null}
              <Text style={{ color: '#FFFFFF', fontFamily: 'Helvetica Neue', fontSize: 14, fontWeight: '500', letterSpacing: 0.56, textTransform: 'uppercase' }}>
                Add Dress
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ borderTopWidth: 1, borderTopColor: '#E6E6E6', borderBottomWidth: 1, borderBottomColor: '#E6E6E6', marginBottom: 30 }}>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="SEARCH DRESSES BY NAME OT STYLE..."
              placeholderTextColor="#9B9B9B"
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                height: 62,
                color: '#000000',
                fontFamily: 'Helvetica Neue',
                fontSize: 12,
                fontWeight: '400',
                letterSpacing: 0.36,
                textAlign: 'center',
                textTransform: 'uppercase',
              }}
            />
          </View>

          <View style={{ marginBottom: 30 }}>
            <Text style={{ color: '#6E6E6E', fontFamily: 'Helvetica Neue', fontSize: 14, fontWeight: '400', lineHeight: 20, textAlign: 'center' }}>
              Manage your bridal dress collections.
            </Text>
          </View>

          {loading ? (
            <View className="py-20 items-center">
              <ActivityIndicator color="#1A1A1A" />
            </View>
          ) : !boutiqueId ? (
            <View className="py-24 items-center">
              <Text className="text-[14px] text-black mb-2">Boutique missing</Text>
              <Text className="text-[11px] text-center text-black/35 leading-5 px-10">
                This seller account is not linked to a boutique yet, so catalog inventory cannot load.
              </Text>
            </View>
          ) : dresses.length === 0 ? (
            <View className="py-24 items-center">
              <Text className="text-[14px] text-black mb-2">No catalog dresses yet</Text>
              <Text className="text-[11px] text-center text-black/35 leading-5 px-10 mb-6">
                Start by adding your first listing so brides can browse your collection.
              </Text>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={handleAddDress}
                className="border border-black px-6 py-3"
                style={{ opacity: canPublish ? 1 : 0.55, flexDirection: 'row', alignItems: 'center' }}
              >
                {!canPublish ? (
                  <Ionicons name="lock-closed" size={11} color="#000000" style={{ marginRight: 6 }} />
                ) : null}
                <Text className="text-[10px] uppercase tracking-[1.5px] text-black">Add First Dress</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              {filteredDresses.map((dress) => (
                <View key={dress.id} style={{ marginBottom: 34 }}>
                  <View style={{ width: cardWidth, height: imageCardHeight, overflow: 'hidden', backgroundColor: '#F3F3F3' }}>
                    <Image
                      source={
                        dress.image_url
                          ? { uri: dress.image_url }
                          : require('../../assets/images/Dashboard image 2.png')
                      }
                      // Preserve the "top crop" while ensuring no bottom grey gap.
                      style={{ width: cardWidth, height: imageCardHeight + imageTopOffset, marginTop: -imageTopOffset }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  </View>

                  <View style={{ paddingTop: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          flex: 1,
                          color: '#000000',
                          fontFamily: 'Helvetica Neue',
                          fontSize: 14,
                          fontWeight: '500',
                          letterSpacing: 2,
                          lineHeight: 14,
                          marginRight: 10,
                        }}
                      >
                        {dress.name}
                      </Text>
  
                    </View>
                    <Text
                      style={{
                        color: '#6E6E6E',
                        fontFamily: 'Helvetica Neue',
                        fontSize: 14,
                        fontWeight: '400',
                        lineHeight: 14,
                        letterSpacing: 0,
                      }}
                    >
                      Dress Price:{' '}
                      <Text
                        style={{
                          color: '#000000',
                          fontFamily: 'Helvetica Neue',
                          fontSize: 14,
                          fontWeight: '400',
                          lineHeight: 14,
                          letterSpacing: 0,
                        }}
                      >
                        ${typeof dress.price === 'number' ? dress.price.toFixed(0) : dress.price}
                      </Text>
                    </Text>
                    
                  </View>

                  <View style={{ flexDirection: 'row', gap: 14, marginTop: 40 }}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={handleAddDress}
                      style={{ flex: 1, height: 38, borderWidth: 1, borderColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }}
                    >
                      <Image source={PENCIL_ICON} style={{ width: 16, height: 16, tintColor: '#000000' }} contentFit="contain" />
                      <Text style={{ marginLeft: 8, color: '#000000', fontSize: 12 }}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => openDelete(dress)}
                      style={{ flex: 1, height: 38, backgroundColor: '#C9491A', alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }}
                    >
                      <Image source={TRASH_ICON} style={{ width: 16, height: 16, tintColor: '#FFFFFF' }} contentFit="contain" />
                      <Text style={{ marginLeft: 8, color: '#FFFFFF', fontSize: 12 }}>Delete Dress</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              {filteredDresses.length === 0 ? (
                <View className="py-20 items-center">
                  <Text className="text-[14px] text-black mb-2">No matching dresses</Text>
                  <Text className="text-[11px] text-center text-black/35 leading-5 px-10">
                    Try searching with another dress name or style.
                  </Text>
                </View>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>

      <FigmaConfirmModal
        visible={deleteModalOpen}
        onClose={() => (isDeleting ? null : setDeleteModalOpen(false))}
        title="Delete Dress Listing?"
        description="Are you sure you want to delete this dress form your catalog? This action can not be undone and the listing will no longer be visible to brides."
        iconName="trash"
        tone="danger"
        leftButtonText={isDeleting ? 'DELETING...' : 'ACCEPT'}
        onLeftPress={() => (isDeleting ? null : handleConfirmDelete())}
        rightButtonText="CANCEL"
        onRightPress={() => (isDeleting ? null : setDeleteModalOpen(false))}
      />
    </SafeAreaView>
  );
}
