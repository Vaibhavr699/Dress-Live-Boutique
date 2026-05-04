import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SvgXml } from 'react-native-svg';
import { useAuthStore } from '@shared/store/useAuthStore';
import { api } from '@shared/api/api';
import { FigmaConfirmModal } from '../../components/FigmaConfirmModal';

const { width } = Dimensions.get('window');

const DRESS_SVG = `<svg width="32" height="34" viewBox="0 0 32 34" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M29.4255 20.7868C31.2232 21.9683 31.6836 24.3851 30.4922 26.1772C27.2707 31.0222 21.5446 34.1119 15.5691 34.0893C9.59357 34.1119 3.88157 30.7629 0.660067 25.9179C-0.53135 24.1258 -0.0709332 21.7104 1.72682 20.5289L9.9024 15.5848H21.2357L29.4255 20.7868ZM9.9024 12.75H21.2357L22.2812 9.61633C22.5277 8.5085 22.6524 7.37092 22.6524 6.23617V1.41667C22.6524 0.634667 22.0177 0 21.2357 0C20.4537 0 19.8191 0.634667 19.8191 1.41667V2.975C17.9349 3.32492 16.4856 4.29958 15.5691 5.11558C14.6525 4.29958 13.2032 3.32492 11.3191 2.975V1.41667C11.3191 0.634667 10.6844 0 9.9024 0C9.1204 0 8.48573 0.634667 8.48573 1.41667V6.23617C8.48573 7.37092 8.6104 8.5085 8.8569 9.61633L9.9024 12.75Z" fill="black"/>
</svg>`;

const PENCIL_ICON = require('../../assets/svg/pencil.svg');
const TRASH_ICON = require('../../assets/svg/trash.svg');

const EMPTY_CATALOG_TITLE_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '400' as const,
  fontSize: 16,
  lineHeight: 16,
  letterSpacing: 0,
  textAlign: 'center' as const,
  color: '#000000',
};

const EMPTY_CATALOG_SUBTITLE_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '400' as const,
  fontSize: 14,
  lineHeight: 24,
  letterSpacing: 0,
  textAlign: 'center' as const,
  color: '#000000',
};

const DASHBOARD_TITLE_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '500' as const,
  fontSize: 18,
  lineHeight: 18,
  letterSpacing: 0,
  color: '#000000',
  textAlign: 'center' as const,
};

const STATUS_CARD_TEXT_REGULAR_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '400' as const,
  fontSize: 14,
  lineHeight: 14,
  letterSpacing: 0,
  color: '#6E6E6E',
};

const STATUS_CARD_TEXT_MEDIUM_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '500' as const,
  fontSize: 14,
  lineHeight: 14,
  letterSpacing: 0,
  color: '#000000',
};

const VISIBILITY_SUBTITLE_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '400' as const,
  fontSize: 12,
  lineHeight: 14,
  letterSpacing: 0,
  color: '#000000',
};

const ADD_DRESS_BUTTON_TEXT_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '500' as const,
  fontSize: 14,
  lineHeight: 14,
  letterSpacing: 0.56,
  textTransform: 'uppercase' as const,
  color: '#000000',
};

const SECTION_TITLE_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '500' as const,
  fontSize: 16,
  lineHeight: 16,
  letterSpacing: 0,
  color: '#000000',
};

const SECTION_SUBTITLE_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '400' as const,
  fontSize: 14,
  lineHeight: 24,
  letterSpacing: 0,
  color: '#6E6E6E',
};

const DASHBOARD_SECTION_HEADING_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '400' as const,
  fontSize: 18,
  lineHeight: 18,
  letterSpacing: 0,
  color: '#000000',
};

const VIEW_ALL_TEXT_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '400' as const,
  fontSize: 14,
  lineHeight: 14,
  letterSpacing: 0.56,
  textTransform: 'uppercase' as const,
  color: '#000000',
};

const RECENT_ORDER_TITLE_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '500' as const,
  fontSize: 14,
  lineHeight: 14,
  letterSpacing: 0,
  color: '#000000',
};

const RECENT_ORDER_DESCRIPTION_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '400' as const,
  fontSize: 12,
  lineHeight: 12,
  letterSpacing: 0,
  color: '#6E6E6E',
};

const CUSTOM_REQUEST_TITLE_STYLE = {
  fontFamily: 'Inter',
  fontWeight: '500' as const,
  fontSize: 16,
  lineHeight: 16,
  letterSpacing: 0,
  color: '#000000',
};

const CUSTOM_REQUEST_SUBTITLE_STYLE = {
  fontFamily: 'Inter',
  fontWeight: '400' as const,
  fontSize: 12,
  lineHeight: 12,
  letterSpacing: 0,
  color: '#6E6E6E',
};

const CATALOG_CARD_NAME_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '500' as const,
  fontSize: 14,
  lineHeight: 14,
  letterSpacing: 2,
  color: '#000000',
};

const CATALOG_CARD_ADDRESS_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '400' as const,
  fontSize: 14,
  lineHeight: 14,
  letterSpacing: 0,
  color: '#6E6E6E',
};

type BookingStatus = 'requested' | 'accepted' | 'rejected' | 'rescheduled' | 'completed';

type Booking = {
  id: number;
  appointment_type: 'video' | 'in_store';
  status: BookingStatus;
  scheduled_for: string;
  language: string;
  location?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  dress_ids: number[];
  customer?: {
    id: number;
    full_name?: string | null;
    email: string;
    profile_image_url?: string | null;
  } | null;
  dresses?: Array<{
    id: number;
    name: string;
    price: number;
    colors?: string | null;
    sizes?: string | null;
    image_url?: string | null;
  }> | null;
  boutique?: {
    id: number;
    name?: string | null;
    location?: string | null;
  } | null;
};

function parseScheduledFor(value?: string | null) {
  if (!value || !value.trim()) return null;
  const match = value.match(/^[A-Za-z]+,\s*(\d{1,2})\s+([A-Za-z]{3})\s*-\s*(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) return null;
  const day = Number(match[1]);
  const monthShort = match[2].toLowerCase();
  const hour12 = Number(match[3]);
  const minute = Number(match[4]);
  const suffix = match[5].toUpperCase();
  const monthIndex = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(monthShort);
  if (monthIndex < 0) return null;
  let hour24 = hour12 % 12;
  if (suffix === 'PM') hour24 += 12;
  const now = new Date();
  let year = now.getFullYear();
  let date = new Date(year, monthIndex, day, hour24, minute, 0, 0);
  if (date.getTime() < now.getTime() - 1000 * 60 * 60 * 24 * 30) {
    year += 1;
    date = new Date(year, monthIndex, day, hour24, minute, 0, 0);
  }
  return Number.isNaN(date.getTime()) ? null : date;
}

function customerName(booking: Booking) {
  return booking.customer?.full_name || booking.customer?.email || 'Customer';
}

function bookingDressSummary(booking: Booking) {
  return booking.dresses?.length
    ? booking.dresses.map((dress) => dress.name).join(', ')
    : `${booking.dress_ids.length} selected dress(es)`;
}

function bookingTotalLabel(booking: Booking) {
  const total = booking.dresses?.reduce((sum, dress) => sum + (Number(dress.price) || 0), 0) ?? 0;
  if (total > 0) return `$${total.toLocaleString()}`;
  return `${booking.dress_ids.length} item${booking.dress_ids.length === 1 ? '' : 's'}`;
}

function formatCityCountry(location?: string | null) {
  const raw = (location || '').trim();
  if (!raw) return 'Location unavailable';

  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const country = parts[parts.length - 1];
    const city =
      [...parts.slice(0, -1)].reverse().find((part) => !/\d/.test(part)) ||
      parts[parts.length - 2];
    return `${city}, ${country}`;
  }

  return raw;
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Good evening';
}

function bookingStatusLabel(status: BookingStatus) {
  switch (status) {
    case 'requested':
      return 'New';
    case 'accepted':
      return 'Accepted';
    case 'rescheduled':
      return 'Rescheduled';
    case 'completed':
      return 'Completed';
    case 'rejected':
      return 'Rejected';
    default:
      return status;
  }
}

export default function BoutiqueDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const boutiqueId = user?.boutique_id ?? null;
  
  const [loading, setLoading] = useState(true);
  const [dresses, setDresses] = useState<any[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isStoreVisible, setIsStoreVisible] = useState(true);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [boutique, setBoutique] = useState<{
    name?: string | null;
    location?: string | null;
    logo_url?: string | null;
  } | null>(null);
  const [timeGreeting, setTimeGreeting] = useState(getTimeGreeting);

  useEffect(() => {
    setTimeGreeting(getTimeGreeting());
    const id = setInterval(() => setTimeGreeting(getTimeGreeting()), 60_000);
    return () => clearInterval(id);
  }, []);

  const avatarUri = useMemo(() => {
    const fromUrl = user?.profile_image_url?.trim();
    if (fromUrl) return fromUrl;
    const fromLocal = user?.profile_image_uri?.trim();
    if (fromLocal) return fromLocal;
    const fromBoutique = boutique?.logo_url?.trim();
    return fromBoutique || null;
  }, [user?.profile_image_url, user?.profile_image_uri, boutique?.logo_url]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    if (!boutiqueId) {
      setDresses([]);
      setBookings([]);
      setLoading(false);
      return;
    }

    try {
      const [dressData, bookingData] = await Promise.all([
        api.get(`/dresses/?boutique_id=${boutiqueId}`),
        api.get('/bookings/partner'),
      ]);
      setDresses(Array.isArray(dressData) ? dressData : []);
      setBookings(Array.isArray(bookingData) ? (bookingData as Booking[]) : []);
    } catch (error) {
      console.error('Failed to fetch boutique dashboard data:', error);
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

  const refreshCurrentUser = useCallback(async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    try {
      const fresh = await api.get('/users/me');
      setUser(fresh as any);
    } catch (error) {
      console.error('Failed to refresh current user:', error);
    }
  }, [setUser]);

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
      void refreshCurrentUser();
      fetchDashboardData();
      fetchBoutiqueVisibility();
    }, [refreshCurrentUser, fetchDashboardData, fetchBoutiqueVisibility])
  );

  const selectedDressForDelete = dresses[0] ?? null;

  const handleDeleteDress = useCallback(async () => {
    if (!selectedDressForDelete?.id) return;
    setIsDeleting(true);
    try {
      await api.delete(`/dresses/${selectedDressForDelete.id}`);
      setDeleteModalOpen(false);
      setLoading(true);
      await fetchDashboardData();
    } catch (error: any) {
      Alert.alert('Delete Failed', error?.message || 'Could not delete this dress listing.');
    } finally {
      setIsDeleting(false);
    }
  }, [fetchDashboardData, selectedDressForDelete?.id]);

  const sortedBookings = useMemo(() => {
    return [...bookings].sort((a, b) => {
      const aDate =
        parseScheduledFor(a.scheduled_for)?.getTime() ||
        Date.parse(a.updated_at || a.created_at || '') ||
        0;
      const bDate =
        parseScheduledFor(b.scheduled_for)?.getTime() ||
        Date.parse(b.updated_at || b.created_at || '') ||
        0;
      return bDate - aDate;
    });
  }, [bookings]);

  const recentOrders = useMemo(() => sortedBookings.slice(0, 5), [sortedBookings]);
  const customRequests = useMemo(
    () => sortedBookings.filter((booking) => booking.status === 'requested').slice(0, 3),
    [sortedBookings]
  );
  const upcomingFittings = useMemo(() => {
    return sortedBookings
      .filter((booking) => ['accepted', 'rescheduled'].includes(booking.status))
      .sort((a, b) => {
        const aTime = parseScheduledFor(a.scheduled_for)?.getTime() || Number.MAX_SAFE_INTEGER;
        const bTime = parseScheduledFor(b.scheduled_for)?.getTime() || Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      })
      .slice(0, 4);
  }, [sortedBookings]);

  return (
    <View className="flex-1 bg-white">
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}
      >
        {/* Header */}
        <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 20, paddingBottom: 16 }} className="border-b border-[#F0F0F0]">
          <View className="items-center justify-center">
            <Text
              style={DASHBOARD_TITLE_STYLE}
            >
            Shop Dashboard
          </Text>
            {/* <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/notifications')}
              className="absolute right-0 top-0 w-10 h-10 items-center justify-center"
            >
              <Ionicons name="notifications-outline" size={20} color="#1A1A1A" />
              {unreadCount > 0 ? (
                <View className="absolute top-1 right-1 min-w-[18px] h-[18px] rounded-full bg-black items-center justify-center px-1">
                  <Text className="text-white text-[9px] font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity> */}
          </View>
        </View>

        {/* Greeting + Shop Status Card (Figma-style) */}
        <View style={{ paddingHorizontal: 20, paddingTop: 24, marginBottom: 10 }}>
          <View className="border border-black" style={{ height: 186 }}>
            <View className="flex-row items-center justify-between" style={{ height: 58, paddingHorizontal: 14 }}>
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-sm bg-gray-100 overflow-hidden mr-3">
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <Image source={require('../../assets/images/avatar.png')} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  )}
                </View>
                <View>
                  <Text style={[STATUS_CARD_TEXT_REGULAR_STYLE, { marginBottom: 4 }]}>{timeGreeting}</Text>
                  <Text style={STATUS_CARD_TEXT_MEDIUM_STYLE}>
                    {user?.full_name?.trim() || user?.email || 'Partner'}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center">
                <View className={`w-2 h-2 rounded-full mr-2 ${isStoreVisible ? 'bg-green-500' : 'bg-black/40'}`} />
                <Text style={STATUS_CARD_TEXT_REGULAR_STYLE}>{isStoreVisible ? 'Online' : 'Offline'}</Text>
              </View>
            </View>

            <View className="h-px bg-black/10" />

            <View style={{ paddingHorizontal: 14, paddingTop: 14 }}>
              <Text style={[STATUS_CARD_TEXT_MEDIUM_STYLE, { textTransform: 'uppercase', marginBottom: 14 }]}>
                Shop Status
              </Text>

              <View className="border border-black justify-center" style={{ height: 72, paddingHorizontal: 14 }}>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center flex-1 pr-4">
                    <View className="w-8 h-8 items-center justify-center mr-3">
                      <Ionicons name="eye-outline" size={18} color="black" />
                    </View>
                    <View className="flex-1">
                      <Text style={[STATUS_CARD_TEXT_MEDIUM_STYLE, { marginBottom: 6 }]}>
                        Set Customer Visibility
                      </Text>
                      <Text style={{ fontFamily: 'Helvetica Neue', fontWeight: '400' as const, fontSize: 12, lineHeight: 14, letterSpacing: 0, color: '#6E6E6E' }}>Customers can see your shop</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handleStoreVisibilityChange(!isStoreVisible)}
                    disabled={isUpdatingVisibility}
                    style={{
                      width: 30,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: isStoreVisible ? '#86EFAC' : '#D9D9D9',
                      justifyContent: 'center',
                      paddingHorizontal: 2,
                      opacity: isUpdatingVisibility ? 0.6 : 1,
                    }}
                  >
                    <View
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        borderColor: '#000000',
                        transform: [{ translateX: isStoreVisible ? 10 : 0 }],
                      }}
                    />
                  </TouchableOpacity>
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
              <SvgXml xml={DRESS_SVG} width={48} height={51} />
            </View>
            <Text className="mb-2" style={EMPTY_CATALOG_TITLE_STYLE}>
              Add Your First Catalog Dress
            </Text>
            <Text className="mb-8" style={EMPTY_CATALOG_SUBTITLE_STYLE}>
              Customers can see your catalog dresses and{'\n'}shop address.
            </Text>
            <TouchableOpacity 
              onPress={() => router.push('/add-dress')}
              className="border border-black items-center justify-center"
              style={{ width: 133, height: 48, paddingHorizontal: 24, paddingVertical: 4 }}
              activeOpacity={0.7}
            >
              <Text style={ADD_DRESS_BUTTON_TEXT_STYLE}>Add Dress</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Dresses Catalog Listings */}
            <View style={{ paddingHorizontal: 20, marginBottom: 24, marginTop: 24 }}>
              <Text style={[SECTION_TITLE_STYLE, { marginBottom: 6 }]}>
                Dresses Catalog Listings
              </Text>
              <Text style={[SECTION_SUBTITLE_STYLE, { marginBottom: 24 }]}>
                Manage your bridal orders, designs, and customer{'\n'}requests.
              </Text>

              <View className="border border-[#EAEAEA] bg-white" style={{ height: 196, overflow: 'hidden' }}>
                <Image
                  source={
                    dresses[0]?.image_url
                      ? { uri: dresses[0].image_url }
                      : require('../../assets/images/Dashboard image 2.png')
                  }
                  style={{ width: '100%', height: 148 }}
                  contentFit="cover"
                  cachePolicy="none"
                />
                <View className="px-4 flex-row items-center justify-between" style={{ height: 48 }}>
                  <View className="flex-1 pr-4">
                    <Text style={CATALOG_CARD_NAME_STYLE} numberOfLines={1}>
                      {boutique?.name || 'Boutique Partner'}
                    </Text>
                    <Text style={[CATALOG_CARD_ADDRESS_STYLE, { marginTop: 6 }]} numberOfLines={1}>
                      {formatCityCountry(boutique?.location)}
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <TouchableOpacity onPress={() => router.push('/business-profile-edit')} className="mr-3" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Image source={PENCIL_ICON} style={{ width: 16, height: 16 }} contentFit="contain" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setDeleteModalOpen(true)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      disabled={!selectedDressForDelete || isDeleting}
                      style={{ opacity: !selectedDressForDelete || isDeleting ? 0.4 : 1 }}
                    >
                      <Image source={TRASH_ICON} style={{ width: 16, height: 16 }} contentFit="contain" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>

            <View style={{ paddingHorizontal: 20, marginBottom: 40 }}>
                <View className="flex-row justify-between items-center" style={{ marginBottom: 24 }}>
                    <Text style={DASHBOARD_SECTION_HEADING_STYLE}>Recent Orders</Text>
                    <TouchableOpacity
                      className="border border-black items-center justify-center"
                      style={{ width: 110, height: 38, paddingHorizontal: 14, paddingVertical: 4 }}
                      onPress={() => router.push('/(tabs)/bookings')}
                    >
                        <Text style={VIEW_ALL_TEXT_STYLE} numberOfLines={1}>View All</Text>
                    </TouchableOpacity>
                </View>
                <View style={{ gap: 14, minHeight: recentOrders.length > 0 ? 476 : undefined }}>
                    {recentOrders.length === 0 ? (
                        <View className="border border-[#EAEAEA] px-4 py-5">
                          <Text className="text-[11px] text-black/45">No recent booking activity yet.</Text>
                        </View>
                    ) : recentOrders.map((order) => (
                        <View
                          key={order.id}
                          className="flex-row items-center justify-between"
                          style={{ height: 84 }}
                        >
                            <View className="flex-row items-center flex-1">
                                <View className="overflow-hidden mr-4" style={{ width: 70, height: 70 }}>
                                    <Image 
                                        source={
                                          order.dresses?.[0]?.image_url
                                            ? { uri: order.dresses[0].image_url }
                                            : require('../../assets/images/Dashboard image 2.png')
                                        }
                                        style={{ width: '100%', height: '100%' }}
                                        contentFit="cover"
                                    />
                                </View>
                                <View className="flex-1">
                                    <View className="flex-row items-center" style={{ marginBottom: 8 }}>
                                        <Text style={RECENT_ORDER_TITLE_STYLE} numberOfLines={1}>{customerName(order)}</Text>
                                    </View>
                                    <Text style={RECENT_ORDER_DESCRIPTION_STYLE} numberOfLines={1}>
                                      {bookingDressSummary(order)} · {order.scheduled_for}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    ))}
                </View>
            </View>

            <View style={{ paddingHorizontal: 20, marginBottom: 40 }}>
                <Text style={[DASHBOARD_SECTION_HEADING_STYLE, { marginBottom: 24 }]}>New Custom Requests</Text>
                <View style={{ gap: 14 }}>
                    {customRequests.length === 0 ? (
                      <View className="border border-[#EAEAEA] p-4 bg-white">
                        <Text className="text-[11px] text-black/45">No new custom requests right now.</Text>
                      </View>
                    ) : customRequests.map((request) => (
                        <View
                          key={request.id}
                          className="border border-black bg-white"
                          style={{ height: 164, paddingHorizontal: 18, paddingVertical: 16 }}
                        >
                            <Text style={[CUSTOM_REQUEST_TITLE_STYLE, { marginBottom: 10 }]} numberOfLines={1}>{customerName(request)}</Text>
                            <Text style={[CUSTOM_REQUEST_SUBTITLE_STYLE, { marginBottom: 12 }]} numberOfLines={1}>
                              {request.dresses?.[0]?.name || (request.appointment_type === 'video' ? 'Video consultation request' : 'Custom Bridesmaid Dress')}
                            </Text>

                            <View className="flex-row flex-wrap gap-2 mb-4">
                                {[
                                  request.scheduled_for ? `Time: ${request.scheduled_for}` : null,
                                  request.language ? `Language: ${request.language}` : null,
                                  request.dresses?.[0]?.name ? `Dress: ${request.dresses[0].name}` : `${request.dress_ids.length} dress(es)`,
                                ].filter(Boolean).map((tag) => (
                                    <View key={tag} className="border border-[#D9D9D9] rounded-full px-2.5 py-1">
                                        <Text className="text-[8px] text-black/60">{tag}</Text>
                                    </View>
                                ))}
                            </View>

                            <View className="flex-row gap-3">
                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    onPress={() => router.push('/(tabs)/bookings')}
                                    className="flex-1 bg-black rounded-full py-3 items-center justify-center"
                                >
                                    <Text className="text-[9px] font-bold uppercase tracking-[1.2px] text-white">
                                        Review Request
                                    </Text>
                                </TouchableOpacity>
                                {/* <TouchableOpacity
                                    activeOpacity={0.8}
                                    onPress={() => router.push('/notifications')}
                                    className="flex-1 border border-[#D9D9D9] rounded-full py-3 items-center justify-center"
                                >
                                    <Text className="text-[9px] font-bold uppercase tracking-[1.2px] text-black/70">
                                        Message Bride
                                    </Text>
                                </TouchableOpacity> */}
                            </View>
                        </View>
                    ))}
                </View>
            </View>

            <View style={{ paddingHorizontal: 20, marginBottom: 48 }}>
                <View className="flex-row justify-between items-center" style={{ marginBottom: 24 }}>
                    <Text style={DASHBOARD_SECTION_HEADING_STYLE}>Upcoming Fittings</Text>
                    <TouchableOpacity
                      className="border border-black items-center justify-center"
                      style={{ width: 147, height: 38, paddingHorizontal: 14, paddingVertical: 4 }}
                      onPress={() => router.push('/(tabs)/bookings')}
                    >
                        <Text style={VIEW_ALL_TEXT_STYLE}>View Calendar</Text>
                    </TouchableOpacity>
                </View>

                <View style={{ gap: 14 }}>
                    {upcomingFittings.length === 0 ? (
                      <View className="border border-[#EAEAEA] px-4 py-5">
                        <Text className="text-[11px] text-black/45">No upcoming fittings scheduled yet.</Text>
                      </View>
                    ) : upcomingFittings.map((fitting) => (
                        <View key={fitting.id} className="flex-row items-center justify-between" style={{ height: 64 }}>
                            <View className="flex-row items-center flex-1">
                                <View className="bg-[#F7F7F7] mr-4 overflow-hidden" style={{ width: 48, height: 48 }}>
                                  {fitting.customer?.profile_image_url ? (
                                    <Image source={{ uri: fitting.customer.profile_image_url }} style={{ width: '100%', height: '100%' }} />
                                  ) : null}
                                </View>
                                <View className="flex-1">
                                    <Text style={[RECENT_ORDER_TITLE_STYLE, { marginBottom: 8 }]} numberOfLines={1}>{customerName(fitting)}</Text>
                                    <Text style={RECENT_ORDER_DESCRIPTION_STYLE} numberOfLines={1}>
                                      {fitting.appointment_type === 'video' ? 'Video fitting' : 'Store fitting'}
                                    </Text>
                                </View>
                            </View>

                            <View className="flex-row items-center">
                                <Ionicons name="time-outline" size={12} color="#EB5757" />
                                <Text style={[RECENT_ORDER_DESCRIPTION_STYLE, { color: '#EB5757', marginLeft: 6 }]} numberOfLines={1}>{fitting.scheduled_for}</Text>
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
