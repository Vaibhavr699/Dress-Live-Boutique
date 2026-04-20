import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useAuthStore } from '@shared/store/useAuthStore';
import { useCartStore } from '@/store/useCartStore';
import { useShortlistStore } from '@/store/useShortlistStore';
import { useBookingHistoryStore } from '@/store/useBookingHistoryStore';

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { logout, user, isAuthenticated } = useAuthStore();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const clearCart = useCartStore((state) => state.clearCart);
  const clearShortlist = useShortlistStore((state) => state.clear);
  const clearBookingHistory = useBookingHistoryStore((state) => state.clear);

  const menuItems = [
    { label: 'ADRESSES', route: '/profile-edit-address' },
    { label: 'MY MEASUREMENTS', route: '/profile-my-measurements' },
    { label: 'PAYMENT METHODS', route: '/profile-payment-methods' },
    { label: 'BOOKING HISTORY', route: '/booking-history' },
  ];

  const handleLogout = () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    setTimeout(() => {
      clearCart();
      clearShortlist();
      clearBookingHistory();
      logout();
      router.replace('/landing');
    }, 220);
  };



  return (
    <Animated.View
      className="flex-1 bg-white"
      entering={FadeIn.duration(250)}
      exiting={FadeOut.duration(220)}
    >
      {/* Header */}
      <View 
        className="px-6 items-center border-b border-[#F0F0F0] pb-4" 
        style={{ paddingTop: insets.top + 10 }}
      >
        <Text className="text-black text-sm font-bold uppercase tracking-[2px]">
          Profile Details
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
        {!isAuthenticated ? (
          <View className="px-8 pt-14">
            <Text className="text-black text-[16px] font-medium mb-3">Welcome</Text>
            <Text className="text-black/50 text-[12px] leading-5 mb-10">
              Log in or create an account to manage your profile, save your selection, and book an appointment.
            </Text>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => router.push('/auth-choice')}
              className="w-full bg-black py-4 items-center justify-center mb-4"
            >
              <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">Log In / Sign Up</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.replace('/(tabs)')}
              className="w-full border border-black py-4 items-center justify-center"
            >
              <Text className="text-black text-[12px] font-bold tracking-[2px] uppercase">Continue Browsing</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* User Info Card */}
            <View className="px-8 pt-10 pb-8">
          <View className="flex-row items-center relative">
            <Image
              source={
                user?.profile_image_url || user?.profile_image_uri
                  ? { uri: user?.profile_image_url || user?.profile_image_uri || '' }
                  : require('@/assets/images/Dashboard image 2.png')
              }
              style={{ width: 64, height: 64, borderRadius: 2 }}
              contentFit="cover"
            />

            <View className="ml-6 flex-1">
              <Text className="text-black text-[16px] font-medium">{user?.full_name || 'Elif Terzi'}</Text>
              <Text className="text-black/40 text-[12px] mt-1">{user?.email || 'example@gmail.com'}</Text>
            </View>

            <TouchableOpacity
              className="absolute top-0 right-0"
              onPress={() =>
                router.push({
                  pathname: '/profile-edit-address',
                  params: { source: 'profile' },
                })
              }
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="edit-3" size={18} color="black" />
            </TouchableOpacity>
          </View>
            </View>

            {/* Menu List */}
            <View className="px-8">
          {menuItems.map((item, idx) => (
            <TouchableOpacity 
              key={idx}
              onPress={() =>
                router.push({
                  pathname: item.route as any,
                  params: { source: 'profile' },
                })
              }
              className="py-5 flex-row justify-between items-center bg-white"
            >
              <Text className="text-black/30 text-[10px] font-bold uppercase tracking-[1px]">{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color="black" />
            </TouchableOpacity>
          ))}
            </View>

            {/* Personal Info */}
            <View className="px-8 mt-8">
          <Text className="text-black/30 text-[10px] font-bold uppercase mb-6 tracking-[1px]">Personal Information</Text>
          
          <View className="mb-6">
            <Text className="text-black/30 text-[9px] font-bold uppercase mb-1 tracking-[0.5px]">Email</Text>
            <Text className="text-black text-[13px]">{user?.email || 'example@gmail.com'}</Text>
          </View>

          <View className="mb-8">
            <Text className="text-black/30 text-[9px] font-bold uppercase mb-1 tracking-[0.5px]">Phone Number</Text>
            <Text className="text-black text-[13px]">{user?.phone || 'Not added yet'}</Text>
          </View>

          <TouchableOpacity 
            onPress={() =>
              router.push({
                pathname: '/profile-security-password',
                params: { source: 'profile' },
              })
            }
            className="py-5 border-t border-[#F0F0F0] flex-row justify-between items-center"
          >
            <Text className="text-black/30 text-[10px] font-bold uppercase tracking-[1px]">Security and Password</Text>
            <Ionicons name="chevron-forward" size={16} color="black" />
          </TouchableOpacity>


          <TouchableOpacity 
            onPress={() =>
              router.push({
                pathname: '/profile-delete-account',
                params: { source: 'profile' },
              })
            }
            className="py-5 border-t border-[#F0F0F0] flex-row justify-between items-center"
          >
            <Text className="text-black/30 text-[10px] font-bold uppercase tracking-[1px]">Delete Account</Text>
            <Ionicons name="chevron-forward" size={16} color="black" />
          </TouchableOpacity>

        </View>

        <View className="h-24" />
          </>
        )}
      </ScrollView>

      <View className="px-8 pb-10">
        {isAuthenticated ? (
          <TouchableOpacity
            onPress={handleLogout}
            disabled={isLoggingOut}
            className="flex-row items-center"
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="logout" size={18} color="#FF3B30" />
            <Text className="text-[#FF3B30] text-[12px] font-bold ml-3">Logout</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {isLoggingOut ? (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(180)}
          className="absolute inset-0 items-center justify-center bg-white/80"
        >
          <ActivityIndicator size="small" color="#1A1A1A" />
          <Text className="mt-4 text-[#1A1A1A] text-[11px] font-bold uppercase tracking-[2px]">
            Signing Out
          </Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}


