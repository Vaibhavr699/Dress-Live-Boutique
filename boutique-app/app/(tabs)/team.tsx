import React, { useState } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { TEAM_MEMBER_IMAGES, useTeamStore } from '../../store/useTeamStore';

export default function TeamScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const members = useTeamStore((state) => state.members);
  const deleteMember = useTeamStore((state) => state.deleteMember);

  const handleDeleteMember = (id: string) => {
    Alert.alert('Delete Member', 'Are you sure you want to remove this team member?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteMember(id),
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
              className="text-[16px] text-black"
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
                <Text className="text-[11px] uppercase tracking-[1px] text-white">Add Member</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setMenuOpen((current) => !current)}
                className="w-10 h-10 items-center justify-center"
              >
                <Ionicons name="ellipsis-vertical" size={18} color="#1A1A1A" />
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

          <View className="border-t border-[#EDEDED] pt-7 mb-9">
            <Text className="text-[10px] uppercase tracking-[0.8px] text-center text-black/30">
              Search Team Member Name...
            </Text>
          </View>

          {members.length === 0 ? (
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
          ) : (
            members.map((member) => (
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
                    {member.name}
                  </Text>
                  <Text className="text-[11px] text-black/55 mt-1">{member.role}</Text>
                  <Text className="text-[11px] text-black/55 mt-0.5">{member.email}</Text>
                  <Text className="text-[10px] text-black/45 mt-2">
                    Languages: {member.languages.join(', ')}
                  </Text>
                  <Text className="text-[10px] text-black/45 mt-1">
                    Availability: {member.availabilityOn ? 'Enabled' : 'Disabled'}
                  </Text>
                </View>
              </View>

              <View className="flex-row items-center ml-4 mt-1">
                <View className="w-2 h-2 rounded-full bg-black mr-2" />
                <Text className="text-[11px] text-black">{member.status}</Text>
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
