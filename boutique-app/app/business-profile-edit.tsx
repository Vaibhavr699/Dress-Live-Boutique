import React, { useState } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  maxLength,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
}) {
  return (
    <View className="mb-5">
      <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#B9B9B9"
        multiline={multiline}
        maxLength={maxLength}
        keyboardType={keyboardType}
        textAlignVertical={multiline ? 'top' : 'center'}
        className={`border-b border-[#ECECEC] text-[12px] text-black ${multiline ? 'min-h-[88px] pb-4' : 'pb-2'}`}
      />
    </View>
  );
}

function UploadBox({
  title,
  buttonLabel,
  selected,
  onPress,
}: {
  title: string;
  buttonLabel: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <View className="border border-[#1A1A1A] flex-row items-center justify-between">
      <View className="w-[96px] h-[78px] border-r border-[#ECECEC] border-dashed items-center justify-center">
        <Feather name="upload" size={18} color="#1A1A1A" />
      </View>
      <View className="flex-1 px-4">
        <Text className="text-[10px] text-black/45">{selected ? 'Image selected' : title}</Text>
      </View>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        className="border-l border-[#ECECEC] px-4 py-3"
      >
        <Text className="text-[10px] uppercase tracking-[0.7px] text-black">{buttonLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function BusinessProfileEditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [coverPhoto, setCoverPhoto] = useState<string | null>(null);
  const [ownerPhoto, setOwnerPhoto] = useState<string | null>(null);
  const [shopName, setShopName] = useState('');
  const [shopDescription, setShopDescription] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [fullAddress, setFullAddress] = useState('');

  const pickImage = async (setter: (value: string | null) => void) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      setter(result.assets[0].uri);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1" style={{ paddingTop: insets.top + 8 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 140 }}
        >
          <TouchableOpacity onPress={() => router.back()} className="mb-8 ml-1">
            <Ionicons name="arrow-back" size={18} color="black" />
          </TouchableOpacity>

          <Text
            className="text-[24px] text-black mb-1"
            style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
          >
            Edit Business Details
          </Text>
          <Text className="text-[10px] text-black/45 leading-4 mb-6">
            Set up your boutique&apos;s and location details.
          </Text>

          <View className="border-t border-[#ECECEC] pt-5 mb-8">
            <Text
              className="text-[12px] uppercase tracking-[0.8px] text-black mb-4"
              style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
            >
              Shop Information
            </Text>

            <Text className="text-[10px] text-black/45 mb-2">Upload Cover Photo *</Text>
            <UploadBox
              title="Recommended wide banner image"
              buttonLabel="Cover Photo"
              selected={!!coverPhoto}
              onPress={() => pickImage(setCoverPhoto)}
            />

            <View className="mt-5">
              <LabeledInput label="Shop Name *" value={shopName} onChangeText={setShopName} />
              <LabeledInput
                label="Business Shop Description *"
                value={shopDescription}
                onChangeText={setShopDescription}
                multiline
                maxLength={500}
              />
              <View className="flex-row justify-between items-center -mt-3 mb-4">
                <Text className="text-[9px] text-black/35">This information will be visible to customers</Text>
                <Text className="text-[9px] text-black/35">{shopDescription.length}/500</Text>
              </View>
            </View>
          </View>

          <View className="mb-8">
            <Text
              className="text-[12px] text-black mb-1"
              style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
            >
              Shop Contact Info
            </Text>
            <Text className="text-[10px] text-black/45 leading-4 mb-5">
              Set up your boutique&apos;s and location details
            </Text>

            <Text
              className="text-[12px] uppercase tracking-[0.8px] text-black mb-4"
              style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
            >
              Owner Personal Information
            </Text>

            <View className="mb-5 max-w-[148px]">
              <UploadBox
                title="Owner image"
                buttonLabel="Upload Image"
                selected={!!ownerPhoto}
                onPress={() => pickImage(setOwnerPhoto)}
              />
            </View>

            <LabeledInput label="Owner Name *" value={ownerName} onChangeText={setOwnerName} />
            <LabeledInput
              label="Email *"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
            />
            <LabeledInput
              label="Primary Phone Number *"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
            />
            <LabeledInput label="Full Address *" value={fullAddress} onChangeText={setFullAddress} />
          </View>

          <View className="mb-6">
            <Text
              className="text-[12px] text-black mb-4"
              style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
            >
              Change Pin Store Current Location
            </Text>

            <View className="h-[160px] border border-[#D8D8D8] bg-[#F3F3F3] overflow-hidden justify-between">
              <View className="absolute inset-0">
                <View className="flex-1 flex-row">
                  <View className="flex-1 border-r border-[#E1E1E1]" />
                  <View className="flex-1 border-r border-[#E1E1E1]" />
                  <View className="flex-1" />
                </View>
                <View className="absolute inset-0 justify-evenly">
                  <View className="border-t border-[#E1E1E1]" />
                  <View className="border-t border-[#E1E1E1]" />
                  <View className="border-t border-[#E1E1E1]" />
                  <View className="border-t border-[#E1E1E1]" />
                </View>
              </View>
              <View className="absolute right-3 bottom-3 bg-white px-4 py-2 rounded-full border border-[#E5E5E5] flex-row items-center">
                <Ionicons name="move-outline" size={14} color="#1A1A1A" />
                <Text className="text-[10px] text-black ml-1">Drag to adjust</Text>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => {}}
              className="bg-black py-4 items-center justify-center mt-5"
            >
              <Text className="text-[11px] uppercase tracking-[1px] text-white">Use Current Location</Text>
            </TouchableOpacity>

            <Text className="text-[10px] text-black/45 leading-4 mt-4">
              Your shop location helps customer find you easily in search results and on the map.
            </Text>
          </View>
        </ScrollView>

        <View className="px-3 pb-10 flex-row bg-white">
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.back()}
            className="flex-1 border border-black py-4 items-center justify-center mr-1"
          >
            <Text className="text-[11px] uppercase tracking-[1px] text-black">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.back()}
            className="flex-1 bg-black py-4 items-center justify-center ml-1"
          >
            <Text className="text-[11px] uppercase tracking-[1px] text-white">Save Changes</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
