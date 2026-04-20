import React, { useCallback, useState } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Feather, Ionicons } from '@expo/vector-icons';
import { api } from '@shared/api/api';
import { useAuthStore } from '@shared/store/useAuthStore';
import { FigmaConfirmModal } from '../../components/FigmaConfirmModal';

type Dress = {
  id: number;
  name: string;
  price: number;
  image_url?: string | null;
};

export default function CatalogScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();
  const boutiqueId = user?.boutique_id ?? null;
  const [loading, setLoading] = useState(true);
  const [dresses, setDresses] = useState<Dress[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [dressPendingDelete, setDressPendingDelete] = useState<Dress | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
    }, [fetchDresses])
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

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: 110 }}
      >
        <View className="px-5">
          <View className="flex-row items-center justify-between mb-5">
            <Text className="text-[16px] text-black" style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}>
              All Dress Catalog Listings
            </Text>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => router.push('/add-dress')}
              className="bg-black px-4 py-2.5"
            >
              <Text className="text-[10px] uppercase tracking-[1.5px] text-white">Add Dress</Text>
            </TouchableOpacity>
          </View>

          <View className="border-t border-[#EFEFEF] pt-5 mb-6">
            <Text className="text-[10px] uppercase tracking-[1px] text-center text-black/20 mb-3">
              Search Dresses By Name Or Style
            </Text>
            <Text className="text-[11px] text-center text-black/35">Manage your bridal dress collection.</Text>
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
                onPress={() => router.push('/add-dress')}
                className="border border-black px-6 py-3"
              >
                <Text className="text-[10px] uppercase tracking-[1.5px] text-black">Add First Dress</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              {dresses.map((dress) => (
                <View key={dress.id} className="mb-6">
                  <Image
                    source={
                      dress.image_url
                        ? { uri: dress.image_url }
                        : require('../../assets/images/Dashboard image 2.png')
                    }
                    style={{ width: '100%', height: 175 }}
                    contentFit="cover"
                    cachePolicy="none"
                  />

                  <View className="pt-3">
                    <Text className="text-[13px] text-black mb-1" style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}>
                      {dress.name}
                    </Text>
                    <Text className="text-[11px] text-black/45">
                      Dress Price: ${typeof dress.price === 'number' ? dress.price.toFixed(0) : dress.price}
                    </Text>
                  </View>

                  <View className="flex-row mt-4">
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => router.push('/add-dress')}
                      className="flex-1 border border-[#1A1A1A] py-3 mr-1 items-center justify-center flex-row"
                    >
                      <Feather name="edit-2" size={12} color="#1A1A1A" />
                      <Text className="ml-2 text-[10px] text-black/80">Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => openDelete(dress)}
                      className="flex-1 bg-[#C9491A] py-3 ml-1 items-center justify-center flex-row"
                    >
                      <Ionicons name="trash-outline" size={12} color="white" />
                      <Text className="ml-2 text-[10px] text-white">Delete Dress</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
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
