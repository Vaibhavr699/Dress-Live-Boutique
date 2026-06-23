import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@shared/api/api';
import { ensureMediaPermission } from '@shared/permissions/media';
import { useAuthStore } from '@shared/store/useAuthStore';

export default function SignupScreen() {
  const setToken = useAuthStore((s: any) => s.setToken);
  const setUser = useAuthStore((s: any) => s.setUser);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [image, setImage] = useState<string | null>(null);

  const pickImage = async () => {
    if (!(await ensureMediaPermission('library'))) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const handleSignup = async () => {
    if (!name || !email || !password) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      // 1. Create the account. Phone now travels through here so it lands
      //    on the User row immediately — previously only email/full_name
      //    were sent, which is why the profile tab never showed a phone.
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedPhone = phone.trim();
      await api.post('/users/', {
        email: normalizedEmail,
        password,
        full_name: name.trim(),
        role: 'buyer',
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
      });

      // 2. Auto-login so we have a token to (a) upload the profile image
      //    she just picked, and (b) drop her straight into the app instead
      //    of bouncing back to the login screen.
      const tokenForm = new URLSearchParams();
      tokenForm.append('username', normalizedEmail);
      tokenForm.append('password', password);
      const loginData = await api.postForm('/login/access-token', tokenForm);
      const token: string = loginData.access_token;
      setToken(token);

      // 3. Upload the profile image she picked, if any. The backend
      //    endpoint takes multipart/form-data with a `file` field; once
      //    Supabase hands back the public URL, /users/me reflects it.
      if (image) {
        try {
          const formData = new FormData();
          // RN-specific FormData entry — URI + type + name
          formData.append('file', {
            uri: image,
            name: 'profile.jpg',
            type: 'image/jpeg',
          } as unknown as Blob);
          await api.postMultipart('/users/me/profile-image', formData, {
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch (uploadErr) {
          // Don't fail the whole signup if image upload fails — the
          // account exists, she can re-upload from the profile tab.
          console.warn('[signup] profile-image upload failed', uploadErr);
        }
      }

      // 4. Hydrate the auth store with the (possibly-just-updated) user.
      const me = await api.get('/users/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(me);

      router.replace('/(tabs)' as any);
    } catch (error: any) {
      Alert.alert('Signup Failed', error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-white">
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
      >
        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <SafeAreaView className="flex-1 px-8 pb-10 pt-6" style={{ paddingTop: insets.top }}>
            {/* Dress Live Title */}
            <Text 
              className="text-black text-center mb-12"
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
              className="text-[#1A1A1A] uppercase mb-10 opacity-70"
              style={{ 
                fontFamily: 'Helvetica Neue',
                fontSize: 12,
                fontWeight: '300',
                lineHeight: 14,
                letterSpacing: 0.72
              }}
            >
              Personal Information
            </Text>

            {/* Profile Image Section */}
            <View className="flex-row items-center mb-12">
              <View 
                style={{ 
                  width: 90, 
                  height: 90, 
                  borderStyle: 'dashed', 
                  borderWidth: 1, 
                  borderColor: '#E0E0E0',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden'
                }}
              >
                {image ? (
                  <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                ) : (
                  <Feather name="upload" size={24} color="#1A1A1A" />
                )}
              </View>
              <View className="ml-6 flex-1">
                <Text className="text-[#1A1A1A]/40 text-[12px] font-[300] tracking-[1.5px] uppercase mb-4">
                  Profile Image Optional
                </Text>
                <TouchableOpacity 
                  activeOpacity={0.7}
                  onPress={pickImage}
                  className="border border-[#1A1A1A] self-start px-6 py-4"
                >
                  <Text className="text-[#1A1A1A] text-[12px] font-[400] tracking-[1px]">
                    UPLOAD
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Input Fields */}
            <View className="gap-10 mb-10">
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
                  Full Name *
                </Text>
                <TextInput 
                  className="text-[#1A1A1A] text-sm font-light py-1" 
                  placeholderTextColor="rgba(0,0,0,0.1)"
                  value={name}
                  onChangeText={setName}
                />
              </View>

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
                  Phone Number
                </Text>
                <TextInput 
                  className="text-[#1A1A1A] text-sm font-light py-1" 
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
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
                  Confirm Password *
                </Text>
                <TextInput 
                  className="text-[#1A1A1A] text-sm font-light py-1 pr-10" 
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

            {/* Action Button */}
            <TouchableOpacity 
              activeOpacity={0.9}
              onPress={handleSignup}
              disabled={loading}
              className="bg-[#1A1A1A] py-4 items-center"
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white text-sm font-bold tracking-[3px] uppercase">
                  Create Account
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => router.replace('/login')}
              className="mt-6 items-center"
            >
              <Text
                style={{ 
                  color: 'rgba(26,26,26,0.6)',
                  fontFamily: 'Helvetica Neue',
                  fontWeight: '300',
                  fontSize: 14,
                  lineHeight: 18,
                  letterSpacing: 0,
                }}
              >
                You Already have an account?{'   '}
                <Text className="border-b border-[#1A1A1A]">Log In</Text>
              </Text>
            </TouchableOpacity>
          </SafeAreaView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
