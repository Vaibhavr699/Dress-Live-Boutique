import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@shared/api/api';
import { useAuthStore } from '@shared/store/useAuthStore';

const LOGIN_TITLE_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '400' as const,
  fontSize: 28,
  lineHeight: 28,
  letterSpacing: 0,
};

const LOGIN_SECTION_HEADING_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '400' as const,
  fontSize: 16,
  lineHeight: 24,
  letterSpacing: 0,
  color: '#1A1A1A',
  textTransform: 'uppercase' as const,
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

const FORGOT_LINK_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '300' as const,
  fontSize: 12,
  lineHeight: 12,
  letterSpacing: 0,
  color: 'rgba(26,26,26,0.6)',
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

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setToken, setUser, logout } = useAuthStore();
  
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    const normalizedEmail = email.trim();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      Alert.alert('Error', 'Please enter your email and password');
      return;
    }

    setLoading(true);
    try {
      // 1. Get access token (OAuth2 format)
      const formData = new URLSearchParams();
      formData.append('username', normalizedEmail);
      formData.append('password', normalizedPassword);

      const loginData = await api.postForm('/login/access-token', formData);
      const token = loginData.access_token;
      
      setToken(token);

      // 2. Get user profile
      const user = await api.get('/users/me', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (user.role !== 'partner') {
        logout();
        Alert.alert('Seller Access Only', 'This app is only available to boutique partner accounts.');
        return;
      }

      setUser(user);

      // 3. Success -> Go to app
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Login Failed', error.message || 'Incorrect email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-white" style={{ paddingTop: insets.top }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <SafeAreaView className="flex-1 px-8 pb-12">
          {/* Back Button */}
          <View className="flex-row justify-between items-center mb-8">
            <TouchableOpacity onPress={() => router.replace('/')} className="-ml-2">
              <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
            </TouchableOpacity>
          </View>

          {/* Dress Live Title */}
          <Text
            className="text-black text-center mb-20"
            style={LOGIN_TITLE_STYLE}
          >
            Dress Live
          </Text>

          {/* Section Header */}
          <Text 
            className="mb-12"
            style={LOGIN_SECTION_HEADING_STYLE}
          >
            Add Your Log In Info
          </Text>

          {/* Input Fields */}
          <View className="gap-10 mb-2">
            <View className="border-b border-[#E0E0E0] pb-2">
              <Text 
                className="mb-1"
                style={INPUT_HEADING_STYLE}
              >
                Email *
              </Text>
              <TextInput 
                className="text-[#1A1A1A] text-sm font-light py-1" 
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <View className="border-b border-[#E0E0E0] pb-2 relative">
              <Text 
                className="mb-1"
                style={INPUT_HEADING_STYLE}
              >
                Password *
              </Text>
              <TextInput 
                className="text-[#1A1A1A] text-sm font-light py-1 pr-10" 
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity 
                onPress={() => setShowPassword(!showPassword)}
                className="absolute right-0 bottom-3"
              >
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color="#1A1A1A" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Forgot Password Link */}
          <TouchableOpacity 
            onPress={() => router.push('/forgot-password')}
            className="items-end mb-16"
          >
            <Text 
              style={FORGOT_LINK_STYLE}
            >
              Forgot your password?
            </Text>
          </TouchableOpacity>

          {/* Action Button */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleLogin}
            disabled={loading}
            className="bg-[#1A1A1A] py-6 items-center mb-8 flex-row justify-center"
          >
            {loading ? (
              <>
                <ActivityIndicator color="white" />
                <Text style={[BUTTON_TEXT_STYLE, { marginLeft: 10 }]}>
                  Signing In…
                </Text>
              </>
            ) : (
              <Text style={BUTTON_TEXT_STYLE}>
                Log In
              </Text>
            )}
          </TouchableOpacity>

          {/* Sign Up Footer */}
          <View className="flex-row justify-center items-center gap-6">
            <Text 
              className="text-[#1A1A1A]/60"
              style={{ 
                fontFamily: 'Helvetica Neue',
                fontSize: 14,
                fontWeight: '300',
                lineHeight: 14,
                letterSpacing: 0
              }}
            >
              No Account?
            </Text>
            <TouchableOpacity onPress={() => router.replace('/signup')}>
              <Text 
                className="text-[#1A1A1A] font-bold"
                style={{ 
                  fontFamily: 'Helvetica Neue',
                  fontSize: 14,
                  fontWeight: '300',
                  lineHeight: 18,
                  letterSpacing: 0
                }}
              >
                Sign Up
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </ScrollView>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      />
    </View>
  );
}
