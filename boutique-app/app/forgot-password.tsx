import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@shared/api/api';

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
      // API call to request reset code (TBD on backend)
      // For now we'll simulate success
      setTimeout(() => {
        setLoading(false);
        router.push({
          pathname: '/otp-verify',
          params: { email }
        });
      }, 1000);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send reset link');
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
                className="text-black mb-2"
                style={{ 
                  fontFamily: 'Helvetica Neue',
                  fontSize: 24,
                  fontWeight: '500',
                  lineHeight: 32,
                  letterSpacing: -0.5
                }}
              >
                Forgot account password
              </Text>
              <Text 
                className="text-[#1A1A1A] opacity-60"
                style={{ 
                  fontFamily: 'Helvetica Neue',
                  fontSize: 14,
                  fontWeight: '400',
                  lineHeight: 20
                }}
              >
                Please enter your email to reset the password.
              </Text>
            </View>

            {/* Input Field */}
            <View className="mb-12 border-b border-[#E0E0E0] pb-2">
              <Text 
                className="text-[#1A1A1A]/50 uppercase mb-1"
                style={{ 
                  fontFamily: 'Helvetica Neue',
                  fontSize: 12,
                  fontWeight: '300',
                  lineHeight: 12,
                  letterSpacing: 0.72
                }}
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
                  className="text-white text-sm font-bold tracking-[2px] uppercase"
                  style={{ fontFamily: 'Helvetica Neue' }}
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
