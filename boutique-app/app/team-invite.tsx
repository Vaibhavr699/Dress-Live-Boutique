import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, TextInput, Alert, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TEAM_ROLE_OPTIONS, useTeamStore } from '../store/useTeamStore';

const LANGUAGE_OPTIONS = ['English', 'French', 'German', 'Arabic', 'Turkish'];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function TeamInviteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const members = useTeamStore((state) => state.members);
  const fetchMembers = useTeamStore((state) => state.fetchMembers);
  const inviteMember = useTeamStore((state) => state.inviteMember);
  const updateMember = useTeamStore((state) => state.updateMember);

  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [roleOpen, setRoleOpen] = useState(false);
  const [languagesOpen, setLanguagesOpen] = useState(false);
  const [availabilityOn, setAvailabilityOn] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const editingMember = useMemo(
    () => members.find((member) => member.id === params.id) ?? null,
    [members, params.id]
  );

  // Editing via a deep link / cold start: make sure the store is populated.
  useEffect(() => {
    if (params.id && members.length === 0) {
      fetchMembers();
    }
  }, [params.id, members.length, fetchMembers]);

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

  const handleSave = async () => {
    if (submitting) return;

    if (editingMember) {
      if (!name.trim() || !role.trim() || selectedLanguages.length === 0) {
        Alert.alert('Missing Details', 'Please complete all member fields before saving.');
        return;
      }
      setSubmitting(true);
      try {
        await updateMember(editingMember.id, {
          name: name.trim(),
          role: role.trim(),
          languages: selectedLanguages,
          availabilityOn,
        });
        router.replace({ pathname: '/team-member-details', params: { id: editingMember.id } });
      } catch (e: any) {
        Alert.alert('Could not save', e?.message ?? 'Please try again.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !role.trim()) {
      Alert.alert('Missing Details', "Enter the advisor's email and choose a role.");
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      await inviteMember({ email: trimmedEmail, role: role.trim() });
      Alert.alert(
        'Invitation Sent',
        `We've emailed an invitation to ${trimmedEmail}. They'll show as Pending until they accept and set a password.`,
        [{ text: 'OK', onPress: () => router.replace('/(tabs)/team') }]
      );
    } catch (e: any) {
      Alert.alert('Could not send invite', e?.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 40, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => router.back()} className="mb-8">
          <Ionicons name="arrow-back" size={18} color="black" />
        </TouchableOpacity>

        <Text
          className="text-[24px] text-black mb-1"
          style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
        >
          {editingMember ? 'Edit Team Member' : 'Invite An Advisor'}
        </Text>
        <Text className="text-[10px] text-black/45 leading-4 mb-8">
          {editingMember
            ? 'Update your team member details and consultant availability.'
            : "Enter the advisor's email and role. We'll email them an invitation — they appear as Pending until they accept."}
        </Text>

        {/* Name — edit only (advisor sets their own name on accept). */}
        {editingMember ? (
          <View className="mb-5">
            <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">Member Name *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              className="border-b border-[#ECECEC] pb-2 text-[12px] text-black"
            />
          </View>
        ) : null}

        {/* Email — entered for invite, read-only when editing. */}
        <View className="mb-5">
          <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">Advisor Email *</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            editable={!editingMember}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="advisor@email.com"
            placeholderTextColor="#B5B5B5"
            className="border-b border-[#ECECEC] pb-2 text-[12px] text-black"
            style={editingMember ? { color: '#9B9B9B' } : undefined}
          />
        </View>

        {/* Role — dropdown (predefined roles). */}
        <View className="mb-5">
          <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">Role *</Text>
          <View className="relative" style={{ zIndex: roleOpen ? 80 : 2 }}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                setRoleOpen((v) => !v);
                setLanguagesOpen(false);
              }}
              className="border border-[#D9D9D9] px-4 py-4 flex-row items-center justify-between"
            >
              <Text className={`text-[12px] ${role ? 'text-black' : 'text-black/35'}`}>
                {role || 'Select a role'}
              </Text>
              <Ionicons name={roleOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#1A1A1A" />
            </TouchableOpacity>

            {roleOpen ? (
              <>
                <Pressable className="absolute inset-0" onPress={() => setRoleOpen(false)} />
                <View
                  className="absolute left-0 right-0 top-full mt-2 border border-[#D9D9D9] bg-white"
                  style={{ zIndex: 90, elevation: 12, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } }}
                >
                  {TEAM_ROLE_OPTIONS.map((option, index) => (
                    <TouchableOpacity
                      key={option}
                      activeOpacity={0.85}
                      onPress={() => {
                        setRole(option);
                        setRoleOpen(false);
                      }}
                      className="px-4 py-4 flex-row items-center justify-between"
                      style={{
                        borderBottomWidth: index === TEAM_ROLE_OPTIONS.length - 1 ? 0 : 1,
                        borderBottomColor: '#ECECEC',
                      }}
                    >
                      <Text className="text-[12px] text-black">{option}</Text>
                      {role === option ? <Ionicons name="checkmark" size={18} color="black" /> : null}
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}
          </View>
        </View>

        {/* Languages + availability — edit only. */}
        {editingMember ? (
          <>
            <View className="mb-8">
              <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-3">Select Languages *</Text>
              <View className="relative" style={{ zIndex: languagesOpen ? 60 : 1 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    setLanguagesOpen((v) => !v);
                    setRoleOpen(false);
                  }}
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
                      style={{ zIndex: 70, elevation: 12, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } }}
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
                  className={`w-12 h-7 rounded-full px-1 justify-center ${availabilityOn ? 'bg-black' : 'bg-[#E9E9E9]'}`}
                >
                  <View className={`w-5 h-5 rounded-full bg-white ${availabilityOn ? 'self-end' : 'self-start'}`} />
                </TouchableOpacity>
                <Text className="text-[12px] text-black/60 ml-3">On</Text>
              </View>
            </View>
          </>
        ) : null}

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handleSave}
          disabled={submitting}
          className="bg-black py-4 items-center justify-center mt-auto"
          style={submitting ? { opacity: 0.6 } : undefined}
        >
          <Text className="text-[11px] uppercase tracking-[1px] text-white">
            {submitting
              ? editingMember ? 'Saving…' : 'Sending…'
              : editingMember ? 'Save Changes' : 'Send Invitation'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
