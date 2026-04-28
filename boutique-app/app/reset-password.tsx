import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { email, code } = useLocalSearchParams<{ email?: string; code?: string }>();
  
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<'bridge' | 'input' | 'success'>('bridge');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleUpdate = async () => {
    if (!password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in both password fields');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    if (!email || !code) {
      Alert.alert('Error', 'Missing reset code. Please request a new code.');
      return;
    }

    setLoading(true);
    try {
      await api.put('/users/password-reset/confirm', {
        email: String(email).trim().toLowerCase(),
        code: String(code),
        new_password: password,
      });
      setCurrentStep('success');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const renderBridgeState = () => (
    <>
      <View className="mb-12">
        <Text 
          className="mb-2"
          style={RESET_TITLE_STYLE}
        >
          Password Reset
        </Text>
        <Text 
          style={RESET_DESCRIPTION_STYLE}
        >
          Your password had been successfully reset. Click confirm to set a new password.
        </Text>
      </View>

      <TouchableOpacity 
        activeOpacity={0.9}
        onPress={() => setCurrentStep('input')}
        className="bg-[#1A1A1A] py-5 items-center w-full mt-8"
      >
        <Text 
          style={BUTTON_TEXT_STYLE}
        >
          CONFIRM & CONTINUE
        </Text>
      </TouchableOpacity>
    </>
  );

  const renderInputState = () => (
    <>
      <View className="mb-12">
        <Text 
          className="mb-2"
          style={RESET_TITLE_STYLE}
        >
          Password Reset
        </Text>
        <Text 
          style={RESET_DESCRIPTION_STYLE}
        >
          Create a new password. Ensure it different form previous ones for security.
        </Text>
      </View>

      <View className="gap-10 mb-20">
        <View className="border-b border-[#E0E0E0] pb-2 relative">
          <Text 
            className="mb-1"
            style={INPUT_HEADING_STYLE}
          >
            NEW PASSWORD *
          </Text>
          <TextInput 
            className="text-[#1A1A1A] text-sm font-light py-2 pr-10" 
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

        <View className="border-b border-[#E0E0E0] pb-2 relative">
          <Text 
            className="mb-1"
            style={INPUT_HEADING_STYLE}
          >
            RE-ENDER NEW PASSWORD *
          </Text>
          <TextInput 
            className="text-[#1A1A1A] text-sm font-light py-2 pr-10" 
            secureTextEntry={!showConfirmPassword}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />
          <TouchableOpacity 
            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute right-0 bottom-3"
          >
            <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={18} color="#1A1A1A" />
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity 
        activeOpacity={0.9}
        onPress={handleUpdate}
        disabled={loading}
        className="bg-[#1A1A1A] py-5 items-center mt-8"
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text 
            style={BUTTON_TEXT_STYLE}
          >
            UPDATE PASSWORD
          </Text>
        )}
      </TouchableOpacity>
    </>
  );

  const renderSuccessState = () => (
    <>
      <View className="mb-12">
        <Text 
          className="mb-2"
          style={RESET_TITLE_STYLE}
        >
          Password Reset
        </Text>
        <Text 
          style={RESET_DESCRIPTION_STYLE}
        >
          Your password had been successfully reset. Click confirm to log in to your account.
        </Text>
      </View>

      <TouchableOpacity 
        activeOpacity={0.9}
        onPress={() => router.replace('/login')}
        className="bg-[#1A1A1A] py-5 items-center w-full mt-8"
      >
        <Text 
          style={BUTTON_TEXT_STYLE}
        >
          CONFIRM & CONTINUE
        </Text>
      </TouchableOpacity>
    </>
  );

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
            {/* Back Button - Only show on bridge state if we can go back to OTP */}
            {currentStep === 'bridge' && (
              <TouchableOpacity onPress={() => router.back()} className="-ml-2 mb-8">
                <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
              </TouchableOpacity>
            )}

            {currentStep === 'bridge' && renderBridgeState()}
            {currentStep === 'input' && renderInputState()}
            {currentStep === 'success' && renderSuccessState()}
          </SafeAreaView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
