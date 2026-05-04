import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@shared/api/api';

const RESET_TITLE_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '500' as const,
  fontSize: 24,
  lineHeight: 24,
  letterSpacing: 0,
  color: '#000000',
};

const RESET_DESCRIPTION_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '400' as const,
  fontSize: 14,
  lineHeight: 14,
  letterSpacing: 0,
  color: '#1A1A1A',
};

const INPUT_HEADING_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '300' as const,
  fontSize: 12,
  lineHeight: 12,
  letterSpacing: 0.72,
  textTransform: 'uppercase' as const,
  color: 'rgba(26,26,26,0.5)',
};

const BUTTON_TEXT_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '500' as const,
  fontSize: 14,
  lineHeight: 14,
  letterSpacing: 0.56,
  textTransform: 'uppercase' as const,
  color: '#FFFFFF',
};

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');

  const handleResetRequest = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your account email');
      return;
    }

    setLoading(true);
    try {
      await api.post('/users/password-reset/otp', { email: email.trim().toLowerCase() });
      router.push({
        pathname: '/otp-verify',
        params: { email: email.trim().toLowerCase() },
      });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-white">
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <SafeAreaView className="flex-1 px-8 pb-10 pt-[10px]" style={{ paddingTop: insets.top + 10 }}>
            {/* Back Button */}
            <TouchableOpacity onPress={() => router.back()} className="-ml-2 mb-8">
              <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
            </TouchableOpacity>

            {/* Title Section */}
            <View className="mb-12">
              <Text 
                className="mb-2"
                style={RESET_TITLE_STYLE}
              >
                Forgot account password
              </Text>
              <Text 
                style={RESET_DESCRIPTION_STYLE}
              >
                Please enter your email to reset the password.
              </Text>
            </View>

            {/* Input Field */}
            <View className="mb-12 border-b border-[#E0E0E0] pb-2">
              <Text 
                className="mb-1"
                style={INPUT_HEADING_STYLE}
              >
                WRITE ACCOUNT EMAIL *
              </Text>
              <TextInput 
                className="text-[#1A1A1A] text-sm font-light py-2" 
                placeholderTextColor="rgba(0,0,0,0.1)"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                autoFocus
              />
            </View>

            {/* Action Button */}
            <TouchableOpacity 
              activeOpacity={0.9}
              onPress={handleResetRequest}
              disabled={loading}
              className="bg-[#1A1A1A] py-5 items-center mt-8"
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text 
                  style={BUTTON_TEXT_STYLE}
                >
                  RESET PASSWORD?
                </Text>
              )}
            </TouchableOpacity>
          </SafeAreaView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
