import React from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAuthStore } from '@shared/store/useAuthStore';

const MENU_ITEMS = [
  { label: 'Business Adresse', route: '/edit-address' },
  { label: 'Payment Methods', route: '/payment-methods' },
  { label: 'Earning Wallet', route: '/earning-wallet' },
  { label: 'Business Hours Availability', route: '/store-opening-hours' },
  { label: 'Security And Password', route: '/security-password' },
  { label: 'Delete Account', route: '/delete-account' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { logout } = useAuthStore();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: 120 }}
      >
        <View className="px-5 items-center mb-6">
          <Text className="text-[16px] text-black" style={{ fontFamily: 'Helvetica Neue', fontWeight: '400' }}>
            Business Profile Details
          </Text>
        </View>

        <View className="px-5">
          <View className="border-t border-[#EDEDED] pt-8">
            <View className="flex-row items-start justify-between mb-10">
              <View className="flex-row flex-1">
                <Image
                  source={require('../../assets/images/avatar.png')}
                  style={{ width: 90, height: 90 }}
                  contentFit="cover"
                />
                <View className="ml-4 justify-center">
                  <Text className="text-[12px] text-black/50 mb-1">Shop Name:</Text>
                  <Text className="text-[16px] text-black" style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}>
                    Parla Weddings
                  </Text>
                </View>
              </View>

              <TouchableOpacity onPress={() => router.push('/business-profile-edit')} className="mt-2">
                <Feather name="edit-2" size={18} color="#1A1A1A" />
              </TouchableOpacity>
            </View>

            <View className="mb-10">
              <Text className="text-[12px] uppercase tracking-[1px] text-black/75 mb-5">Owner Information</Text>
              <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">Email</Text>
              <Text className="text-[14px] text-black/80 mb-5">example@gmail.com</Text>
              <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">Phone Number</Text>
              <Text className="text-[14px] text-black/80">+49 300 111 222 3333</Text>
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
          </View>
        </View>
      </ScrollView>

      <View className="px-5 pb-8">
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            logout();
            router.replace('/');
          }}
          className="flex-row items-center"
        >
          <Ionicons name="log-out-outline" size={18} color="#FF3B30" />
          <Text className="text-[14px] text-[#FF3B30] ml-2">Logout</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
