import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function VerifyPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [errorVisible, setErrorVisible] = useState(false);
  const [fieldError, setFieldError] = useState('');

  const handleVerify = () => {
    if (!code) {
      setFieldError('This field is mandatory');
      return;
    }
    setErrorVisible(true);
  };

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View 
        className="px-6 flex-row items-center border-b border-[#F0F0F0] pb-4" 
        style={{ paddingTop: insets.top + 10 }}
      >
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="px-8 pt-8">
        <Text className="text-black text-xs font-bold uppercase mb-4 tracking-[1px] opacity-40">Confirm New Password</Text>
        <Text className="text-black/50 text-[12px] leading-5 mb-10">
          Please enter the code sent to{'\n'}example@gmail.com
        </Text>

        <View className="mb-6">
          <Text className="text-black/30 text-[9px] font-bold uppercase mb-2 tracking-[0.5px]">Verification Code</Text>
          <TextInput 
            value={code}
            onChangeText={(t) => {
                setCode(t);
                setFieldError('');
            }}
            placeholder="Enter code"
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

        <TouchableOpacity 
          activeOpacity={0.9}
          onPress={handleVerify}
          className="w-full bg-black py-4 items-center justify-center mt-auto mb-20"
          style={{ marginTop: 240 }}
        >
          <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">Verify</Text>
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
