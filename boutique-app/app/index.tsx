import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@shared/store/useAuthStore';

const PANEL_1 = require('../assets/images/boutique-hero-bg.png');
const PANEL_2 = require('../assets/images/boutique-experience.png');
const PANEL_3 = require('../assets/images/avatar.png');
const BRAND_LOGO = require('../assets/images/Dress Live Seller.png');

export default function BoutiqueLandingPage() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, router]);

  // Baseline design: card 390x200 with ~20px side padding.
  const horizontalPadding = 20;
  const cardWidth = Math.max(0, width - horizontalPadding * 2);
  const widthScale = cardWidth / 390;
  const idealCardHeight = 200 * widthScale;

  const topPadding = insets.top + 20;
  const bottomPadding = insets.bottom + 20;
  const availableHeight = height - topPadding - bottomPadding;

  const brandBlockHeight = 34 + 10;
  const buttonsBlockHeight = 52 + 16 + 52;
  const outerGaps = 18 + 16;
  const remainingForCards = Math.max(0, availableHeight - brandBlockHeight - buttonsBlockHeight - outerGaps);
  const maxCardHeightToFitAll = remainingForCards / 3;

  const cardHeight = Math.max(96, Math.min(idealCardHeight, maxCardHeightToFitAll));

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#FFFFFF',
        paddingTop: topPadding,
        paddingBottom: bottomPadding,
        paddingHorizontal: horizontalPadding,
      }}
    >
      <View style={{ flex: 1 }}>
        {/* Cards / panels (non-scroll) */}
        <View style={{ gap: 12 }}>
        <Image source={PANEL_1} style={{ width: cardWidth, height: cardHeight, borderRadius: 2 }} contentFit="cover" />
        <Image source={PANEL_2} style={{ width: cardWidth, height: cardHeight, borderRadius: 2 }} contentFit="cover" />
        <View style={{ width: cardWidth, height: cardHeight, borderRadius: 2, overflow: 'hidden', backgroundColor: '#f3f4f6' }}>
          <Image source={PANEL_3} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          {/* Brand logo overlay on top of PANEL_3 — the seller-specific
              "DL SELLER" mark stands in for the previous "Dress Live" text. */}
          <View style={{ position: 'absolute', top: 10, left: 14, right: 14, alignItems: 'center' }}>
            <Image
              source={BRAND_LOGO}
              style={{ width: Math.min(72, cardHeight * 0.45), height: Math.min(72, cardHeight * 0.45) }}
              contentFit="contain"
            />
          </View>
        </View>
        </View>

        {/* Center content */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingTop: 8 }}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.push('/signup')}
            style={{ width: '100%', backgroundColor: '#000000', paddingVertical: 18, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700', letterSpacing: 3, textTransform: 'uppercase' }}>
              Get Started
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.push('/login')}
            style={{ width: '100%', borderWidth: 1, borderColor: '#000000', paddingVertical: 18, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#000000', fontSize: 12, fontWeight: '700', letterSpacing: 3, textTransform: 'uppercase', textAlign: 'center' }}>
              You have already account? Log In
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
