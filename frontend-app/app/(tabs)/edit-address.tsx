import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@shared/store/useAuthStore';
import { api } from '@shared/api/api';

const TITLE_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '200' as const,
  fontSize: 16,
  lineHeight: 16,
  letterSpacing: 2,
  textTransform: 'uppercase' as const,
  color: '#000000',
};

const DESCRIPTION_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '200' as const,
  fontSize: 14,
  lineHeight: 24,
  letterSpacing: 0,
  color: '#6E6E6E',
};

const INPUT_HEADER_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '300' as const,
  fontSize: 12,
  lineHeight: 12,
  letterSpacing: 0.72, // ~6% of 12
  textTransform: 'uppercase' as const,
  color: '#6E6E6E',
};

export default function EditAddressScreen() {
  const router = useRouter();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const insets = useSafeAreaInsets();
  const { user, setUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const fullNameParts = useMemo(() => (user?.full_name || '').trim().split(/\s+/).filter(Boolean), [user?.full_name]);
  const [firstName, setFirstName] = useState(fullNameParts[0] || '');
  const [lastName, setLastName] = useState(fullNameParts.slice(1).join(' ') || '');
  const [email, setEmail] = useState(user?.email || '');
  const [address, setAddress] = useState(user?.address || '');
  const [apartmentNumber, setApartmentNumber] = useState(user?.apartment_number || '');
  const [stateProvince, setStateProvince] = useState(user?.state_province || '');
  const [region, setRegion] = useState(user?.region || '');
  const [postalCode, setPostalCode] = useState(user?.postal_code || '');
  const [countryCode, setCountryCode] = useState(user?.country_code || '');
  const [phone, setPhone] = useState(user?.phone || '');

  const canSave = useMemo(
    () => firstName.trim().length > 0 && lastName.trim().length > 0 && address.trim().length > 0,
    [firstName, lastName, address]
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
      Alert.alert('Missing Details', 'First name, last name, and address are required.');
      return;
    }

    setLoading(true);
    try {
      const updatedUser = await api.put('/users/me', {
        full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        email: email.trim() || null,
        address: address.trim() || null,
        apartment_number: apartmentNumber.trim() || null,
        state_province: stateProvince.trim() || null,
        region: region.trim() || null,
        postal_code: postalCode.trim() || null,
        country_code: countryCode.trim() || null,
        phone: phone.trim() || null,
      });
      setUser(updatedUser);
      Alert.alert('Saved', 'Your address has been saved.', [
        { text: 'OK', onPress: handleBack },
      ]);
    } catch (error) {
      Alert.alert('Update Failed', error instanceof Error ? error.message : 'Could not update your address.');
    } finally {
      setLoading(false);
    }
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 }}
      >
        <View style={{ width: '100%', maxWidth: 390, alignSelf: 'center' }}>
          <Text style={[TITLE_STYLE, { marginBottom: 16 }]}>Edit Address</Text>

          <Text style={[DESCRIPTION_STYLE, { marginBottom: 40 }]}>
            To complete your order, you must first enter your account{'\n'}
            information. You can update it at any time from{'\n'}
            your account.
          </Text>

          {/* First Name */}
          <View className="mb-6">
            <Text style={[INPUT_HEADER_STYLE, { marginBottom: 8 }]}>
              First Name *
            </Text>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              style={{
                height: 28,
                width: '100%',
                borderBottomWidth: 1,
                borderBottomColor: '#F0F0F0',
                paddingVertical: 0,
                fontFamily: 'Helvetica Neue',
                fontWeight: '300',
                fontSize: 14,
                lineHeight: 14,
                letterSpacing: 0.84,
                color: '#000',
              }}
            />
          </View>

          {/* Last Name */}
          <View className="mb-6">
            <Text style={[INPUT_HEADER_STYLE, { marginBottom: 8 }]}>
              Last Name *
            </Text>
            <TextInput
              value={lastName}
              onChangeText={setLastName}
              style={{
                height: 28,
                width: '100%',
                borderBottomWidth: 1,
                borderBottomColor: '#F0F0F0',
                paddingVertical: 0,
                fontFamily: 'Helvetica Neue',
                fontWeight: '300',
                fontSize: 14,
                lineHeight: 14,
                letterSpacing: 0.84,
                color: '#000',
              }}
            />
          </View>

          {/* Address */}
          <View className="mb-6">
            <Text style={[INPUT_HEADER_STYLE, { marginBottom: 8 }]}>Full Address *</Text>
            <TextInput
              value={address}
              onChangeText={setAddress}
              style={{
                height: 28,
                width: '100%',
                borderBottomWidth: 1,
                borderBottomColor: '#F0F0F0',
                paddingVertical: 0,
                fontFamily: 'Helvetica Neue',
                fontWeight: '300',
                fontSize: 14,
                lineHeight: 14,
                letterSpacing: 0.84,
                color: '#000',
              }}
            />
          </View>

          {/* House / Apartment Number */}
          <View className="mb-6">
            <Text style={[INPUT_HEADER_STYLE, { marginBottom: 8 }]}>
              House / Apartment Number
            </Text>
            <TextInput
              value={apartmentNumber}
              onChangeText={setApartmentNumber}
              style={{
                height: 28,
                width: '100%',
                borderBottomWidth: 1,
                borderBottomColor: '#F0F0F0',
                paddingVertical: 0,
                fontFamily: 'Helvetica Neue',
                fontWeight: '300',
                fontSize: 14,
                lineHeight: 14,
                letterSpacing: 0.84,
                color: '#000',
              }}
            />
          </View>

          {/* State / Province */}
          <View className="mb-6">
            <Text style={[INPUT_HEADER_STYLE, { marginBottom: 8 }]}>
              State / Province
            </Text>
            <TextInput
              value={stateProvince}
              onChangeText={setStateProvince}
              style={{
                height: 28,
                width: '100%',
                borderBottomWidth: 1,
                borderBottomColor: '#F0F0F0',
                paddingVertical: 0,
                fontFamily: 'Helvetica Neue',
                fontWeight: '300',
                fontSize: 14,
                lineHeight: 14,
                letterSpacing: 0.84,
                color: '#000',
              }}
            />
          </View>

          {/* Region */}
          <View className="mb-6">
            <Text style={[INPUT_HEADER_STYLE, { marginBottom: 8 }]}>
              Region
            </Text>
            <TextInput
              value={region}
              onChangeText={setRegion}
              style={{
                height: 28,
                width: '100%',
                borderBottomWidth: 1,
                borderBottomColor: '#F0F0F0',
                paddingVertical: 0,
                fontFamily: 'Helvetica Neue',
                fontWeight: '300',
                fontSize: 14,
                lineHeight: 14,
                letterSpacing: 0.84,
                color: '#000',
              }}
            />
          </View>

          {/* Postal Code */}
          <View className="mb-6">
            <Text style={[INPUT_HEADER_STYLE, { marginBottom: 8 }]}>
              Postal Code
            </Text>
            <TextInput
              value={postalCode}
              onChangeText={setPostalCode}
              style={{
                height: 28,
                width: '100%',
                borderBottomWidth: 1,
                borderBottomColor: '#F0F0F0',
                paddingVertical: 0,
                fontFamily: 'Helvetica Neue',
                fontWeight: '300',
                fontSize: 14,
                lineHeight: 14,
                letterSpacing: 0.84,
                color: '#000',
              }}
            />
          </View>

          {/* Phone */}
          <View className="mb-8">
            <Text style={[INPUT_HEADER_STYLE, { marginBottom: 8 }]}>
              Country Code
            </Text>
            <TextInput
              value={countryCode}
              onChangeText={setCountryCode}
              style={{
                height: 28,
                width: '100%',
                borderBottomWidth: 1,
                borderBottomColor: '#F0F0F0',
                paddingVertical: 0,
                fontFamily: 'Helvetica Neue',
                fontWeight: '300',
                fontSize: 14,
                lineHeight: 14,
                letterSpacing: 0.84,
                color: '#000',
              }}
            />

            <Text style={[INPUT_HEADER_STYLE, { marginBottom: 8, marginTop: 16 }]}>
              Phone Number
            </Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              style={{
                height: 28,
                width: '100%',
                borderBottomWidth: 1,
                borderBottomColor: '#F0F0F0',
                paddingVertical: 0,
                fontFamily: 'Helvetica Neue',
                fontWeight: '300',
                fontSize: 14,
                lineHeight: 14,
                letterSpacing: 0.84,
                color: '#000',
              }}
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
