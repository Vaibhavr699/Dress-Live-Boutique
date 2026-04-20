import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function OTPVerifyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const inputs = useRef<TextInput[]>([]);

  const handleChange = (text: string, index: number) => {
    const newCode = [...code];
    newCode[index] = text;
    setCode(newCode);

    if (text && index < 5) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handleVerify = () => {
    const fullCode = code.join('');
    if (fullCode.length === 6) {
      router.push('/reset-password');
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
                  fontSize: 28,
                  fontWeight: '400',
                  lineHeight: 32,
                  letterSpacing: -0.5
                }}
              >
                Check Your Account Email
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
                We send a reset link to {email || 'example@gmail.com'} enter 6 digital code that mentioned in the email.
              </Text>
            </View>

            {/* OTP Boxes Section */}
            <View className="flex-row justify-between mb-20">
              {code.map((digit, index) => (
                <View 
                  key={index}
                  style={styles.otpBox}
                  className="border border-[#E0E0E0] items-center justify-center"
                >
                  <TextInput
                    ref={(ref) => { inputs.current[index] = ref as TextInput; }}
                    className="text-2xl font-light text-[#1A1A1A] w-full h-full text-center"
                    keyboardType="number-pad"
                    maxLength={1}
                    value={digit}
                    onChangeText={(text) => handleChange(text, index)}
                    onKeyPress={(e) => handleKeyPress(e, index)}
                  />
                </View>
              ))}
            </View>

            {/* Action Button */}
            <TouchableOpacity 
              activeOpacity={0.9}
              onPress={handleVerify}
              className="bg-[#1A1A1A] py-5 items-center mt-8 mb-8"
            >
              <Text 
                className="text-white text-sm font-bold tracking-[2px] uppercase"
                style={{ fontFamily: 'Helvetica Neue' }}
              >
                VERIFY CODE
              </Text>
            </TouchableOpacity>

            {/* Resend Link */}
            <View className="flex-row justify-center items-center gap-4">
              <Text className="text-[#1A1A1A]/40 text-[13px] font-light">
                Haven&apos;t got the email yet?
              </Text>
              <TouchableOpacity onPress={() => {}}>
                <Text className="text-[#1A1A1A] text-[13px] font-medium border-b border-[#1A1A1A]">
                  Resend email
                </Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  otpBox: {
    width: 48,
    height: 60,
  },
});
