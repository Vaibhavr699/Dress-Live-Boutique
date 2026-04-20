import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions, Switch, ActivityIndicator, Platform, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '@shared/store/useAuthStore';
import { api } from '@shared/api/api';
import { FigmaConfirmModal } from '../../components/FigmaConfirmModal';

const { width } = Dimensions.get('window');

const RECENT_ORDERS = [
    { id: '1', name: 'Emily Johnson', type: 'Bridal Party Dresses (3 Dreress)', date: 'Dec 12', price: '$1,250', status: 'New', statusColor: '#F2994A' },
    { id: '2', name: 'Sarah Khan', type: 'Custom Wedding Gown - Size 4', date: 'Dec 10', price: '$3,400', status: 'In Production', statusColor: '#2F80ED' },
    { id: '3', name: 'Maria Garcia', type: 'Bridal Party Dresses (2 Dreress)', date: 'Dec 08', price: '$1,050', status: 'Ready for Fitting', statusColor: '#27AE60' },
    { id: '4', name: 'James Wilson', type: 'Groom’s Velvet Suite - Size 42', date: 'Dec 05', price: '$900', status: 'Alterations Pending', statusColor: '#EB5757' }
];

const CUSTOM_REQUESTS = [
    { 
        id: '1', 
        name: 'Sophia Martinez', 
        type: 'Custom Bridesmaid Dress',
        tags: ['Color: Dusty Pink', 'Fabric: Satin', 'Classic Off Shoulder']
    },
    { 
        id: '2', 
        name: 'Isabella Rodriguez', 
        type: 'Custom Bridal Gown',
        tags: ['Color: Ivory', 'Fabric: Silk', 'Modern V-Neck']
    }
];

const UPCOMING_FITTINGS = [
    { id: '1', name: 'Emma Wilson', type: 'Dress Fitting', time: '2:40 PM' },
    { id: '2', name: 'Liam Smith', type: 'Consultation', time: '4:00 PM' },
    { id: '3', name: 'Olivia Johnson', type: 'Final Fitting', time: '5:15 PM' }
];

export default function BoutiqueDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();
  const boutiqueId = user?.boutique_id ?? null;
  
  const [loading, setLoading] = useState(true);
  const [dresses, setDresses] = useState<any[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [isStoreVisible, setIsStoreVisible] = useState(true);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [boutique, setBoutique] = useState<{ name?: string | null; location?: string | null } | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchDresses = useCallback(async () => {
    if (!boutiqueId) {
      setDresses([]);
      setLoading(false);
      return;
    }

    try {
      const data = await api.get(`/dresses/?boutique_id=${boutiqueId}`);
      setDresses(data);
    } catch (error) {
      console.error('Failed to fetch dresses:', error);
    } finally {
      setLoading(false);
    }
  }, [boutiqueId]);

  const fetchBoutiqueVisibility = useCallback(async () => {
    if (!boutiqueId) {
      setIsStoreVisible(false);
      setBoutique(null);
      return;
    }

    try {
      const boutique = await api.get(`/boutiques/${boutiqueId}`);
      setIsStoreVisible(boutique.is_visible_to_customers ?? true);
      setBoutique(boutique);
    } catch (error) {
      console.error('Failed to fetch boutique visibility:', error);
    }
  }, [boutiqueId]);

  const handleStoreVisibilityChange = useCallback(
    async (value: boolean) => {
      if (!boutiqueId) {
        Alert.alert('Boutique Missing', 'Your account is not linked to a boutique yet.');
        return;
      }

      const previousValue = isStoreVisible;
      setIsStoreVisible(value);
      setIsUpdatingVisibility(true);

      try {
        await api.put(`/boutiques/${boutiqueId}`, {
          is_visible_to_customers: value,
        });
      } catch (error: any) {
        setIsStoreVisible(previousValue);
        Alert.alert('Update Failed', error.message || 'Could not update customer visibility.');
      } finally {
        setIsUpdatingVisibility(false);
      }
    },
    [boutiqueId, isStoreVisible]
  );

  useFocusEffect(
    useCallback(() => {
      fetchDresses();
      fetchBoutiqueVisibility();
    }, [fetchDresses, fetchBoutiqueVisibility])
  );

  const selectedDressForDelete = dresses[0] ?? null;

  const handleDeleteDress = useCallback(async () => {
    if (!selectedDressForDelete?.id) return;
    setIsDeleting(true);
    try {
      await api.delete(`/dresses/${selectedDressForDelete.id}`);
      setDeleteModalOpen(false);
      setLoading(true);
      await fetchDresses();
    } catch (error: any) {
      Alert.alert('Delete Failed', error?.message || 'Could not delete this dress listing.');
    } finally {
      setIsDeleting(false);
    }
  }, [fetchDresses, selectedDressForDelete?.id]);

  return (
    <View className="flex-1 bg-white">
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}
      >
        {/* Header */}
        <View style={{ paddingTop: insets.top + 14 }} className="px-6 pb-4 border-b border-[#F0F0F0]">
          <Text className="text-[14px] text-black text-center" style={{ fontFamily: 'Helvetica Neue', fontWeight: '600' }}>
            Shop Dashboard
          </Text>
        </View>

        {/* Greeting + Shop Status Card (Figma-style) */}
        <View className="px-6 pt-6 mb-10">
          <View className="border border-black">
            <View className="p-4 flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-sm bg-gray-100 overflow-hidden mr-3">
                  <Image source={require('../../assets/images/avatar.png')} style={{ width: '100%', height: '100%' }} />
                </View>
                <View>
                  <Text className="text-[11px] text-black/50">Good morning</Text>
                  <Text className="text-[13px] text-black" style={{ fontFamily: 'Helvetica Neue', fontWeight: '600' }}>
                    {user?.full_name || 'Elife Terzi'}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center">
                <View className={`w-2 h-2 rounded-full mr-2 ${isOnline ? 'bg-green-500' : 'bg-black'}`} />
                <Text className="text-[11px] text-black">{isOnline ? 'Online' : 'Offline'}</Text>
              </View>
            </View>

            <View className="h-px bg-black/10" />

            <View className="p-4">
              <Text className="text-[12px] font-bold uppercase tracking-[0.8px] mb-3 text-black">
                Shop Status
              </Text>

              <View className="border border-black p-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center flex-1 pr-4">
                    <View className="w-8 h-8 items-center justify-center mr-3">
                      <Ionicons name="eye-outline" size={18} color="black" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[12px] text-black" style={{ fontFamily: 'Helvetica Neue', fontWeight: '600' }}>
                        Set Customer Visibility
                      </Text>
                      <Text className="text-[10px] text-black/50 mt-0.5">Customers can see your shop</Text>
                    </View>
                  </View>

                  <Switch
                    value={isStoreVisible}
                    onValueChange={handleStoreVisibilityChange}
                    disabled={isUpdatingVisibility}
                    trackColor={{ false: '#D9D9D9', true: '#D9D9D9' }}
                    thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : '#FFFFFF'}
                  />
                </View>
              </View>
            </View>
          </View>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center py-20">
            <ActivityIndicator color="black" />
          </View>
        ) : !boutiqueId ? (
          <View className="flex-1 items-center justify-center py-20 px-10">
            <Text className="text-lg font-bold mb-2 text-center">Boutique setup incomplete</Text>
            <Text className="text-xs text-black/40 text-center leading-5">
              This seller account is not linked to a boutique yet, so inventory cannot load.
            </Text>
          </View>
        ) : dresses.length === 0 ? (
          <View className="flex-1 items-center justify-center px-10" style={{ paddingTop: 28, paddingBottom: 80 }}>
            <View className="w-16 h-16 items-center justify-center mb-5">
              <MaterialCommunityIcons name="hanger" size={48} color="black" />
            </View>
            <Text className="text-[16px] text-black mb-2 text-center" style={{ fontFamily: 'Helvetica Neue', fontWeight: '600' }}>
              Add Your First Catalog Dress
            </Text>
            <Text className="text-[12px] text-black/50 text-center mb-8 leading-5">
              Customers can see your catalog dresses and shop address.
            </Text>
            <TouchableOpacity 
              onPress={() => router.push('/add-dress')}
              className="border border-black px-10 py-4"
              activeOpacity={0.7}
            >
              <Text className="text-[12px] font-bold uppercase tracking-[1px] text-black">ADD DRESS</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Dresses Catalog Listings */}
            <View className="px-6 mb-10">
              <Text className="text-[14px] text-black mb-1" style={{ fontFamily: 'Helvetica Neue', fontWeight: '600' }}>
                Dresses Catalog Listings
              </Text>
              <Text className="text-[10px] text-black/40 mb-4">
                Manage your bridal orders, designs, and customer requests.
              </Text>

              <View className="border border-[#EAEAEA] bg-white">
                <Image
                  source={
                    dresses[0]?.image_url
                      ? { uri: dresses[0].image_url }
                      : require('../../assets/images/Dashboard image 2.png')
                  }
                  style={{ width: '100%', height: 160 }}
                  contentFit="cover"
                />
                <View className="p-4 flex-row items-start justify-between">
                  <View className="flex-1 pr-4">
                    <Text className="text-[13px] text-black" style={{ fontFamily: 'Helvetica Neue', fontWeight: '600' }}>
                      {boutique?.name || 'Boutique Partner'}
                    </Text>
                    <Text className="text-[10px] text-black/40 mt-1">{boutique?.location || 'Location unavailable'}</Text>
                  </View>
                  <View className="flex-row items-center">
                    <TouchableOpacity onPress={() => router.push('/business-profile-edit')} className="mr-3" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Feather name="edit-2" size={16} color="black" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setDeleteModalOpen(true)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      disabled={!selectedDressForDelete || isDeleting}
                      style={{ opacity: !selectedDressForDelete || isDeleting ? 0.4 : 1 }}
                    >
                      <Ionicons name="trash-outline" size={18} color="black" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>

            <View className="px-6 mb-10">
                <View className="flex-row justify-between items-center mb-6">
                    <Text className="text-sm font-bold">Recent Orders</Text>
                    <TouchableOpacity className="border border-black px-3 py-1 rounded-sm">
                        <Text className="text-[10px] font-bold uppercase">View All</Text>
                    </TouchableOpacity>
                </View>
                <View className="gap-6">
                    {RECENT_ORDERS.map((order) => (
                        <View key={order.id} className="flex-row items-center justify-between border border-[#EAEAEA] px-4 py-3">
                            <View className="flex-row items-center flex-1">
                                <View className="w-12 h-12 rounded-full overflow-hidden mr-4">
                                    <Image 
                                        source={require('../../assets/images/Dashboard image 2.png')}
                                        style={{ width: '100%', height: '100%' }}
                                    />
                                </View>
                                <View className="flex-1">
                                    <View className="flex-row items-center mb-1">
                                        <Text className="text-xs font-bold mr-2">{order.name}</Text>
                                    </View>
                                    <Text className="text-[10px] text-black/40 mb-1">{order.type} - {order.date}</Text>
                                    <Text className="text-xs font-bold">{order.price}</Text>
                                </View>
                            </View>
                            <View className="items-end">
                                <View className="border border-black px-2 py-1">
                                  <Text className="text-[9px] font-bold">{order.status}</Text>
                                </View>
                            </View>
                        </View>
                    ))}
                </View>
            </View>

            <View className="px-6 mb-10">
                <Text className="text-sm font-bold mb-6">New Custom Requests</Text>
                <View className="gap-4">
                    {CUSTOM_REQUESTS.map((request) => (
                        <View key={request.id} className="border border-[#EAEAEA] rounded-2xl p-4 bg-white">
                            <Text className="text-xs font-bold mb-1">{request.name}</Text>
                            <Text className="text-[10px] text-black/35 mb-3">{request.type}</Text>

                            <View className="flex-row flex-wrap gap-2 mb-4">
                                {request.tags.map((tag) => (
                                    <View key={tag} className="border border-[#D9D9D9] rounded-full px-2.5 py-1">
                                        <Text className="text-[8px] text-black/60">{tag}</Text>
                                    </View>
                                ))}
                            </View>

                            <View className="flex-row gap-3">
                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    className="flex-1 bg-black rounded-full py-3 items-center justify-center"
                                >
                                    <Text className="text-[9px] font-bold uppercase tracking-[1.2px] text-white">
                                        Review Request
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    className="flex-1 border border-[#D9D9D9] rounded-full py-3 items-center justify-center"
                                >
                                    <Text className="text-[9px] font-bold uppercase tracking-[1.2px] text-black/70">
                                        Message Bride
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </View>
            </View>

            <View className="px-6 mb-12">
                <View className="flex-row justify-between items-center mb-6">
                    <Text className="text-sm font-bold">Upcoming Fittings</Text>
                    <TouchableOpacity className="border border-black px-3 py-1 rounded-sm">
                        <Text className="text-[10px] font-bold uppercase">View Calendar</Text>
                    </TouchableOpacity>
                </View>

                <View className="gap-5">
                    {UPCOMING_FITTINGS.map((fitting) => (
                        <View key={fitting.id} className="flex-row items-center justify-between">
                            <View className="flex-row items-center flex-1">
                                <View className="w-12 h-12 rounded-2xl bg-[#F7F7F7] mr-4" />
                                <View className="flex-1">
                                    <Text className="text-xs font-bold mb-1">{fitting.name}</Text>
                                    <Text className="text-[10px] text-black/40">{fitting.type}</Text>
                                </View>
                            </View>

                            <View className="flex-row items-center">
                                <Ionicons name="time-outline" size={12} color="#EB5757" />
                                <Text className="text-[9px] font-bold text-[#EB5757] ml-1.5">{fitting.time}</Text>
                            </View>
                        </View>
                    ))}
                </View>
            </View>
          </>
        )}
      </ScrollView>

      <FigmaConfirmModal
        visible={deleteModalOpen}
        onClose={() => (isDeleting ? null : setDeleteModalOpen(false))}
        title="Delete Dress Listing?"
        description="Are you sure you want to delete this dress form your catalog? This action can not be undone and the listing will no longer be visible to brides."
        iconName="trash"
        tone="danger"
        leftButtonText={isDeleting ? 'DELETING...' : 'ACCEPT'}
        onLeftPress={() => (isDeleting ? null : handleDeleteDress())}
        rightButtonText="CANCEL"
        onRightPress={() => (isDeleting ? null : setDeleteModalOpen(false))}
      />
    </View>
  );
}
