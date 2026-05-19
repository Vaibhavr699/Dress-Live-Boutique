import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@shared/api/api';
import { useAuthStore } from '@shared/store/useAuthStore';
import { useCartStore } from '@/store/useCartStore';
import { useShortlistStore } from '@/store/useShortlistStore';
import { useBookingHistoryStore } from '@/store/useBookingHistoryStore';

const LOGOUT_ICON = require('@/assets/svg/Logout.svg');

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { logout, user, isAuthenticated, setUser } = useAuthStore();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const clearCart = useCartStore((state) => state.clearCart);
  const clearShortlist = useShortlistStore((state) => state.clear);
  const clearBookingHistory = useBookingHistoryStore((state) => state.clear);

  // Tap the avatar → pick a new photo from the library → upload to
  // Supabase via /users/me/profile-image → store returns the public URL
  // which we shove into the auth store so the avatar refreshes locally.
  const handlePickAndUploadPhoto = async () => {
    if (isUploadingPhoto) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Photo access needed',
          'Allow Dress Live to access your photos so you can change your profile picture.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.length) return;

      setIsUploadingPhoto(true);
      const asset = result.assets[0];
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: 'profile.jpg',
        type: asset.mimeType || 'image/jpeg',
      } as unknown as Blob);
      const updated = await api.postMultipart('/users/me/profile-image', formData);
      // Backend returns the freshly-updated User row with profile_image_url
      // pointing at the new Supabase public URL. Push it into the store so
      // every screen using `user.profile_image_url` reflects it immediately.
      if (updated && typeof updated === 'object') {
        setUser(updated as any);
      }
    } catch (e: any) {
      Alert.alert('Could not update photo', e?.message || 'Please try again.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const menuItems = [
    { label: 'ADRESSES', route: '/profile-edit-address' },
    { label: 'MY MEASUREMENTS', route: '/profile-my-measurements' },
    { label: 'PAYMENT METHODS', route: '/profile-payment-methods' },
    // { label: 'BOOKING HISTORY', route: '/booking-history' },
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
        <Text className="text-black text-[14px] font-[400] uppercase tracking-[2px]">Profile Details</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: Math.max(24, insets.bottom + 24) }}
      >
        {!isAuthenticated ? (
          <View className="px-8 pt-14">
            <Text className="text-black text-[16px] font-medium mb-3">Welcome</Text>
            <Text className="text-black/50 text-[12px] leading-5 mb-10">
              Log in or create an account to manage your profile, save your selection, and book an appointment.
            </Text>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => router.push('/signup')}
              className="w-full bg-black py-4 items-center justify-center mb-4"
            >
              <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">Sign Up</Text>
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
            <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
              <View
                className="flex-row items-end relative"
                style={{ height: 90, width: '100%', maxWidth: 390, alignSelf: 'center' }}
              >
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handlePickAndUploadPhoto}
                  disabled={isUploadingPhoto}
                  style={{ width: 90, height: 90, position: 'relative' }}
                  accessibilityLabel="Change profile photo"
                  accessibilityHint="Pick a new picture from your library"
                >
                  <Image
                    source={
                      user?.profile_image_url || user?.profile_image_uri
                        ? { uri: user?.profile_image_url || user?.profile_image_uri || '' }
                        : require('@/assets/images/Dashboard image 2.png')
                    }
                    style={{ width: 90, height: 90, borderRadius: 2 }}
                    contentFit="cover"
                  />
                  {/* Small camera badge in the bottom-right so it's
                      visually obvious the avatar is tappable. */}
                  <View
                    style={{
                      position: 'absolute',
                      right: -4,
                      bottom: -4,
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      backgroundColor: '#1A1A1A',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 2,
                      borderColor: '#FFFFFF',
                    }}
                  >
                    {isUploadingPhoto ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Feather name="camera" size={12} color="#FFFFFF" />
                    )}
                  </View>
                </TouchableOpacity>

                <View className="ml-6 flex-1" style={{ justifyContent: 'flex-end', paddingBottom: 2 }}>
                  <Text
                    className="text-black"
                    style={{
                      fontFamily: 'Helvetica Neue',
                      fontWeight: '400',
                      fontSize: 16,
                      lineHeight: 16,
                      letterSpacing: 0,
                    }}
                  >
                    {user?.full_name || 'Elif Terzi'}
                  </Text>
                  <Text
                    className="text-black"
                    style={{
                      fontFamily: 'Helvetica Neue',
                      fontWeight: '400',
                      fontSize: 14,
                      lineHeight: 14,
                      letterSpacing: 0,
                      marginTop: 4,
                    }}
                  >
                    {user?.email || 'example@gmail.com'}
                  </Text>
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
            <View className="px-8 mt-2">
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
              <Text
                className="text-[#000000] uppercase"
                style={{
                  fontFamily: 'Helvetica Neue',
                  fontWeight: '300',
                  fontSize: 12,
                  lineHeight: 12,
                  letterSpacing: 0.48,
                }}
              >
                {item.label}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="black" />
            </TouchableOpacity>
          ))}
            </View>

            {/* Personal Info */}
            <View className="px-8 mt-8">
          <Text
            className="text-black mb-6"
            style={{
              fontFamily: 'Helvetica Neue',
              fontWeight: '400',
              fontSize: 14,
              lineHeight: 14,
              letterSpacing: 0,
              textTransform: 'uppercase',
            }}
          >
            PERSONAL INFORMATION
          </Text>
          
          <View className="mb-6">
            <Text
              className="text-[#6E6E6E] uppercase mb-1"
              style={{
                fontFamily: 'Helvetica Neue',
                fontWeight: '300',
                fontSize: 12,
                lineHeight: 12,
                letterSpacing: 0.72,
              }}
            >
              Email
            </Text>
            <Text
              className="text-black mt-2"
              style={{
                fontFamily: 'Helvetica Neue',
                fontWeight: '300',
                fontSize: 14,
                lineHeight: 14,
                letterSpacing: 0.84,
              }}
            >
              {user?.email || 'example@gmail.com'}
            </Text>
          </View>

          <View className="mb-8 mt-2">
            <Text
              className="text-[#6E6E6E] uppercase mb-1"
              style={{
                fontFamily: 'Helvetica Neue',
                fontWeight: '300',
                fontSize: 12,
                lineHeight: 12,
                letterSpacing: 0.72,
              }}
            >
              Phone Number
            </Text>
            <Text
              className="text-black mt-2"
              style={{
                fontFamily: 'Helvetica Neue',
                fontWeight: '300',
                fontSize: 14,
                lineHeight: 14,
                letterSpacing: 0.84,
              }}
            >
              {user?.phone || 'Not added yet'}
            </Text>
          </View>

          <TouchableOpacity 
            onPress={() =>
              router.push({
                pathname: '/profile-security-password',
                params: { source: 'profile' },
              })
            }
            className="py-5 flex-row justify-between items-center"
          >
            <Text
              className="text-[#000000] uppercase"
              style={{
                fontFamily: 'Helvetica Neue',
                fontWeight: '300',
                fontSize: 12,
                lineHeight: 12,
                letterSpacing: 0.48,
              }}
            >
              Security and Password
            </Text>
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
            <Text
              className="text-[#000000] uppercase"
              style={{
                fontFamily: 'Helvetica Neue',
                fontWeight: '300',
                fontSize: 12,
                lineHeight: 12,
                letterSpacing: 0.48,
              }}
            >
              Delete Account
            </Text>
            <Ionicons name="chevron-forward" size={16} color="black" />
          </TouchableOpacity>

        </View>

        <View className="mt-10">
          <TouchableOpacity
            onPress={handleLogout}
            disabled={isLoggingOut}
            className="flex-row items-center px-8"
            activeOpacity={0.7}
          >
            <Image source={LOGOUT_ICON} style={{ width: 14, height: 14, tintColor: '#D32F2F' }} contentFit="contain" />
            <Text
              style={{
                color: '#D32F2F',
                fontFamily: 'Helvetica Neue',
                fontWeight: '400',
                fontSize: 14,
                lineHeight: 15,
                letterSpacing: 0,
                textAlign: 'center',
                marginLeft: 12,
              }}
            >
              Logout
            </Text>
          </TouchableOpacity>
        </View>
          </>
        )}
      </ScrollView>

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


