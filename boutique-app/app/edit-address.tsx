import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@shared/api/api';
import { useAuthStore } from '@shared/store/useAuthStore';

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
  letterSpacing: 0.72,
  textTransform: 'uppercase' as const,
  color: '#6E6E6E',
};

function AddressField({
  label,
  value,
  onChangeText,
  editable,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  editable: boolean;
}) {
  return (
    <View className="mb-5">
      <Text style={[INPUT_HEADER_STYLE, { marginBottom: 8 }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        className="border-b border-[#ECECEC] pb-2 text-[12px] text-black"
      />
    </View>
  );
}

export default function EditAddressScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s: any) => s.user);
  const setUser = useAuthStore((s: any) => s.setUser);

  const [fullAddress, setFullAddress] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [stateValue, setStateValue] = useState('');
  const [region, setRegion] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [saving, setSaving] = useState(false);

  // Hydrate the form from whatever the auth store already has. Without
  // this, the form blanks every time the partner opens it and the Save
  // button would overwrite their stored address with empty strings.
  useEffect(() => {
    setFullAddress(user?.address ?? '');
    setHouseNumber(user?.apartment_number ?? '');
    setStateValue(user?.state_province ?? '');
    setRegion(user?.region ?? '');
    setPostalCode(user?.postal_code ?? '');
  }, [user?.address, user?.apartment_number, user?.state_province, user?.region, user?.postal_code]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await api.put('/users/me', {
        address: fullAddress.trim() || null,
        apartment_number: houseNumber.trim() || null,
        state_province: stateValue.trim() || null,
        region: region.trim() || null,
        postal_code: postalCode.trim() || null,
      });
      // Keep the local store in sync so the next render shows the saved
      // values without a /users/me round-trip.
      setUser(updated);
      router.back();
    } catch (err: any) {
      Alert.alert('Could not save address', err?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View className="flex-1 px-5" style={{ paddingTop: insets.top + 8 }}>
          <TouchableOpacity onPress={() => router.back()} className="mb-8" disabled={saving}>
            <Ionicons name="arrow-back" size={18} color="black" />
          </TouchableOpacity>

          {/* Scrollable so the on-screen keyboard never covers the lower fields on
              small screens; flexGrow keeps the Save button pinned to the bottom
              (via mt-auto) when the content is shorter than the viewport. */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
          >
            <Text style={[TITLE_STYLE, { marginBottom: 32 }]}>Edit Address</Text>
            <Text style={[DESCRIPTION_STYLE, { marginBottom: 32 }]}>
              To complete your order, you must first enter your account information. You can update it at any time from your account.
            </Text>

            <AddressField label="Full Address *" value={fullAddress} onChangeText={setFullAddress} editable={!saving} />
            <AddressField label="House / Apartment Number" value={houseNumber} onChangeText={setHouseNumber} editable={!saving} />
            <AddressField label="State / Province" value={stateValue} onChangeText={setStateValue} editable={!saving} />
            <AddressField label="Region" value={region} onChangeText={setRegion} editable={!saving} />
            <AddressField label="Postal Code" value={postalCode} onChangeText={setPostalCode} editable={!saving} />

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handleSave}
              disabled={saving}
              className="bg-black py-4 items-center justify-center mt-auto mb-10"
              style={{ opacity: saving ? 0.6 : 1 }}
            >
              {saving ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-[11px] uppercase tracking-[1px] text-white">Save</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
