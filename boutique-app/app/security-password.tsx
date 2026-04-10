import React, { useMemo, useState } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function SecurityPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const passwordHint = useMemo(
    () =>
      'Enter a secure password: at least 8 characters, including upper-case and lower-case letters and numbers.',
    []
  );

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-5" style={{ paddingTop: insets.top + 8 }}>
        <TouchableOpacity onPress={() => router.back()} className="mb-10">
          <Ionicons name="arrow-back" size={18} color="black" />
        </TouchableOpacity>

        <Text className="text-[13px] uppercase tracking-[2px] text-black/70 mb-4">New Password</Text>
        <Text className="text-[11px] text-black/55 leading-6 mb-10">Enter a new login password</Text>

        <View>
          <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">New Password *</Text>
          <View className="border-b border-[#ECECEC] pb-2 flex-row items-center">
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              className="flex-1 text-[12px] text-black"
            />
            <TouchableOpacity activeOpacity={0.85} onPress={() => setShowPassword((current) => !current)}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#8A8A8A" />
            </TouchableOpacity>
          </View>
          <View className="flex-row mt-3 pr-2">
            <Ionicons name="alert-circle-outline" size={14} color="#8A8A8A" />
            <Text className="text-[9px] text-black/45 ml-2 leading-4 flex-1">{passwordHint}</Text>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() =>
            router.push({
              pathname: '/security-password-verify',
              params: { email: 'example@gmail.com' },
            })
          }
          className="bg-black py-4 items-center justify-center mt-auto mb-10"
        >
          <Text className="text-[11px] uppercase tracking-[1px] text-white">Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
