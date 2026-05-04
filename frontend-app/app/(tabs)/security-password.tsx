import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@shared/api/api';
import { useAuthStore } from '@shared/store/useAuthStore';
import { Image } from 'expo-image';

const EXCLAMATION_ICON = require('@/assets/svg/diamond-exclamation.svg');

export default function SecurityPasswordScreen() {
  const router = useRouter();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const insets = useSafeAreaInsets();
  const userEmail = useAuthStore((state: any) => state.user?.email) ?? '';
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleContinue = async () => {
    if (newPassword.trim().length < 8) {
      Alert.alert('Weak Password', 'Please enter a password with at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Password Mismatch', 'The password confirmation does not match.');
      return;
    }

    try {
      await api.post('/users/me/password/otp', { email: userEmail || undefined });
    } catch (error) {
      Alert.alert('OTP Failed', error instanceof Error ? error.message : 'Could not send verification code.');
      return;
    }

    router.push({
      pathname: source === 'profile' ? '/profile-verify-password' : '/(tabs)/verify-password',
      params: { newPassword, source, email: userEmail },
    });
  };

  const handleBack = () => {
    if (source === 'profile') {
      router.replace('/(tabs)/profile');
      return;
    }
    router.back();
  };

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View 
        className="px-6 flex-row items-center border-b border-[#F0F0F0] pb-4" 
        style={{ paddingTop: insets.top + 10 }}
      >
        <TouchableOpacity onPress={handleBack} className="mr-4">
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
          New Password
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
          Enter a new login password
        </Text>

        <View className="mb-6">
          <Text
            className="text-black/40 uppercase mb-2"
            style={{
              fontFamily: 'Helvetica Neue',
              fontWeight: '300',
              fontSize: 12,
              lineHeight: 12,
              letterSpacing: 0.72,
            }}
          >
            New Password <Text style={{ color: '#FF3B30' }}>*</Text>
          </Text>
          <View className="flex-row border-b border-[#F0F0F0] items-center">
            <TextInput 
              secureTextEntry={!showPassword}
              placeholder="Enter new password"
              className="text-black flex-1"
              style={{
                paddingVertical: 0,
                height: 28,
                fontFamily: 'Helvetica Neue',
                fontWeight: '300',
                fontSize: 14,
                lineHeight: 14,
                letterSpacing: 0.84,
              }}
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color="black" />
            </TouchableOpacity>
          </View>

          <View className="h-8" />

          <Text
            className="text-black/40 uppercase mb-2"
            style={{
              fontFamily: 'Helvetica Neue',
              fontWeight: '300',
              fontSize: 12,
              lineHeight: 12,
              letterSpacing: 0.72,
            }}
          >
            Confirm Password <Text style={{ color: '#FF3B30' }}>*</Text>
          </Text>
          <View className="flex-row border-b border-[#F0F0F0] items-center">
            <TextInput
              secureTextEntry={!showConfirmPassword}
              placeholder="Confirm new password"
              className="text-black flex-1"
              style={{
                paddingVertical: 0,
                height: 28,
                fontFamily: 'Helvetica Neue',
                fontWeight: '300',
                fontSize: 14,
                lineHeight: 14,
                letterSpacing: 0.84,
              }}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
              <Ionicons name={showConfirmPassword ? "eye-outline" : "eye-off-outline"} size={20} color="black" />
            </TouchableOpacity>
          </View>
        </View>

        <View className="flex-row items-start mt-6">
          <Image source={EXCLAMATION_ICON} style={{ width: 14, height: 14, marginRight: 10, opacity: 0.45 }} contentFit="contain" />
          <Text
            className="text-black flex-1"
            style={{
              fontFamily: 'Helvetica Neue',
              fontWeight: '300',
              fontSize: 10,
              lineHeight: 15,
              letterSpacing: 0,
              opacity: 0.6,
            }}
          >
            Enter a secure password: at least 8 characters, including upper-case{'\n'}
            and lower-case letters and numbers.
          </Text>
        </View>

        <TouchableOpacity 
          activeOpacity={0.9}
          onPress={handleContinue}
          className="w-full bg-black py-4 items-center justify-center mt-auto mb-20"
          style={{ marginTop: 240 }}
        >
          <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
