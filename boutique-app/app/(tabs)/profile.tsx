import React, { useCallback, useState } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAuthStore } from '@shared/store/useAuthStore';
import { api } from '@shared/api/api';

const LOGOUT_ICON = require('../../assets/svg/Logout.svg');

const MENU_ITEMS = [
  { label: 'Business Adresse', route: '/edit-address' },
  // Payment methods moved into Earning Wallet — the partner now connects
  // a bank account via Stripe Connect from there instead of a separate
  // mock screen.
  { label: 'Earning Wallet', route: '/earning-wallet' },
  { label: 'Business Hours Availability', route: '/store-opening-hours' },
  { label: 'Security And Password', route: '/security-password' },
  { label: 'Delete Account', route: '/delete-account' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { logout, user, setUser } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [boutique, setBoutique] = useState<{
    name?: string | null;
    location?: string | null;
    logo_url?: string | null;
    header_image_url?: string | null;
    interior_image_url?: string | null;
  } | null>(null);

  const loadProfile = useCallback(async () => {
    const token = useAuthStore.getState().token;
    let boutiqueId = user?.boutique_id ?? null;

    if (token) {
      try {
        const fresh = await api.get('/users/me');
        setUser(fresh as any);
        boutiqueId = (fresh as { boutique_id?: number | null }).boutique_id ?? boutiqueId;
      } catch (error) {
        console.error('Failed to refresh user for profile:', error);
      }
    }

    if (!boutiqueId) {
      setBoutique(null);
      setLoading(false);
      return;
    }

    try {
      const data = await api.get(`/boutiques/${boutiqueId}`);
      setBoutique(data);
    } catch (error) {
      console.error('Failed to load boutique profile:', error);
      setBoutique(null);
    } finally {
      setLoading(false);
    }
  }, [user?.boutique_id, setUser]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadProfile();
    }, [loadProfile])
  );

  const profileImageSource =
    user?.profile_image_url || boutique?.logo_url
      ? { uri: user?.profile_image_url || boutique?.logo_url || '' }
      : require('../../assets/images/avatar.png');
  const coverImageSource =
    boutique?.header_image_url
      ? { uri: boutique.header_image_url }
      : null;
  const interiorImageSource = boutique?.interior_image_url
    ? { uri: boutique.interior_image_url }
    : null;

  const ownerPhone = [user?.country_code, user?.phone].filter(Boolean).join(' ').trim();
  const ownerAddress = [
    user?.address,
    user?.apartment_number,
    user?.region,
    user?.state_province,
    user?.postal_code,
  ]
    .filter(Boolean)
    .join(', ')
    .trim();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: Math.max(24, insets.bottom + 24) }}
      >
        <View className="px-5 items-center mb-6">
          <Text className="text-[16px] text-black" style={{ fontFamily: 'Helvetica Neue', fontWeight: '400' }}>
            Business Profile Details
          </Text>
        </View>

        <View className="px-5">
          <View className="border-t border-[#EDEDED] pt-8">
            {loading ? (
              <View className="py-16 items-center">
                <ActivityIndicator color="#1A1A1A" />
                <Text className="text-[11px] text-black/45 mt-4">Loading profile…</Text>
              </View>
            ) : (
              <>
                <View className="mb-10">
                  <View className="relative">
                    <View className="h-[140px] border border-[#EDEDED] overflow-hidden bg-[#F6F6F6]">
                      {coverImageSource ? (
                        <Image source={coverImageSource} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                      ) : (
                        <View className="flex-1 items-center justify-center">
                          <Text className="text-[11px] text-black/30 uppercase tracking-[1px]">No cover image</Text>
                        </View>
                      )}
                    </View>

                    <View className="absolute left-4 -bottom-10 border-4 border-white bg-white">
                      <Image
                        source={profileImageSource}
                        style={{ width: 90, height: 90 }}
                        contentFit="cover"
                      />
                    </View>

                    <TouchableOpacity onPress={() => router.push('/business-profile-edit')} className="absolute top-3 right-3 bg-white/90 w-9 h-9 items-center justify-center">
                      <Feather name="edit-2" size={18} color="#1A1A1A" />
                    </TouchableOpacity>
                  </View>

                  {interiorImageSource ? (
                    <View className="mt-3">
                      <Text
                        className="text-[10px] text-black/40 uppercase tracking-[0.6px] mb-2"
                        style={{ fontFamily: 'Helvetica Neue' }}
                      >
                        Store interior
                      </Text>
                      <View className="h-[100px] border border-[#EDEDED] overflow-hidden bg-[#F6F6F6]">
                        <Image
                          source={interiorImageSource}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                        />
                      </View>
                    </View>
                  ) : null}

                  <View className="pt-14 px-1">
                    <Text className="text-[12px] text-black/50 mb-1">Shop Name:</Text>
                    <Text className="text-[16px] text-black" style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}>
                      {boutique?.name || 'Not available'}
                    </Text>
                    {boutique?.location ? (
                      <Text className="text-[11px] text-black/45 mt-2">{boutique.location}</Text>
                    ) : null}
                  </View>
                </View>

                <View className="mb-10">
                  <Text className="text-[12px] uppercase tracking-[1px] text-black/75 mb-5">Owner Information</Text>
                  <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">Full Name</Text>
                  <Text className="text-[14px] text-black/80 mb-5">{user?.full_name || 'Not available'}</Text>
                  <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">Email</Text>
                  <Text className="text-[14px] text-black/80 mb-5">{user?.email || 'Not available'}</Text>
                  <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">Phone Number</Text>
                  <Text className="text-[14px] text-black/80 mb-5">{ownerPhone || 'Not added yet'}</Text>
                  <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">Address</Text>
                  <Text className="text-[14px] text-black/80">{ownerAddress || 'Not added yet'}</Text>
                </View>

                {MENU_ITEMS.map((item) => (
                  <TouchableOpacity
                    key={item.label}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (item.route) {
                        router.push(item.route as any);
                      }
                    }}
                    className="flex-row items-center justify-between py-3"
                  >
                    <Text className="text-[13px] uppercase tracking-[0.5px] text-black/85">{item.label}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#1A1A1A" />
                  </TouchableOpacity>
                ))}

                <View className="mt-10">
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      logout();
                      router.replace('/landing');
                    }}
                    className="flex-row items-center"
                  >
                    <Image
                      source={LOGOUT_ICON}
                      style={{ width: 18, height: 18, tintColor: '#FF3B30' }}
                      contentFit="contain"
                    />
                    <Text className="text-[14px] text-[#FF3B30] ml-2">Logout</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
