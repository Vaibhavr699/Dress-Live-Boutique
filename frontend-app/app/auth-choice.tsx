import React from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

const AUTH_BG = require('@/assets/images/Log In Image.jpg');

export default function AuthChoiceScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-black">
      <StatusBar style="light" />
      
      {/* Background Image */}
      <View className="absolute inset-0">
        <Image 
          source={AUTH_BG} 
          style={{ width: '100%', height: '100%' }} 
          contentFit="cover"
        />
        {/* No Overlay */}
      </View>

      <SafeAreaView className="flex-1">
        {/* Header/Back Button */}
        <View className="px-6 py-4">
          <TouchableOpacity 
            onPress={() => router.back()}
            className="w-10 h-10 items-center justify-center rounded-full bg-black/10"
          >
            <Ionicons name="chevron-back" size={24} color="black" />
          </TouchableOpacity>
        </View>

        <View className="flex-1 justify-end px-8 pb-20">
          {/* Brand Header */}
          <View className="items-center mb-16">
            <Text 
              className="text-black text-center mb-4"
              style={{ 
                fontFamily: 'Helvetica Neue',
                fontSize: 28,
                fontWeight: '400',
                lineHeight: 28,
                letterSpacing: 0
              }}
            >
              Dress Live
            </Text>
            
            <View className="gap-1">
              <Text className="text-black/80 text-[13px] text-center font-medium leading-tight">
                Make your bridal wedding look amazing
              </Text>
              <Text className="text-black/80 text-[13px] text-center font-medium leading-tight">
                amazing
              </Text>
            </View>
          </View>

          {/* Horizontal Action Buttons */}
          <View className="flex-row gap-4">
            <TouchableOpacity 
              activeOpacity={0.7}
              onPress={() => router.push('/login')}
              className="flex-1 border border-black py-4 items-center"
            >
              <Text className="text-black text-[14px] font-bold tracking-[2px] uppercase">
                Log In
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              activeOpacity={0.9}
              onPress={() => router.push('/signup')}
              className="flex-1 bg-black py-4 items-center"
            >
              <Text className="text-white text-[14px] font-bold tracking-[2px] uppercase">
                Sign Up
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
