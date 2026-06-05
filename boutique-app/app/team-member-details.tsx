import React, { useMemo, useState } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { TEAM_MEMBER_IMAGES, useTeamStore } from '../store/useTeamStore';
import { FigmaConfirmModal } from '../components/FigmaConfirmModal';
import { SvgXml } from 'react-native-svg';

const LANGUAGES_SVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M4.514 15L6.16 16.264C6.51 16.532 6.971 16.576 7.361 16.382C7.754 16.189 7.998 15.796 7.998 15.359L8 10.504C8 9.126 6.879 8.004 5.501 8.004H2.501C2.501 8.004 2.501 8.003 2.499 8.003C1.832 8.003 1.205 8.263 0.732 8.734C0.26 9.207 0 9.835 0 10.503V12.502C0 13.881 1.121 15.002 2.5 15.002H4.514V15ZM1 12.5V10.501C1 10.1 1.156 9.723 1.439 9.44C1.722 9.157 2.099 9 2.499 9H5.501C6.327 9 7 9.676 7 10.503V15.358C6.99 15.487 6.876 15.539 6.77 15.47L4.989 14.103C4.901 14.036 4.795 13.999 4.684 13.999H2.5C1.673 13.999 1 13.326 1 12.499V12.5ZM23.469 11C23.193 11.011 22.979 11.244 22.99 11.52C22.997 11.679 23.001 11.839 23.001 11.999C23.001 13.411 22.724 14.757 22.237 15.999H17.368C17.751 14.87 18.001 13.69 18.001 12.499C18.001 12.223 17.777 11.999 17.501 11.999C17.225 11.999 17.001 12.223 17.001 12.499C17.001 13.68 16.722 14.866 16.302 15.999H10.001C9.725 15.999 9.501 16.223 9.501 16.499C9.501 16.775 9.725 16.999 10.001 16.999H15.891C14.665 19.691 12.774 21.921 12 22.769C11.343 22.049 9.898 20.36 8.735 18.257C8.602 18.015 8.297 17.93 8.055 18.062C7.814 18.196 7.726 18.5 7.86 18.742C8.855 20.541 10.02 22.02 10.794 22.918C7.245 22.526 4.074 20.443 2.338 17.261C2.207 17.018 1.902 16.928 1.66 17.062C1.418 17.194 1.328 17.498 1.461 17.74C3.567 21.602 7.606 24.001 12.001 24.001C18.618 24.001 24.001 18.618 24.001 12.001C24.001 11.827 23.997 11.653 23.99 11.48C23.977 11.204 23.739 10.981 23.469 11.001V11ZM13.197 22.931C14.213 21.758 15.905 19.576 16.988 16.999H21.785C20.134 20.218 16.95 22.522 13.197 22.931ZM2.229 5.912C2.001 5.756 1.944 5.445 2.1 5.217C4.343 1.95 8.044 0 12 0C13.247 0 14.477 0.19 15.652 0.566C15.915 0.65 16.06 0.931 15.976 1.194C15.891 1.457 15.61 1.605 15.347 1.518C14.648 1.295 13.928 1.151 13.196 1.072C13.537 1.467 13.951 1.972 14.4 2.575C14.565 2.797 14.518 3.11 14.296 3.275C14.077 3.439 13.763 3.395 13.597 3.172C12.947 2.299 12.357 1.621 11.999 1.229C11.299 1.996 9.679 3.888 8.472 6.228C8.344 6.476 8.039 6.569 7.798 6.443C7.553 6.317 7.456 6.015 7.583 5.77C8.633 3.734 9.952 2.053 10.798 1.073C7.633 1.42 4.749 3.121 2.922 5.783C2.765 6.012 2.452 6.067 2.227 5.912H2.229ZM13.5 7C13.776 7 14 7.224 14 7.5C14 7.776 13.776 8 13.5 8H9.5C9.224 8 9 7.776 9 7.5C9 7.224 9.224 7 9.5 7H13.5ZM17.146 10.501C16.974 10.501 16.8 10.462 16.639 10.382C16.246 10.188 16.002 9.796 16.002 9.358L16 4.503C16 3.125 17.121 2.003 18.499 2.003H21.499C21.499 2.003 21.499 2.002 21.501 2.002C22.168 2.002 22.795 2.262 23.268 2.733C23.74 3.206 24 3.834 24 4.502V6.501C24 7.879 22.879 9.001 21.5 9.001H19.486L17.84 10.265C17.635 10.422 17.391 10.501 17.146 10.501ZM21.5 3.001H18.5C17.674 3.003 17.001 3.676 17.001 4.503L17.003 9.358C17.003 9.431 17.046 9.468 17.082 9.485C17.118 9.503 17.175 9.514 17.231 9.47L19.012 8.103C19.1 8.036 19.206 7.999 19.317 7.999H21.501C22.328 7.999 23.001 7.326 23.001 6.499V4.5C23.001 4.099 22.845 3.722 22.562 3.439C22.278 3.155 21.863 3.01 21.5 3.001Z" fill="black"/>
</svg>`;

export default function TeamMemberDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const members = useTeamStore((state) => state.members);
  const deleteMember = useTeamStore((state) => state.deleteMember);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const member = useMemo(
    () => members.find((item) => item.id === params.id) ?? null,
    [members, params.id]
  );

  const handleDelete = () => {
    if (!member) {
      router.replace('/(tabs)/team');
      return;
    }
    setDeleteModalOpen(true);
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
                  {member.name || 'Pending advisor'}
                </Text>
                <Text className="text-[14px] text-black/55 mt-3">{member.role}</Text>
                <Text className="text-[14px] text-black/55 mt-2">{member.email}</Text>
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
          </View>

          <View className="mt-8">
            <Text
              className="text-[12px] text-black mb-4"
              style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
            >
              Languages
            </Text>
            <View className="flex-row items-center">
              <SvgXml xml={LANGUAGES_SVG} width={24} height={24} />
              <Text className="text-[13px] text-black ml-4">
                {member.languages.length ? member.languages.join(', ') : '—'}
              </Text>
            </View>
          </View>

          <View className="flex-row justify-between items-start mt-10">
            <View>
              <Text className="text-[13px] tracking-[2px] text-black/65 mb-2">Availability badge</Text>
              <Text className="text-[14px] text-black/80">{member.availabilityOn ? 'ON' : 'OFF'}</Text>
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

      <FigmaConfirmModal
        visible={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Team Member?"
        description="Are you sure you want to delete this team member? This action can not be undone."
        iconName="trash"
        tone="danger"
        leftButtonText="ACCEPT"
        onLeftPress={() => {
          if (!member) return;
          setDeleteModalOpen(false);
          deleteMember(member.id)
            .then(() => router.replace('/(tabs)/team'))
            .catch((e: any) =>
              Alert.alert('Could not remove member', e?.message ?? 'Please try again.')
            );
        }}
        rightButtonText="CANCEL"
        onRightPress={() => setDeleteModalOpen(false)}
      />
    </SafeAreaView>
  );
}
