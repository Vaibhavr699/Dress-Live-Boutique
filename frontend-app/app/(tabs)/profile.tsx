import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useAuthStore } from '@shared/store/useAuthStore';

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { logout, user } = useAuthStore();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const menuItems = [
    { label: 'ADRESSES', route: '/(tabs)/edit-address' },
    { label: 'MY MEASUREMENTS', route: '/(tabs)/my-measurements' },
    { label: 'PAYMENT METHODS', route: '/(tabs)/payment-methods' },
  ];

  const handleLogout = () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    setTimeout(() => {
      logout();
      router.replace('/');
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
        {/* User Info Card */}
        <View className="px-8 pt-8 pb-10 border-b border-[#F0F0F0]">
          <View className="flex-row items-center relative">
            <Image 
              source={require('@/assets/images/Dashboard image 2.png')} 
              style={{ width: 80, height: 80, borderRadius: 2 }}
              contentFit="cover"
            />
            <View className="ml-6 flex-1">
              <Text className="text-black text-lg font-medium">{user?.full_name || 'Elif Terzi'}</Text>
              <Text className="text-black/40 text-[12px]">{user?.email || 'example@gmail.com'}</Text>
            </View>
            <TouchableOpacity className="absolute top-0 right-0">
               <Feather name="edit-3" size={18} color="black" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Menu List */}
        <View className="px-8 pt-4">
          {menuItems.map((item, idx) => (
            <TouchableOpacity 
              key={idx}
              onPress={() => router.push(item.route as any)}
              className="py-5 flex-row justify-between items-center bg-white"
            >
              <Text className="text-black/30 text-[10px] font-bold uppercase tracking-[1px]">{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color="black" />
            </TouchableOpacity>
          ))}
        </View>

        {/* Personal Info */}
        <View className="px-8 mt-10">
          <Text className="text-black/30 text-[10px] font-bold uppercase mb-6 tracking-[1px]">Personal Information</Text>
          
          <View className="mb-6">
            <Text className="text-black/30 text-[9px] font-bold uppercase mb-1 tracking-[0.5px]">Email</Text>
            <Text className="text-black text-[13px]">{user?.email || 'example@gmail.com'}</Text>
          </View>

          <View className="mb-10">
            <Text className="text-black/30 text-[9px] font-bold uppercase mb-1 tracking-[0.5px]">Phone Number</Text>
            <Text className="text-black text-[13px]">+92 300 111 222 3333</Text>
          </View>

          <TouchableOpacity 
            onPress={() => router.push('/(tabs)/security-password')}
            className="py-5 border-t border-[#F0F0F0] flex-row justify-between items-center"
          >
            <Text className="text-black/30 text-[10px] font-bold uppercase tracking-[1px]">Security and Password</Text>
            <Ionicons name="chevron-forward" size={16} color="black" />
          </TouchableOpacity>


          <TouchableOpacity 
            onPress={() => router.push('/(tabs)/delete-account')}
            className="py-5 border-t border-[#F0F0F0] flex-row justify-between items-center mb-10"
          >
            <Text className="text-black/30 text-[10px] font-bold uppercase tracking-[1px]">Delete Account</Text>
            <Ionicons name="chevron-forward" size={16} color="black" />
          </TouchableOpacity>


          {/* Logout */}
          <TouchableOpacity 
            onPress={handleLogout}
            disabled={isLoggingOut}
            className="flex-row items-center py-10"
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="logout" size={18} color="#FF3B30" className="mr-3" />
            <Text className="text-[#FF3B30] text-[12px] font-bold uppercase tracking-[1.5px] ml-3">Logout</Text>
          </TouchableOpacity>

        </View>
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


