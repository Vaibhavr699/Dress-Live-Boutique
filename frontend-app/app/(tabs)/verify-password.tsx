import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@shared/store/useAuthStore';
import { api } from '@shared/api/api';

export default function VerifyPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { newPassword, source, email } = useLocalSearchParams<{ newPassword?: string; source?: string; email?: string }>();
  const { setUser } = useAuthStore();
  const [code, setCode] = useState('');
  const [errorVisible, setErrorVisible] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [loading, setLoading] = useState(false);

  const normalizedCode = useMemo(() => (code || '').replace(/\D/g, '').trim(), [code]);

  const handleVerify = async () => {
    if (!normalizedCode) {
      setFieldError('This field is mandatory');
      return;
    }
    if (normalizedCode.length !== 4) {
      setFieldError('Enter the 4-digit code.');
      return;
    }

    if (!newPassword || newPassword.trim().length < 8) {
      setErrorVisible(true);
      return;
    }

    setLoading(true);
    try {
      const updatedUser = await api.put('/users/me/password/otp', { code: normalizedCode, new_password: newPassword });
      setUser(updatedUser);
      router.replace('/(tabs)/profile');
    } catch (error) {
      setFieldError(error instanceof Error ? error.message : 'Could not update your password.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await api.post('/users/me/password/otp', { email: typeof email === 'string' ? email : undefined });
      Alert.alert('Verification Code', 'A new code has been sent to your email.');
    } catch (error) {
      Alert.alert('OTP Failed', error instanceof Error ? error.message : 'Could not resend verification code.');
    }
  };
  const handleBack = () => {
    if (source === 'profile') {
      router.replace({
        pathname: '/profile-security-password',
        params: { source },
      });
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
        <Text className="text-black text-xs font-bold uppercase mb-4 tracking-[1px] opacity-40">Confirm New Password</Text>
        <Text className="text-black/50 text-[12px] leading-5 mb-10">
          Please enter the 4-digit code sent to {typeof email === 'string' && email.length > 0 ? email : 'your email'}.
        </Text>

        <View className="mb-6">
          <Text className="text-black/30 text-[9px] font-bold uppercase mb-2 tracking-[0.5px]">Verification Code</Text>
          <TextInput 
            value={code}
            onChangeText={(t) => {
                setCode(t);
                setFieldError('');
            }}
            placeholder="Enter 4-digit code"
            className={`border-b border-[#F0F0F0] py-4 text-black text-sm ${fieldError ? 'border-red-500' : ''}`}
            keyboardType="number-pad"
          />
          {fieldError && (
             <View className="flex-row items-center mt-2">
                <Ionicons name="alert-circle-outline" size={12} color="#FF3B30" />
                <Text className="text-[#FF3B30] text-[10px] ml-2">{fieldError}</Text>
             </View>
          )}
        </View>

        <TouchableOpacity onPress={handleResend} disabled={loading} className="mb-6">
          <Text className="text-black/50 text-[11px] underline">Resend code</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          activeOpacity={0.9}
          onPress={handleVerify}
          disabled={loading}
          className="w-full bg-black py-4 items-center justify-center mt-auto mb-20"
          style={{ marginTop: 240 }}
        >
          <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">
            {loading ? 'Updating...' : 'Verify'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Error Popup Modal */}
      <Modal
        visible={errorVisible}
        transparent={true}
        animationType="fade"
      >
        <View className="flex-1 bg-black/50 items-center justify-center px-10">
          <View className="bg-white w-full p-10 rounded-sm items-center">
            <Text className="text-black/70 text-[12px] text-center leading-5 mb-10 px-4">
              Something seems to have gone wrong. Please try again later.
            </Text>
            
            <TouchableOpacity 
              onPress={() => setErrorVisible(false)}
              className="w-full border border-black/10 py-4 items-center"
            >
              <Text className="text-black text-[12px] font-bold uppercase tracking-[1px]">Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
