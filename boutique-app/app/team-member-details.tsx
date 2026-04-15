import React, { useMemo } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { TEAM_MEMBER_IMAGES, useTeamStore } from '../store/useTeamStore';

export default function TeamMemberDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const members = useTeamStore((state) => state.members);
  const deleteMember = useTeamStore((state) => state.deleteMember);
  const member = useMemo(
    () => members.find((item) => item.id === params.id) ?? null,
    [members, params.id]
  );

  const handleDelete = () => {
    if (!member) {
      router.replace('/(tabs)/team');
      return;
    }

    Alert.alert('Delete Member', 'Are you sure you want to remove this team member?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteMember(member.id);
          router.replace('/(tabs)/team');
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-5" style={{ paddingTop: insets.top + 8 }}>
        <TouchableOpacity onPress={() => router.back()} className="mb-8">
          <Ionicons name="arrow-back" size={18} color="black" />
        </TouchableOpacity>

        <Text className="text-[13px] uppercase tracking-[2px] text-black/70 mb-6">
          Member Details
        </Text>

        {!member ? (
          <View className="border border-[#1A1A1A] px-5 py-10 items-center mt-6">
            <Text className="text-[13px] text-black mb-2">Member not found</Text>
            <Text className="text-[11px] text-black/50 text-center mb-5">
              This team member may have been removed already.
            </Text>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => router.replace('/(tabs)/team')}
              className="bg-black px-6 py-4"
            >
              <Text className="text-[11px] uppercase tracking-[1px] text-white">Back To Team</Text>
            </TouchableOpacity>
          </View>
        ) : (
        <View className="border-t border-[#EDEDED] pt-8 mb-8">
          <View className="flex-row items-start justify-between">
            <View className="flex-row flex-1">
              <Image
                source={TEAM_MEMBER_IMAGES[member.imageKey]}
                style={{ width: 98, height: 98 }}
                contentFit="cover"
              />
              <View className="ml-4 flex-1 mt-6">
                <Text
                  className="text-[20px] text-black"
                  style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
                >
                  {member.name}
                </Text>
                <Text className="text-[14px] text-black/55 mt-3">{member.role}</Text>
                <Text className="text-[14px] text-black/55 mt-2">{member.email}</Text>
              </View>
            </View>

            <View className="flex-row items-center ml-4 mt-1">
              <View className="w-2 h-2 rounded-full bg-black mr-2" />
              <Text className="text-[11px] text-black">{member.status}</Text>
            </View>
          </View>

          <View className="mt-8">
            <Text
              className="text-[12px] text-black mb-4"
              style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
            >
              Languages
            </Text>
            <View className="flex-row items-center">
              <Ionicons name="globe-outline" size={24} color="#1A1A1A" />
              <Text className="text-[13px] text-black ml-4">{member.languages.join(', ')}</Text>
            </View>
          </View>

          <View className="flex-row justify-between items-start mt-10">
            <View>
              <Text className="text-[13px] tracking-[2px] text-black/65 mb-2">Availability badge</Text>
              <Text className="text-[18px] text-black/80">{member.availabilityOn ? 'ON' : 'OFF'}</Text>
              <Text className="text-[11px] text-black/45 mt-2">
                {member.availabilitySchedule.filter((entry) => entry.value !== 'Closed').length} days configured
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() =>
                router.push({
                  pathname: '/video-call-availability',
                  params: {
                    state: 'complete',
                    memberId: member.id,
                    memberName: member.name,
                  },
                })
              }
              className="border border-black px-6 py-4 flex-row items-center"
            >
              <Feather name="edit-2" size={14} color="black" />
              <Text className="text-[11px] text-black ml-2">Edit Availability</Text>
            </TouchableOpacity>
          </View>
        </View>
        )}

        <View className="mt-auto flex-row pb-10">
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              if (member) {
                router.push({
                  pathname: '/team-invite',
                  params: { id: member.id },
                });
              }
            }}
            className="flex-1 border border-black py-4 items-center justify-center mr-1 flex-row"
          >
            <Feather name="edit-2" size={14} color="black" />
            <Text className="text-[11px] text-black ml-2">Edit Member</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleDelete}
            className="flex-1 bg-[#C9491A] py-4 items-center justify-center ml-1 flex-row"
          >
            <Ionicons name="trash-outline" size={14} color="white" />
            <Text className="text-[11px] text-white ml-2">Delete Member</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
