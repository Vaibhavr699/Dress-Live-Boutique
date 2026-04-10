import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions, Switch, ActivityIndicator, Platform, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '@shared/store/useAuthStore';
import { api } from '@shared/api/api';

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
  const BOUTIQUE_ID = 1;
  
  const [loading, setLoading] = useState(true);
  const [dresses, setDresses] = useState<any[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [isStoreVisible, setIsStoreVisible] = useState(true);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);

  const fetchDresses = useCallback(async () => {
    try {
      const data = await api.get(`/dresses/?boutique_id=${BOUTIQUE_ID}`);
      setDresses(data);
    } catch (error) {
      console.error('Failed to fetch dresses:', error);
    } finally {
      setLoading(false);
    }
  }, [BOUTIQUE_ID]);

  const fetchBoutiqueVisibility = useCallback(async () => {
    try {
      const boutique = await api.get(`/boutiques/${BOUTIQUE_ID}`);
      setIsStoreVisible(boutique.is_visible_to_customers ?? true);
    } catch (error) {
      console.error('Failed to fetch boutique visibility:', error);
    }
  }, [BOUTIQUE_ID]);

  const handleStoreVisibilityChange = useCallback(
    async (value: boolean) => {
      const previousValue = isStoreVisible;
      setIsStoreVisible(value);
      setIsUpdatingVisibility(true);

      try {
        await api.put(`/boutiques/${BOUTIQUE_ID}`, {
          is_visible_to_customers: value,
        });
      } catch (error: any) {
        setIsStoreVisible(previousValue);
        Alert.alert('Update Failed', error.message || 'Could not update customer visibility.');
      } finally {
        setIsUpdatingVisibility(false);
      }
    },
    [BOUTIQUE_ID, isStoreVisible]
  );

  useFocusEffect(
    useCallback(() => {
      fetchDresses();
      fetchBoutiqueVisibility();
    }, [fetchDresses, fetchBoutiqueVisibility])
  );

  return (
    <View className="flex-1 bg-white">
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}
      >
        {/* Header Section */}
        <View style={{ paddingTop: insets.top + 20 }} className="px-6 pb-6">
            <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-bold tracking-[0.5px]">Shop Dashboard</Text>
            </View>
            
            <View className="flex-row items-center justify-between mt-4">
                <View className="flex-row items-center">
                    <View className="w-10 h-10 rounded-full bg-gray-100 overflow-hidden mr-3">
                        <Image 
                            source={require('../../assets/images/avatar.png')}
                            style={{ width: '100%', height: '100%' }}
                        />
                    </View>
                    <View>
                        <Text className="text-[10px] text-black/40">Good morning</Text>
                        <Text className="text-sm font-bold">{user?.full_name || 'Elife Torzi'}</Text>
                    </View>
                </View>
                <View className="flex-row items-center">
                    <View className={`w-1.5 h-1.5 rounded-full mr-2 ${isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <Text className={`text-[10px] font-bold ${isOnline ? 'text-green-500' : 'text-gray-400'}`}>
                        {isOnline ? 'Online' : 'Offline'}
                    </Text>
                </View>
            </View>
        </View>

        {/* Shop Status Section */}
        <View className="px-6 mb-8">
            <Text className="text-[10px] font-bold uppercase tracking-[1px] mb-4 text-black/50">Shop Status</Text>
            <View className="bg-gray-50 border border-gray-100 p-4 rounded-2xl flex-row items-center justify-between">
                <View className="flex-row items-center">
                    <View className="w-10 h-10 rounded-full bg-white items-center justify-center mr-3">
                        <Ionicons name="eye-outline" size={20} color="black" />
                    </View>
                    <View>
                        <Text className="text-xs font-bold mb-0.5">Set Customer Visibility</Text>
                        <Text className="text-[10px] text-black/40">Customers can see your shop</Text>
                    </View>
                </View>
                <Switch 
                    value={isStoreVisible} 
                    onValueChange={handleStoreVisibilityChange}
                    disabled={isUpdatingVisibility}
                    trackColor={{ false: '#E0E0E0', true: '#27AE60' }}
                    thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : '#FFFFFF'}
                />
            </View>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center py-20">
            <ActivityIndicator color="black" />
          </View>
        ) : dresses.length === 0 ? (
          <View className="flex-1 items-center justify-center py-20 px-10">
            <View className="w-20 h-20 items-center justify-center mb-6">
                <MaterialCommunityIcons name="hanger" size={60} color="black" />
            </View>
            <Text className="text-lg font-bold mb-2 text-center">Add Your First Catalog Dress</Text>
            <Text className="text-xs text-black/40 text-center mb-8 leading-5">
              Customers can see your catalog dresses and shop address.
            </Text>
            <TouchableOpacity 
              onPress={() => router.push('/add-dress')}
              className="border border-black px-12 py-4 rounded-sm"
              activeOpacity={0.7}
            >
              <Text className="text-[10px] font-bold uppercase tracking-[2px]">Add Dress</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View className="mb-10">
                <View className="px-6 mb-4 flex-row justify-between items-end">
                    <View className="flex-1">
                        <Text className="text-sm font-bold mb-1">Dresses Catalog Listings</Text>
                        <Text className="text-[10px] text-black/40">Manage your bridal orders, designs, and customer requests.</Text>
                    </View>
                    <TouchableOpacity 
                        onPress={() => router.push('/add-dress')}
                        className="bg-black w-8 h-8 rounded-full items-center justify-center mb-1"
                    >
                        <Ionicons name="add" size={20} color="white" />
                    </TouchableOpacity>
                </View>
                <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingLeft: 24, paddingRight: 8 }}
                >
                    {dresses.map((dress) => (
                        <View key={dress.id} className="mr-4" style={{ width: width * 0.7 }}>
                            <View className="relative">
                                <Image 
                                    source={dress.image_url ? { uri: dress.image_url } : require('../../assets/images/Dashboard image 2.png')} 
                                    style={{ width: '100%', height: 180, borderRadius: 24 }}
                                    contentFit="cover"
                                />
                                <View className="absolute right-4 bottom-4 flex-row gap-2">
                                    <TouchableOpacity className="w-8 h-8 rounded-full bg-white items-center justify-center shadow-sm">
                                        <Feather name="edit-2" size={14} color="black" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                            <View className="mt-4">
                                <Text className="text-sm font-bold mb-0.5">{dress.name}</Text>
                                <Text className="text-[10px] text-black/40">{dress.colors || 'All Colors'} • {dress.sizes || 'All Sizes'}</Text>
                            </View>
                        </View>
                    ))}
                </ScrollView>
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
                        <View key={order.id} className="flex-row items-center justify-between">
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
                                        <View className="bg-black/5 px-2 py-0.5 rounded-sm">
                                            <Text className="text-[8px] font-bold uppercase">{order.status === 'New' ? 'New' : order.status}</Text>
                                        </View>
                                    </View>
                                    <Text className="text-[10px] text-black/40 mb-1">{order.type} - {order.date}</Text>
                                    <Text className="text-xs font-bold">{order.price}</Text>
                                </View>
                            </View>
                            <View className="items-end">
                                <Text className="text-[9px] font-bold opacity-70 mb-1" style={{ color: order.statusColor }}>{order.status}</Text>
                                <Ionicons name="chevron-forward" size={14} color="#E0E0E0" />
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
    </View>
  );
}
