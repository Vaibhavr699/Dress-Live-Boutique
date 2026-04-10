import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTeamStore } from '../store/useTeamStore';

const LANGUAGE_OPTIONS = ['English, French', 'English, German', 'English, Arabic'];

export default function TeamInviteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const members = useTeamStore((state) => state.members);
  const addMember = useTeamStore((state) => state.addMember);
  const updateMember = useTeamStore((state) => state.updateMember);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [language, setLanguage] = useState('');
  const [languageOpen, setLanguageOpen] = useState(false);
  const [availabilityOn, setAvailabilityOn] = useState(false);
  const editingMember = useMemo(
    () => members.find((member) => member.id === params.id) ?? null,
    [members, params.id]
  );

  useEffect(() => {
    if (!editingMember) {
      return;
    }

    setName(editingMember.name);
    setRole(editingMember.role);
    setEmail(editingMember.email);
    setLanguage(editingMember.languages);
    setAvailabilityOn(editingMember.availabilityOn);
  }, [editingMember]);

  const handleSave = () => {
    if (!name.trim() || !role.trim() || !email.trim() || !language.trim()) {
      Alert.alert('Missing Details', 'Please complete all member fields before saving.');
      return;
    }

    const payload = {
      name: name.trim(),
      role: role.trim(),
      email: email.trim(),
      languages: language,
      availabilityOn,
    };

    if (editingMember) {
      updateMember(editingMember.id, payload);
      router.replace({
        pathname: '/team-member-details',
        params: { id: editingMember.id },
      });
      return;
    }

    const newId = addMember(payload);
    router.replace({
      pathname: '/team-member-details',
      params: { id: newId },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-5" style={{ paddingTop: insets.top + 8 }}>
        <TouchableOpacity onPress={() => router.back()} className="mb-8">
          <Ionicons name="arrow-back" size={18} color="black" />
        </TouchableOpacity>

        <Text
          className="text-[24px] text-black mb-1"
          style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
        >
          {editingMember ? 'Edit Team Member' : 'Invite New Team Member'}
        </Text>
        <Text className="text-[10px] text-black/45 leading-4 mb-8">
          {editingMember
            ? 'Update your team member details and consultant availability.'
            : 'Please enter your team member email to sent invite.'}
        </Text>

        <View className="mb-5">
          <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">Member Name *</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            className="border-b border-[#ECECEC] pb-2 text-[12px] text-black"
          />
        </View>

        <View className="mb-5">
          <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">Role *</Text>
          <TextInput
            value={role}
            onChangeText={setRole}
            className="border-b border-[#ECECEC] pb-2 text-[12px] text-black"
          />
        </View>

        <View className="mb-5">
          <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">Write Email *</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            className="border-b border-[#ECECEC] pb-2 text-[12px] text-black"
          />
        </View>

        <View className="mb-8" style={{ zIndex: languageOpen ? 50 : 1 }}>
          <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">Seclet Languges *</Text>
          <View className="relative">
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setLanguageOpen((current) => !current)}
              className="border-b border-[#ECECEC] pb-2 flex-row items-center justify-between"
            >
              <Text className={`text-[12px] ${language ? 'text-black' : 'text-black/30'}`}>
                {language || 'Select here'}
              </Text>
              <Ionicons
                name={languageOpen ? 'chevron-up' : 'chevron-down'}
                size={13}
                color="#7A7A7A"
              />
            </TouchableOpacity>

            {languageOpen ? (
              <View
                className="absolute left-0 right-0 top-full mt-2 border border-[#D9D9D9] bg-white"
                style={{
                  zIndex: 60,
                  elevation: 12,
                  shadowColor: '#000',
                  shadowOpacity: 0.08,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 6 },
                }}
              >
                {LANGUAGE_OPTIONS.map((option, index) => (
                  <TouchableOpacity
                    key={option}
                    activeOpacity={0.85}
                    onPress={() => {
                      setLanguage(option);
                      setLanguageOpen(false);
                    }}
                    className="px-3 py-3 flex-row items-center"
                    style={{
                      borderBottomWidth: index === LANGUAGE_OPTIONS.length - 1 ? 0 : 1,
                      borderBottomColor: '#ECECEC',
                    }}
                  >
                    <View className="w-5">
                      {language === option ? (
                        <Ionicons name="checkmark" size={15} color="black" />
                      ) : null}
                    </View>
                    <Text className="text-[12px] text-black">{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        <View className="mt-3">
          <Text
            className="text-[12px] text-black mb-5"
            style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
          >
            Set Consultant Availability
          </Text>

          <View className="flex-row items-center">
            <Text className="text-[12px] text-black/60 mr-3">Off</Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setAvailabilityOn((current) => !current)}
              className={`w-12 h-7 rounded-full px-1 justify-center ${
                availabilityOn ? 'bg-black' : 'bg-[#E9E9E9]'
              }`}
            >
              <View
                className={`w-5 h-5 rounded-full bg-white ${
                  availabilityOn ? 'self-end' : 'self-start'
                }`}
              />
            </TouchableOpacity>
            <Text className="text-[12px] text-black/60 ml-3">On</Text>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handleSave}
          className="bg-black py-4 items-center justify-center mt-auto mb-10"
        >
          <Text className="text-[11px] uppercase tracking-[1px] text-white">
            {editingMember ? 'Save Changes' : 'Save New Member'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
