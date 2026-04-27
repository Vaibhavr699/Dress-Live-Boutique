import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@shared/api/api';
import { useAuthStore } from '@shared/store/useAuthStore';
import { useShortlistStore } from '@/store/useShortlistStore';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setToken, setUser, logout } = useAuthStore();
  const guestShortlistIds = useShortlistStore((state) => state.dressIds);
  const clearGuestShortlist = useShortlistStore((state) => state.clear);
  
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

      if (user.role !== 'buyer') {
        logout();
        Alert.alert('Buyer Access Only', 'This app is only available to buyer accounts.');
        return;
      }

      setUser(user);

      // Merge guest shortlist into backend shortlist (max 4)
      try {
        if (Array.isArray(guestShortlistIds) && guestShortlistIds.length > 0) {
          const backendShortlist = await api.get('/shortlists/me', {
            headers: { Authorization: `Bearer ${token}` },
          });
          const backendIds = Array.isArray(backendShortlist)
            ? backendShortlist.map((item: { dress_id: number }) => item.dress_id)
            : [];
          const merged = Array.from(new Set([...guestShortlistIds, ...backendIds])).slice(0, 4);
          await api.put(
            '/shortlists/me',
            { dress_ids: merged },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          clearGuestShortlist();
        }
      } catch (error) {
        // Non-blocking: user can still log in; shortlist sync can be retried later.
        console.warn('Guest shortlist sync failed:', error);
      }

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
          {/* Dress Live Title */}
          <Text 
            className="text-black text-center mb-20"
            style={{ 
              fontFamily: 'Helvetica Neue',
              fontSize: 28,
              fontWeight: '400',
              lineHeight: 30,
              letterSpacing: 0
            }}
          >
            Dress Live
          </Text>

          {/* Section Header */}
          <Text 
            className="text-[#232323] uppercase mb-12 opacity-70"
            style={{ 
              fontFamily: 'Helvetica Neue',
              fontSize: 16,
              fontWeight: '400',
              lineHeight: 24,
              letterSpacing: 0
            }}
          >
            Add Your Log In Info
          </Text>

          {/* Input Fields */}
          <View className="gap-10 mb-8">
            <View className="border-b border-[#E0E0E0] pb-2">
              <Text 
                className="text-[#1A1A1A]/50 uppercase mb-1"
                style={{ 
                  fontFamily: 'Helvetica Neue',
                  fontSize: 12,
                  fontWeight: '300',
                  lineHeight: 14,
                  letterSpacing: 0.72
                }}
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
                className="text-[#1A1A1A]/50 uppercase mb-1"
                style={{ 
                  fontFamily: 'Helvetica Neue',
                  fontSize: 12,
                  fontWeight: '300',
                  lineHeight: 14,
                  letterSpacing: 0.72
                }}
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
            className="items-end mb-14"
            style={{ marginTop: -2 }}
          >
            <Text 
              className="text-[#1A1A1A] opacity-60"
              style={{ 
                fontFamily: 'Helvetica Neue',
                fontSize: 12,
                fontWeight: '300',
              lineHeight: 14,
                letterSpacing: 0,
              paddingBottom: 1
              }}
            >
              Forgot your password?
            </Text>
          </TouchableOpacity>

          {/* Action Button */}
          <TouchableOpacity 
            activeOpacity={0.9}
            onPress={handleLogin}
            disabled={loading}
            className="bg-[#1A1A1A] items-center justify-center mb-10"
            style={{
              width: '100%',
              height: 48,
              paddingTop: 4,
              paddingRight: 24,
              paddingBottom: 4,
              paddingLeft: 24,
            }}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white text-sm font-bold tracking-[3px] uppercase">
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
                className="text-[#1A1A1A]"
                style={{ 
                  fontFamily: 'Helvetica Neue',
                  fontSize: 14,
                  fontWeight: '300',
                  lineHeight: 14,
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
