import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@shared/store/useAuthStore';
import { api } from '@shared/api/api';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

export default function EditAddressScreen() {
  const router = useRouter();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const insets = useSafeAreaInsets();
  const { user, setUser } = useAuthStore();
  const existingProfileImageUrl = user?.profile_image_url || user?.profile_image_uri || null;
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [address, setAddress] = useState(user?.address || '');
  const [apartmentNumber, setApartmentNumber] = useState(user?.apartment_number || '');
  const [stateProvince, setStateProvince] = useState(user?.state_province || '');
  const [region, setRegion] = useState(user?.region || '');
  const [postalCode, setPostalCode] = useState(user?.postal_code || '');
  const [countryCode, setCountryCode] = useState(user?.country_code || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [profileImageUri, setProfileImageUri] = useState(existingProfileImageUrl);
  const [imageChanged, setImageChanged] = useState(false);

  const canSave = useMemo(
    () => fullName.trim().length > 0 && email.trim().length > 0,
    [fullName, email]
  );
  const handleBack = () => {
    if (source === 'profile') {
      router.replace('/(tabs)/profile');
      return;
    }
    router.back();
  };

  const handleSave = async () => {
    if (!canSave) {
      Alert.alert('Missing Details', 'Full name and email are required.');
      return;
    }

    setLoading(true);
    try {
      let updatedUser = await api.put('/users/me', {
        full_name: fullName.trim(),
        email: email.trim(),
        address: address.trim() || null,
        apartment_number: apartmentNumber.trim() || null,
        state_province: stateProvince.trim() || null,
        region: region.trim() || null,
        postal_code: postalCode.trim() || null,
        country_code: countryCode.trim() || null,
        phone: phone.trim() || null,
      });
      setUser(updatedUser);

      if (imageChanged) {
        if (!profileImageUri) {
          updatedUser = await api.delete('/users/me/profile-image');
        } else if (!profileImageUri.startsWith('http://') && !profileImageUri.startsWith('https://')) {
          const fileExtension = profileImageUri.split('.').pop()?.toLowerCase();
          const mimeType =
            fileExtension === 'png'
              ? 'image/png'
              : fileExtension === 'webp'
                ? 'image/webp'
                : 'image/jpeg';
          const formData = new FormData();
          formData.append('file', {
            uri: profileImageUri,
            name: `profile-${Date.now()}.${fileExtension || 'jpg'}`,
            type: mimeType,
          } as any);
          updatedUser = await api.postMultipart('/users/me/profile-image', formData);
        }
        setUser(updatedUser);
      }
      setImageChanged(false);
      Alert.alert('Profile Updated', 'Your profile information has been saved.', [
        { text: 'OK', onPress: handleBack },
      ]);
    } catch (error) {
      Alert.alert('Update Failed', error instanceof Error ? error.message : 'Could not update your profile.');
    } finally {
      setLoading(false);
    }
  };

  const handlePickProfileImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission Denied', 'We need photo library access to update your profile image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setProfileImageUri(result.assets[0].uri);
      setImageChanged(true);
    }
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
        <Text className="text-black text-xs font-bold uppercase mb-4 tracking-[1px] opacity-40">Edit Profile</Text>
        <Text className="text-black/50 text-[12px] leading-5 mb-10">
          Update your personal information and checkout details. Changes are saved directly to your account.
        </Text>

        <View className="items-center mb-10">
          <Image
            source={
              profileImageUri
                ? { uri: profileImageUri }
                : require('@/assets/images/Dashboard image 2.png')
            }
            style={{ width: 96, height: 96, borderRadius: 8 }}
            contentFit="cover"
          />
          <View className="flex-row mt-4">
            <TouchableOpacity onPress={handlePickProfileImage} className="px-4 py-2 border border-black mr-3">
              <Text className="text-black text-[11px] font-bold uppercase tracking-[1px]">
                {profileImageUri ? 'Edit Image' : 'Upload Image'}
              </Text>
            </TouchableOpacity>
            {profileImageUri ? (
              <TouchableOpacity
                onPress={() => {
                  setProfileImageUri(null);
                  setImageChanged(true);
                }}
                className="px-4 py-2 border border-[#D9D9D9]"
              >
                <Text className="text-black/50 text-[11px] font-bold uppercase tracking-[1px]">Remove</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text className="text-black/35 text-[10px] text-center mt-3 px-6">
            Profile image will be uploaded to Supabase Storage and linked to your account.
          </Text>
        </View>

        <View className="mb-6">
          <Text className="text-black/30 text-[9px] font-bold uppercase mb-2 tracking-[0.5px]">Full Name *</Text>
          <TextInput
            className="border-b border-[#F0F0F0] py-2 text-black text-sm"
            value={fullName}
            onChangeText={setFullName}
          />
        </View>

        <View className="mb-6">
          <Text className="text-black/30 text-[9px] font-bold uppercase mb-2 tracking-[0.5px]">Email *</Text>
          <TextInput
            className="border-b border-[#F0F0F0] py-2 text-black text-sm"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View className="mb-6">
          <Text className="text-black/30 text-[9px] font-bold uppercase mb-2 tracking-[0.5px]">Address</Text>
          <TextInput
            className="border-b border-[#F0F0F0] py-2 text-black text-sm"
            value={address}
            onChangeText={setAddress}
          />
        </View>

        <View className="mb-6">
          <Text className="text-black/30 text-[9px] font-bold uppercase mb-2 tracking-[0.5px]">House / Apartment Number</Text>
          <TextInput
            className="border-b border-[#F0F0F0] py-2 text-black text-sm"
            value={apartmentNumber}
            onChangeText={setApartmentNumber}
          />
        </View>

        <View className="mb-6">
          <Text className="text-black/30 text-[9px] font-bold uppercase mb-2 tracking-[0.5px]">State / Province</Text>
          <TextInput
            className="border-b border-[#F0F0F0] py-2 text-black text-sm"
            value={stateProvince}
            onChangeText={setStateProvince}
          />
        </View>

        <View className="mb-6">
          <Text className="text-black/30 text-[9px] font-bold uppercase mb-2 tracking-[0.5px]">Region</Text>
          <TextInput
            className="border-b border-[#F0F0F0] py-2 text-black text-sm"
            value={region}
            onChangeText={setRegion}
          />
        </View>

        <View className="mb-6">
          <Text className="text-black/30 text-[9px] font-bold uppercase mb-2 tracking-[0.5px]">Postal Code</Text>
          <TextInput
            className="border-b border-[#F0F0F0] py-2 text-black text-sm"
            value={postalCode}
            onChangeText={setPostalCode}
          />
        </View>

        <View className="mb-6">
          <Text className="text-black/30 text-[9px] font-bold uppercase mb-2 tracking-[0.5px]">Phone</Text>
          <View className="flex-row gap-4">
            <TextInput
              className="border-b border-[#F0F0F0] py-2 text-black text-sm flex-[0.3]"
              value={countryCode}
              onChangeText={setCountryCode}
            />
            <TextInput
              placeholder="Phone Number"
              className="border-b border-[#F0F0F0] py-2 text-black text-sm flex-1"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        <TouchableOpacity 
          activeOpacity={0.9}
          onPress={handleSave}
          disabled={loading}
          className={`w-full py-4 items-center justify-center mt-10 mb-20 ${loading || !canSave ? 'bg-black/30' : 'bg-black'}`}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">Save</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
