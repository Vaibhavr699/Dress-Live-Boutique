import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function SecurityPasswordVerifyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = params.email || 'example@gmail.com';

  const [code, setCode] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [showWrongCodeModal, setShowWrongCodeModal] = useState(false);

  const showRequiredError = useMemo(() => submitted && !code.trim(), [submitted, code]);

  const handleVerify = () => {
    setSubmitted(true);

    if (!code.trim()) {
      return;
    }

    if (code.trim() !== '9090') {
      setShowWrongCodeModal(true);
      return;
    }

    router.replace('/(tabs)/profile');
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-5" style={{ paddingTop: insets.top + 8 }}>
        <TouchableOpacity onPress={() => router.back()} className="mb-10">
          <Ionicons name="arrow-back" size={18} color="black" />
        </TouchableOpacity>

        <Text className="text-[13px] uppercase tracking-[2px] text-black/70 mb-4">
          Confirm New Password
        </Text>
        <Text className="text-[11px] text-black/55 leading-6 mb-10">
          Please enter the code sent to{'\n'}
          <Text className="text-black">{email}</Text>
        </Text>

        <View>
          <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">
            Verification Code
          </Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            className="pb-2 text-[12px] text-black"
            style={{ borderBottomWidth: 1, borderBottomColor: showRequiredError ? '#FF3B30' : '#ECECEC' }}
          />
          {showRequiredError ? (
            <View className="flex-row items-center mt-2">
              <Ionicons name="alert-circle-outline" size={14} color="#FF3B30" />
              <Text className="text-[10px] text-[#FF3B30] ml-1">This field is mandatory</Text>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handleVerify}
          className="bg-black py-4 items-center justify-center mt-12"
        >
          <Text className="text-[11px] uppercase tracking-[1px] text-white">Verify</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showWrongCodeModal} transparent animationType="fade" onRequestClose={() => setShowWrongCodeModal(false)}>
        <Pressable className="flex-1 bg-black/25 justify-center px-8" onPress={() => setShowWrongCodeModal(false)}>
          <Pressable className="border border-[#1A1A1A] bg-white px-8 py-8" onPress={() => {}}>
            <Text className="text-[12px] text-black/75 leading-6 mb-8">
              Something seems to have gone wrong.{'\n'}Please try again later.
            </Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setShowWrongCodeModal(false)}
              className="border border-[#1A1A1A] py-4 items-center justify-center"
            >
              <Text className="text-[11px] uppercase tracking-[1px] text-black">Accept</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
