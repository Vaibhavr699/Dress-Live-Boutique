import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@shared/store/useAuthStore';
import { theme } from '@shared/theme/theme';

const { width } = Dimensions.get('window');

export default function BoutiqueLandingPage() {
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsSplashVisible(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  if (isSplashVisible) {
    return (
      <View className="flex-1 bg-white items-center justify-center px-8">
        <Text 
          className="text-black text-center uppercase"
          style={{ 
            fontFamily: 'PlayfairDisplay-SemiBold',
            fontSize: width * 0.12,
            letterSpacing: -1
          }}
        >
          Dress Live
        </Text>
        <Text className="text-black/40 text-xs tracking-[4px] uppercase mt-2 font-medium">
          Partner Portal
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }}
      >
        {/* Hero Section */}
        <View className="px-6 mb-12">
            <Text 
                className="text-black text-4xl mb-4"
                style={{ fontFamily: 'PlayfairDisplay-SemiBold' }}
            >
                Empower Your{"\n"}Boutique with AI
            </Text>
            <Text className="text-black/50 text-sm leading-6 pr-12">
                Manage your catalog, host live video fittings, and connect with brides worldwide using our state-of-the-art AI Try-On technology.
            </Text>
        </View>

        {/* Action Image */}
        <View className="px-6 mb-12">
          <View className="w-full aspect-[4/3] rounded-3xl overflow-hidden bg-gray-100 shadow-xl">
            <Image 
                source={require('../assets/images/Dashboard image 1.png')} 
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
            />
          </View>
        </View>

        {/* Features Preview */}
        <View className="px-6 mb-12">
            <View className="flex-row items-center mb-8">
                <View className="w-10 h-10 rounded-full bg-black items-center justify-center mr-4">
                    <Text className="text-white text-xs">01</Text>
                </View>
                <View className="flex-1">
                    <Text className="text-black font-bold text-sm tracking-wider uppercase mb-1">Live Hosting</Text>
                    <Text className="text-black/40 text-xs">Switch dresses live during video calls</Text>
                </View>
            </View>

            <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-full bg-black items-center justify-center mr-4">
                    <Text className="text-white text-xs">02</Text>
                </View>
                <View className="flex-1">
                    <Text className="text-black font-bold text-sm tracking-wider uppercase mb-1">Catalog Management</Text>
                    <Text className="text-black/40 text-xs">Upload photos to activate AI Try-On</Text>
                </View>
            </View>
        </View>

        {/* Buttons */}
        <View className="px-6 gap-4">
          <TouchableOpacity 
            activeOpacity={0.9}
            onPress={() => router.push(isAuthenticated ? '/(tabs)' : '/login')}
            className="w-full bg-black py-5 rounded-sm items-center justify-center"
          >
            <Text className="text-white text-[12px] font-bold tracking-[3px] uppercase">
                {isAuthenticated ? "Enter Dashboard" : "Partner Login"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            activeOpacity={0.7}
            onPress={() => {}}
            className="w-full border border-black py-5 rounded-sm items-center justify-center"
          >
            <Text className="text-black text-[12px] font-bold tracking-[3px] uppercase">
                Register Boutique
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
