import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions, Alert, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const IMG_1 = require('@/assets/images/Image 1.png');
const IMG_2 = require('@/assets/images/Image 2.png');

export default function LandingPage() {
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const availableHeight = height - insets.top - insets.bottom;
  const imageHeight = Math.max(235, Math.min(width * 0.88, availableHeight * 0.37));
  const titleFontSize = Math.min(width * 0.1, 34);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsSplashVisible(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Placeholder until OAuth is configured. Social sign-in needs provider
  // credentials (Google client IDs; Apple Service ID + a paid Apple dev
  // account) and a real dev/standalone build — it can't run in Expo Go. Once
  // those exist, replace this with the native Google/Apple flow that posts the
  // returned token to the backend.
  const handleSocial = (provider: 'Google' | 'Apple') => {
    Alert.alert(
      `${provider} sign-in coming soon`,
      `${provider} sign-in isn't enabled yet. Please continue with your email for now.`,
      [{ text: 'OK' }]
    );
  };

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
    <View
      style={{
        flex: 1,
        backgroundColor: 'white',
        paddingTop: insets.top + 20,
        paddingBottom: Math.max(insets.bottom + 6, 8),
        paddingHorizontal: 16,
      }}
    >
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ marginTop: 4, gap: 10 }}>
          {/* Section 1: Page Title */}
          <View style={{ paddingHorizontal: 24, alignItems: 'center', marginBottom: 8 }}>
            <Text
              className="text-black text-center"
              style={{
                fontFamily: 'PlayfairDisplay-SemiBold',
                fontSize: titleFontSize,
                fontWeight: '600',
                lineHeight: titleFontSize,
                letterSpacing: 0,
              }}
            >
              Dress Live
            </Text>
          </View>

          {/* Section 2: Top */}
          <View style={{ width: '100%', height: imageHeight, backgroundColor: '#f3f4f6', overflow: 'hidden' }}>
            <Image source={IMG_1} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          </View>

          {/* Section 3: Middle */}
          <View style={{ width: '100%', height: imageHeight, backgroundColor: '#f3f4f6', overflow: 'hidden' }}>
            <Image source={IMG_2} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          </View>
        </View>

        <View style={{ paddingHorizontal: 8, gap: 10, marginTop: 8 }}>
          <TouchableOpacity 
            activeOpacity={0.9}
            onPress={() => router.push('/(tabs)')}
            style={{ backgroundColor: 'black', paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ color: 'white', fontSize: 14, fontWeight: 'bold', letterSpacing: 3, textTransform: 'uppercase' }}>
              Get Started
            </Text>
          </TouchableOpacity>

          {/* Section 4: Auth Buttons */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity 
              activeOpacity={0.7}
              onPress={() => router.push('/login')}
              style={{ flex: 1, borderWidth: 1, borderColor: 'black', paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ color: 'black', fontSize: 12, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase' }}>
                Log in
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              activeOpacity={0.7}
              onPress={() => router.push('/signup')}
              style={{ flex: 1, borderWidth: 1, borderColor: 'black', paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ color: 'black', fontSize: 12, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase' }}>
                Sign up
              </Text>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: '#E5E5E5' }} />
            <Text style={{ marginHorizontal: 12, fontSize: 11, color: '#9B9B9B', letterSpacing: 1 }}>OR</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: '#E5E5E5' }} />
          </View>

          {/* Social sign-in */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => handleSocial('Google')}
            style={{ borderWidth: 1, borderColor: 'black', paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }}
          >
            <Ionicons name="logo-google" size={18} color="black" style={{ marginRight: 10 }} />
            <Text style={{ color: 'black', fontSize: 12, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase' }}>
              Continue with Google
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => handleSocial('Apple')}
            style={{ backgroundColor: 'black', paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }}
          >
            <Ionicons name="logo-apple" size={20} color="white" style={{ marginRight: 10 }} />
            <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase' }}>
              Continue with Apple
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
