import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, TextInput, Alert, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { DEFAULT_TEAM_AVAILABILITY, useTeamStore } from '../store/useTeamStore';

const LANGUAGE_OPTIONS = ['English', 'French', 'German', 'Arabic', 'Turkish'];

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
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [languagesOpen, setLanguagesOpen] = useState(false);
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
    setSelectedLanguages(editingMember.languages);
    setAvailabilityOn(editingMember.availabilityOn);
  }, [editingMember]);

  const toggleLanguage = (option: string) => {
    setSelectedLanguages((current) =>
      current.includes(option)
        ? current.filter((language) => language !== option)
        : [...current, option]
    );
  };

  const handleSave = () => {
    if (!name.trim() || !role.trim() || !email.trim() || selectedLanguages.length === 0) {
      Alert.alert('Missing Details', 'Please complete all member fields before saving.');
      return;
    }

    const payload = {
      name: name.trim(),
      role: role.trim(),
      email: email.trim(),
      languages: selectedLanguages,
      availabilityOn,
      availabilitySchedule: editingMember?.availabilitySchedule ?? DEFAULT_TEAM_AVAILABILITY,
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
            : 'Add a team member, define supported languages, and control whether they can take consultations.'}
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

        <View className="mb-8">
          <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-3">Select Languages *</Text>
          <View className="relative" style={{ zIndex: languagesOpen ? 60 : 1 }}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setLanguagesOpen((v) => !v)}
              className="border border-[#D9D9D9] px-4 py-4 flex-row items-center justify-between"
            >
              <Text className={`text-[12px] ${selectedLanguages.length ? 'text-black' : 'text-black/35'}`}>
                {selectedLanguages.length ? selectedLanguages.join(', ') : 'Select languages'}
              </Text>
              <Ionicons name={languagesOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#1A1A1A" />
            </TouchableOpacity>

            {languagesOpen ? (
              <>
                <Pressable className="absolute inset-0" onPress={() => setLanguagesOpen(false)} />
                <View
                  className="absolute left-0 right-0 top-full mt-2 border border-[#D9D9D9] bg-white"
                  style={{
                    zIndex: 70,
                    elevation: 12,
                    shadowColor: '#000',
                    shadowOpacity: 0.08,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 6 },
                  }}
                >
                  {LANGUAGE_OPTIONS.map((option, index) => {
                    const isSelected = selectedLanguages.includes(option);
                    return (
                      <TouchableOpacity
                        key={option}
                        activeOpacity={0.85}
                        onPress={() => toggleLanguage(option)}
                        className="px-4 py-4 flex-row items-center justify-between"
                        style={{
                          borderBottomWidth: index === LANGUAGE_OPTIONS.length - 1 ? 0 : 1,
                          borderBottomColor: '#ECECEC',
                        }}
                      >
                        <Text className="text-[12px] text-black">{option}</Text>
                        {isSelected ? <Ionicons name="checkmark" size={18} color="black" /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}
          </View>
          <Text className="text-[10px] text-black/35 mt-2">
            {selectedLanguages.length > 0 ? 'Tap to add/remove languages.' : 'Choose one or more languages for this team member.'}
          </Text>
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
