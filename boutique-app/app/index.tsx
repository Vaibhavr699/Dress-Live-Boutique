import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@shared/store/useAuthStore';

const { width } = Dimensions.get('window');
const PANEL_1 = require('../assets/images/boutique-hero-bg.png');
const PANEL_2 = require('../assets/images/boutique-experience.png');
const PANEL_3 = require('../assets/images/avatar.png');

export default function BoutiqueLandingPage() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, router]);

  return (
    <View className="flex-1 bg-white">
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }}
      >
        {/* Figma-style placeholder panels */}
        <View className="px-6">
          <Image source={PANEL_1} style={{ width: '100%', height: 160, borderRadius: 2 }} contentFit="cover" />
          <View className="h-8" />
          <Image source={PANEL_2} style={{ width: '100%', height: 160, borderRadius: 2 }} contentFit="cover" />
          <View className="h-8" />
          <Image source={PANEL_3} style={{ width: '100%', height: 160, borderRadius: 2 }} contentFit="cover" />
        </View>

        {/* Brand */}
        <View className="px-6 items-center mt-10">
          <Text
            className="text-black"
            style={{
              fontFamily: 'PlayfairDisplay-SemiBold',
              fontSize: 34,
              lineHeight: 34,
            }}
          >
            Dress Live
          </Text>
        </View>

        {/* Buttons */}
        <View className="px-6 mt-8 gap-4">
          <TouchableOpacity 
            activeOpacity={0.9}
            onPress={() => router.push('/signup')}
            className="w-full bg-black py-5 items-center justify-center"
          >
            <Text className="text-white text-[12px] font-bold tracking-[3px] uppercase">
              Get Started
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            activeOpacity={0.7}
            onPress={() => router.push('/login')}
            className="w-full border border-black py-5 items-center justify-center"
          >
            <Text className="text-black text-[12px] font-bold tracking-[3px] uppercase">
              You have already account? Log In
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
