import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, ScrollView, Pressable, Alert, TextInput, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { TEAM_MEMBER_IMAGES, useTeamStore } from '../../store/useTeamStore';

export default function TeamScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const members = useTeamStore((state) => state.members);
  const deleteMember = useTeamStore((state) => state.deleteMember);
  const fetchMembers = useTeamStore((state) => state.fetchMembers);
  const loading = useTeamStore((state) => state.loading);

  // Refresh from the backend each time the tab gains focus (e.g. after
  // returning from the invite screen) so a new Pending advisor shows up.
  useFocusEffect(
    useCallback(() => {
      fetchMembers();
    }, [fetchMembers])
  );

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const haystack = `${m.name} ${m.role} ${m.email}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [members, searchQuery]);

  const handleDeleteMember = (id: string) => {
    Alert.alert('Delete Member', 'Are you sure you want to remove this team member?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteMember(id).catch((e: any) =>
            Alert.alert('Could not remove member', e?.message ?? 'Please try again.')
          );
        },
      },
    ]);
  };

  const handleEditQuickAction = () => {
    if (members.length === 0) {
      Alert.alert('No Members', 'Add a team member first before editing.');
      return;
    }

    if (members.length === 1) {
      router.push({
        pathname: '/team-invite',
        params: { id: members[0].id },
      });
      return;
    }

    Alert.alert(
      'Edit Member',
      'Choose the team member you want to edit.',
      [
        ...members.slice(0, 3).map((member) => ({
          text: member.name,
          onPress: () =>
            router.push({
              pathname: '/team-invite',
              params: { id: member.id },
            }),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  };

  const handleDeleteQuickAction = () => {
    if (members.length === 0) {
      Alert.alert('No Members', 'Add a team member first before deleting.');
      return;
    }

    if (members.length === 1) {
      handleDeleteMember(members[0].id);
      return;
    }

    Alert.alert(
      'Delete Member',
      'Choose the team member you want to delete.',
      [
        ...members.slice(0, 3).map((member) => ({
          text: member.name,
          style: 'destructive' as const,
          onPress: () => handleDeleteMember(member.id),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1">
        {menuOpen ? <Pressable className="absolute inset-0 z-10" onPress={() => setMenuOpen(false)} /> : null}

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: 120 }}
        >
          <View className="px-5">
          <View className="flex-row items-center justify-between mb-6">
            <Text
              className="text-[18px] text-black"
              style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
            >
              All Team Members
            </Text>

            <View className="relative flex-row items-center z-20">
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => router.push('/team-invite')}
                className="bg-black px-6 py-4 mr-3"
              >
                <Text className="text-[14px] uppercase tracking-[1px] text-white">Add Member</Text>
              </TouchableOpacity>
              {menuOpen ? (
                <View
                  className="absolute right-0 top-full mt-2 w-[140px] border border-[#1A1A1A] bg-white"
                  style={{
                    shadowColor: '#000',
                    shadowOpacity: 0.18,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 16,
                  }}
                >
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      setMenuOpen(false);
                      handleEditQuickAction();
                    }}
                    className="px-5 py-4"
                  >
                    <Text className="text-[12px] text-black">Edit Member</Text>
                  </TouchableOpacity>
                  <View className="border-t border-[#E9E9E9]" />
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      setMenuOpen(false);
                      handleDeleteQuickAction();
                    }}
                    className="px-5 py-4"
                  >
                    <Text className="text-[12px] text-black">Delete Member</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          </View>

          <View style={{ borderTopWidth: 1, borderTopColor: '#E6E6E6', borderBottomWidth: 1, borderBottomColor: '#E6E6E6', marginBottom: 30 }}>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="SEARCH TEAM MEMBER NAME..."
              placeholderTextColor="#9B9B9B"
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                height: 62,
                color: '#000000',
                fontFamily: 'Helvetica Neue',
                fontSize: 12,
                fontWeight: '400',
                letterSpacing: 0.36,
                textAlign: 'center',
                textTransform: 'uppercase',
              }}
            />
          </View>

          {loading && members.length === 0 ? (
            <View className="py-20 items-center">
              <ActivityIndicator color="#1A1A1A" />
            </View>
          ) : members.length === 0 ? (
            <View className="border border-[#1A1A1A] px-5 py-10 items-center">
              <Text className="text-[13px] text-black mb-2">No team members yet</Text>
              <Text className="text-[11px] text-black/50 text-center mb-5">
                Add your first consultant to start managing availability and assignments.
              </Text>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => router.push('/team-invite')}
                className="bg-black px-6 py-4"
              >
                <Text className="text-[11px] uppercase tracking-[1px] text-white">Add Member</Text>
              </TouchableOpacity>
            </View>
          ) : filteredMembers.length === 0 ? (
            <View className="py-20 items-center">
              <Text className="text-[14px] text-black mb-2">No matching members</Text>
              <Text className="text-[11px] text-center text-black/35 leading-5 px-10">
                Try searching with another name or email.
              </Text>
            </View>
          ) : (
            filteredMembers.map((member) => (
            <TouchableOpacity
              key={member.id}
              activeOpacity={0.9}
              onPress={() =>
                router.push({
                  pathname: '/team-member-details',
                  params: { id: member.id },
                })
              }
              className="border border-[#1A1A1A] p-5 mb-6 flex-row items-start justify-between"
            >
              <View className="flex-row flex-1">
                <Image
                  source={TEAM_MEMBER_IMAGES[member.imageKey]}
                  style={{ width: 54, height: 54 }}
                  contentFit="cover"
                />
                <View className="ml-4 flex-1">
                  <Text className="text-[13px] text-black" style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}>
                    {member.name || 'Pending advisor'}
                  </Text>
                  <Text className="text-[11px] text-black/55 mt-1">{member.role}</Text>
                  <Text className="text-[11px] text-black/55 mt-0.5">{member.email}</Text>
                  {member.languages.length > 0 ? (
                    <Text className="text-[10px] text-black/45 mt-2">
                      Languages: {member.languages.join(', ')}
                    </Text>
                  ) : null}
                  {member.status === 'pending' ? (
                    <Text className="text-[10px] text-black/45 mt-2">Invitation pending acceptance</Text>
                  ) : (
                    <Text className="text-[10px] text-black/45 mt-1">
                      Availability: {member.availabilityOn ? 'Enabled' : 'Disabled'}
                    </Text>
                  )}
                </View>
              </View>

              <View className="flex-row items-center ml-4 mt-1">
                <View
                  className="w-2 h-2 rounded-full mr-2"
                  style={{ backgroundColor: member.status === 'pending' ? '#C9831A' : '#1A1A1A' }}
                />
                <Text
                  className="text-[11px]"
                  style={{ color: member.status === 'pending' ? '#C9831A' : '#1A1A1A' }}
                >
                  {member.status === 'pending' ? 'Pending' : member.availabilityOn ? 'Online' : 'Offline'}
                </Text>
              </View>
            </TouchableOpacity>
            ))
          )}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
