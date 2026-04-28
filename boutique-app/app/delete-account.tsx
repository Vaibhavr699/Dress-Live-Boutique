import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-white">
      <View className="px-6 flex-row items-center pb-4" style={{ paddingTop: insets.top + 10 }}>
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="px-8 pt-8">
        <Text
          className="text-black mb-4"
          style={{
            fontFamily: 'Helvetica Neue',
            fontWeight: '200',
            fontSize: 14,
            lineHeight: 14,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          Delete your Account
        </Text>
        <Text
          className="text-black mb-12"
          style={{
            fontFamily: 'Helvetica Neue',
            fontWeight: '300',
            fontSize: 14,
            lineHeight: 18,
            letterSpacing: 0,
            opacity: 0.6,
          }}
        >
          You are about to begin the process to delete your account.
        </Text>

        <View className="mb-12">
          <Text
            className="text-black mb-4"
            style={{
              fontFamily: 'Helvetica Neue',
              fontWeight: '200',
              fontSize: 14,
              lineHeight: 14,
              letterSpacing: 2,
              textTransform: 'uppercase',
              opacity: 0.7,
            }}
          >
            Remember:
          </Text>
          <Text
            className="text-black mb-10"
            style={{
              fontFamily: 'Helvetica Neue',
              fontWeight: '300',
              fontSize: 14,
              lineHeight: 18,
              letterSpacing: 0,
              opacity: 0.6,
            }}
          >
            You will not be able to track any purchase, return and/or exchange online.
          </Text>
          <Text
            className="text-black"
            style={{
              fontFamily: 'Helvetica Neue',
              fontWeight: '300',
              fontSize: 14,
              lineHeight: 18,
              letterSpacing: 0,
              opacity: 0.6,
            }}
          >
            You will not be able to access your Live Dress account.
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.push('/delete-account-confirmation')}
          className="w-full bg-black py-4 items-center justify-center mt-auto mb-20"
          style={{ marginTop: 120 }}
        >
          <Text
            className="text-white"
            style={{
              fontFamily: 'Helvetica Neue',
              fontWeight: '400',
              fontSize: 12,
              lineHeight: 12,
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            Continue
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
