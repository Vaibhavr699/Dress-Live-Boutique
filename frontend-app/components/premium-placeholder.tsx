import React from 'react';
import { View, Text, SafeAreaView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PremiumPlaceholderProps {
  title: string;
  subtitle: string;
}

export function PremiumPlaceholder({ title, subtitle }: PremiumPlaceholderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-[#F9F9F9] px-8" style={{ paddingTop: insets.top + 60 }}>
      <Text className="text-[#1A1A1A] text-xs font-semibold tracking-[4px] uppercase mb-4 opacity-60">
        Boutique Portal
      </Text>
      <Text className="text-[#333] text-4xl font-light tracking-[2px] mb-6">
        {title}
      </Text>
      <View className="h-[1px] w-12 bg-[#1A1A1A]/20 mb-8" />
      <Text className="text-[#666] text-lg font-light leading-7 tracking-wide">
        {subtitle}
      </Text>
      
      {/* Decorative Element */}
      <View className="absolute bottom-20 left-8 right-8">
        <View className="h-[400px] w-full border border-[#1A1A1A]/5 rounded-[40px] items-center justify-center border-dashed">
          <Text className="text-[#1A1A1A]/20 text-xs font-light tracking-[3px] uppercase">
            Coming Soon
          </Text>
        </View>
      </View>
    </View>
  );
}
