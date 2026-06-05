import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@shared/api/api';
import { useAuthStore } from '@shared/store/useAuthStore';

const INPUT_HEADER_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '300' as const,
  fontSize: 12,
  lineHeight: 12,
  letterSpacing: 0.72,
  textTransform: 'uppercase' as const,
  color: '#6E6E6E',
};

function Field({
  label,
  value,
  onChangeText,
  editable,
  keyboardType,
  autoCapitalize,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  editable: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  autoCapitalize?: 'none' | 'words' | 'sentences';
  placeholder?: string;
}) {
  return (
    <View className="mb-5">
      <Text style={[INPUT_HEADER_STYLE, { marginBottom: 8 }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        placeholder={placeholder}
        placeholderTextColor="#B5B5B5"
        className="border-b border-[#ECECEC] pb-2 text-[12px] text-black"
      />
    </View>
  );
}

export default function AdvisorProfileEditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s: any) => s.user);
  const setUser = useAuthStore((s: any) => s.setUser);

  const [fullName, setFullName] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [phone, setPhone] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [stateValue, setStateValue] = useState('');
  const [region, setRegion] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [saving, setSaving] = useState(false);

  // Hydrate from the auth store so the form shows current values and Save
  // doesn't blank out anything the advisor leaves untouched.
  useEffect(() => {
    setFullName(user?.full_name ?? '');
    setCountryCode(user?.country_code ?? '');
    setPhone(user?.phone ?? '');
    setFullAddress(user?.address ?? '');
    setHouseNumber(user?.apartment_number ?? '');
    setStateValue(user?.state_province ?? '');
    setRegion(user?.region ?? '');
    setPostalCode(user?.postal_code ?? '');
  }, [
    user?.full_name,
    user?.country_code,
    user?.phone,
    user?.address,
    user?.apartment_number,
    user?.state_province,
    user?.region,
    user?.postal_code,
  ]);

  const handleSave = async () => {
    if (saving) return;
    if (!fullName.trim()) {
      Alert.alert('Name required', 'Please enter your full name.');
      return;
    }
    setSaving(true);
    try {
      const updated = await api.put('/users/me', {
        full_name: fullName.trim(),
        country_code: countryCode.trim() || null,
        phone: phone.trim() || null,
        address: fullAddress.trim() || null,
        apartment_number: houseNumber.trim() || null,
        state_province: stateValue.trim() || null,
        region: region.trim() || null,
        postal_code: postalCode.trim() || null,
      });
      // Keep the store in sync so Profile reflects the change instantly.
      setUser(updated);
      router.back();
    } catch (err: any) {
      Alert.alert('Could not save', err?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 40, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => router.back()} className="mb-8" disabled={saving}>
          <Ionicons name="arrow-back" size={18} color="black" />
        </TouchableOpacity>

        <Text className="text-[24px] text-black mb-1" style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}>
          Personal Details
        </Text>
        <Text className="text-[10px] text-black/45 leading-4 mb-8">
          Update your name, phone number, and address.
        </Text>

        <Field label="Full Name *" value={fullName} onChangeText={setFullName} editable={!saving} autoCapitalize="words" placeholder="Your name" />

        {/* Email is read-only — it's the login identity and changing it needs
            the verification flow. Shown for reference. */}
        <View className="mb-5">
          <Text style={[INPUT_HEADER_STYLE, { marginBottom: 8 }]}>Email</Text>
          <Text className="border-b border-[#ECECEC] pb-2 text-[12px] text-black/45">{user?.email ?? '—'}</Text>
        </View>

        <View className="flex-row" style={{ gap: 12 }}>
          <View style={{ width: 96 }}>
            <Field label="Code" value={countryCode} onChangeText={setCountryCode} editable={!saving} keyboardType="phone-pad" placeholder="+1" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Phone Number" value={phone} onChangeText={setPhone} editable={!saving} keyboardType="phone-pad" placeholder="000 000 0000" />
          </View>
        </View>

        <Field label="Full Address" value={fullAddress} onChangeText={setFullAddress} editable={!saving} placeholder="Street address" />
        <Field label="House / Apartment Number" value={houseNumber} onChangeText={setHouseNumber} editable={!saving} />
        <Field label="State / Province" value={stateValue} onChangeText={setStateValue} editable={!saving} />
        <Field label="Region" value={region} onChangeText={setRegion} editable={!saving} />
        <Field label="Postal Code" value={postalCode} onChangeText={setPostalCode} editable={!saving} keyboardType="default" />

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handleSave}
          disabled={saving}
          className="bg-black py-4 items-center justify-center mt-4 mb-10"
          style={{ opacity: saving ? 0.6 : 1 }}
        >
          {saving ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-[11px] uppercase tracking-[1px] text-white">Save</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
