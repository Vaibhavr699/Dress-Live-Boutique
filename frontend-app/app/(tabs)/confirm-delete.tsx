import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@shared/store/useAuthStore';
import { api } from '@shared/api/api';

export default function ConfirmDeleteScreen() {
  const router = useRouter();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const insets = useSafeAreaInsets();
  const { logout, user } = useAuthStore();
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFinalDelete = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Details', 'Please confirm your email and password.');
      return;
    }

    setLoading(true);
    try {
      await api.delete('/users/me', {
        body: JSON.stringify({
          email: email.trim(),
          password: password.trim(),
        }),
      });
      logout();
      Alert.alert('Account Deleted', 'Your account has been successfully removed.', [
        { text: 'OK', onPress: () => router.replace('/landing') },
      ]);
    } catch (error) {
      Alert.alert('Delete Failed', error instanceof Error ? error.message : 'Could not delete your account.');
    } finally {
      setLoading(false);
    }
  };
  const handleBack = () => {
    if (source === 'profile') {
      router.replace({
        pathname: '/profile-delete-account',
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
        className="px-6 flex-row items-center pb-4" 
        style={{ paddingTop: insets.top + 10 }}
      >
        <TouchableOpacity onPress={handleBack} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="px-8 pt-8" contentContainerStyle={{ paddingBottom: 150 }}>
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
          Confirm the Deletion your Account
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
          Enter your login details to continue.
        </Text>

        <View className="mb-8">
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
            Email
          </Text>
          <TextInput 
            placeholder="Email"
            className="border-b border-[#F0F0F0] text-black"
            style={{
              paddingVertical: 0,
              height: 28,
              fontFamily: 'Helvetica Neue',
              fontWeight: '300',
              fontSize: 14,
              lineHeight: 14,
              letterSpacing: 0.84,
            }}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View className="mb-10">
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
            Password
          </Text>
          <TextInput 
            placeholder="Password"
            className="border-b border-[#F0F0F0] text-black"
            style={{
              paddingVertical: 0,
              height: 28,
              fontFamily: 'Helvetica Neue',
              fontWeight: '300',
              fontSize: 14,
              lineHeight: 14,
              letterSpacing: 0.84,
            }}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity 
          activeOpacity={0.9}
          onPress={handleFinalDelete}
          disabled={loading}
          className="w-full bg-[#FF3B30] py-4 items-center justify-center mt-10"
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
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
              Delete All
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
