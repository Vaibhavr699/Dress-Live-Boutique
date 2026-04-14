import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

const IMG_1 = require('@/assets/images/Image 1.png');
const IMG_2 = require('@/assets/images/Image 2.png');
const IMG_3 = require('@/assets/images/Image 3.png');

const { width } = Dimensions.get('window');

export default function LandingPage() {
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsSplashVisible(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  if (isSplashVisible) {
    const responsiveFontSize = Math.min(width * 0.15, 64);
    return (
      <View className="flex-1 bg-white items-center justify-center px-8">
        <Text 
          className="text-black text-center uppercase"
          style={{ 
            fontFamily: 'PlayfairDisplay-SemiBold',
            fontSize: responsiveFontSize,
            lineHeight: responsiveFontSize * 1.15,
            letterSpacing: -1
          }}
        >
          Boutique Portal
        </Text>
      </View>
    );
  }


  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ flexGrow: 1, paddingTop: 50, paddingBottom: insets.bottom + 40 }}
      >
        {/* Section 1: Top */}
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <View style={{ width: '100%', aspectRatio: 3/2, backgroundColor: '#f3f4f6', overflow: 'hidden' }}>
            <Image source={IMG_1} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          </View>
        </View>

        {/* Section 2: Middle */}
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <View style={{ width: '100%', aspectRatio: 3/2, backgroundColor: '#f3f4f6', overflow: 'hidden' }}>
            <Image source={IMG_2} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          </View>
        </View>

        {/* Section 3: Bottom */}
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <View style={{ position: 'relative', width: '100%', aspectRatio: 3/2, backgroundColor: '#f3f4f6', overflow: 'hidden' }}>
            <Image source={IMG_3} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            
            {/* "Dress Live" Text Overlay */}
            <View style={{ position: 'absolute', left: 0, right:0, top: 20, alignItems: 'center' }}>
              <Text 
                className="text-black text-center"
                style={{ 
                  fontFamily: 'PlayfairDisplay-SemiBold',
                  fontSize: 34,
                  fontWeight: '600',
                  lineHeight: 34,
                  letterSpacing: 0
                }}
              >
                Dress Live
              </Text>
            </View>

            {/* "Get Started" Button Overlay */}
            <TouchableOpacity 
              activeOpacity={0.9}
              onPress={() => router.push('/(tabs)')}
              style={{ 
                position: 'absolute', 
                bottom: 0, 
                left: 0, 
                right: 0, 
                backgroundColor: 'black', 
                paddingVertical: 14, 
                alignItems: 'center' 
              }}
            >
              <Text style={{ color: 'white', fontSize: 14, fontWeight: 'bold', letterSpacing: 3, textTransform: 'uppercase' }}>
                Get Started
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section 4: Secondary Button */}
        <View style={{ paddingHorizontal: 24, gap: 16 }}>
          <TouchableOpacity 
            activeOpacity={0.7}
            onPress={() => router.push('/auth-choice')}
            style={{ borderWidth: 1, borderColor: 'black', paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ color: 'black', fontSize: 12, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase' }}>
              Log in / Sign up
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
