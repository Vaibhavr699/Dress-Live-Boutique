import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Feather, Ionicons, MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

type VideoCallStage = 'waiting' | 'analysis' | 'live';

const STAGE_SEQUENCE: VideoCallStage[] = ['waiting', 'analysis', 'live'];

function StatusChip({ label, tone = 'green' }: { label: string; tone?: 'green' | 'timer' }) {
  const toneClasses =
    tone === 'timer'
      ? 'bg-[#EEF8EE] text-[#4EA35D]'
      : 'bg-[#EEF8EE] text-[#4EA35D]';

  return (
    <View className="rounded-full px-3 py-1.5 flex-row items-center">
      <View className={`w-1.5 h-1.5 rounded-full mr-2 ${tone === 'timer' ? 'bg-[#4EA35D]' : 'bg-[#7ACB7C]'}`} />
      <Text className={`text-[9px] ${toneClasses}`}>{label}</Text>
    </View>
  );
}

function WaitingPreview({
  title,
  showPreviewTag,
}: {
  title: string;
  showPreviewTag?: boolean;
}) {
  return (
    <>
      <View className="bg-black h-[320px] w-full" />

      <View className="items-center mt-4">
        <View className="flex-row items-center">
          <TouchableOpacity className="w-10 h-10 items-center justify-center">
            <Ionicons name="mic-off-outline" size={18} color="#111111" />
          </TouchableOpacity>
          <TouchableOpacity className="w-10 h-10 items-center justify-center ml-2">
            <Ionicons name="videocam-outline" size={18} color="#111111" />
          </TouchableOpacity>
        </View>

        <Text className="text-[16px] text-black mt-5">{title}</Text>
        <Text className="text-[10px] text-black/35 text-center mt-2 leading-4 px-8">
          Your session will begin automatically as soon as the boutique advisor joins.
        </Text>
      </View>

      <View className="mt-8 px-1">
        <Text className="text-[14px] text-black mb-4">Preparation Tips</Text>
        <View className="mb-3 flex-row items-start">
          <View className="w-1.5 h-1.5 rounded-full bg-[#8A8A8A] mt-1.5 mr-2.5" />
          <Text className="text-[10px] text-black/55 flex-1">Ensure you are in a well-lit room</Text>
        </View>
        <View className="mb-3 flex-row items-start">
          <View className="w-1.5 h-1.5 rounded-full bg-[#8A8A8A] mt-1.5 mr-2.5" />
          <Text className="text-[10px] text-black/55 flex-1">Stand 2-3 meters back for full body view</Text>
        </View>
        <View className="mb-3 flex-row items-start">
          <View className="w-1.5 h-1.5 rounded-full bg-[#8A8A8A] mt-1.5 mr-2.5" />
          <Text className="text-[10px] text-black/55 flex-1">Wear form-fitting clothes for accurate AI measurements</Text>
        </View>
      </View>

      <Text className="text-[10px] text-black/25 text-center mt-10">
        {showPreviewTag ? 'Waiting For The Call Session To Start' : 'Waiting For The Call Session To Start'}
      </Text>
    </>
  );
}

function LivePreview() {
  return (
    <>
      <View className="relative">
        <Image
          source={require('../assets/images/Dashboard image 3.png')}
          style={{ width: '100%', height: 320 }}
          contentFit="cover"
        />

        <View className="absolute right-4 top-4 border border-white/70 bg-white/90">
          <Image
            source={require('../assets/images/Dashboard image 2.png')}
            style={{ width: 68, height: 92 }}
            contentFit="cover"
          />
        </View>
      </View>

      <View className="items-center mt-4">
        <View className="flex-row items-center">
          <TouchableOpacity className="w-10 h-10 items-center justify-center">
            <Ionicons name="mic-outline" size={18} color="#111111" />
          </TouchableOpacity>
          <TouchableOpacity className="w-10 h-10 items-center justify-center ml-2">
            <Ionicons name="videocam" size={18} color="#111111" />
          </TouchableOpacity>
        </View>
      </View>

      <Text className="text-[10px] text-black/35 text-center mt-8 leading-4 px-10">
        Advisor can control Try-On and switch dresses for you.
      </Text>
    </>
  );
}

export default function BoutiqueVideoCallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [stageIndex, setStageIndex] = useState(0);
  const [internalNotes, setInternalNotes] = useState('');

  useEffect(() => {
    if (stageIndex >= STAGE_SEQUENCE.length - 1) {
      return;
    }

    const timeout = setTimeout(() => {
      setStageIndex((current) => Math.min(current + 1, STAGE_SEQUENCE.length - 1));
    }, 2200);

    return () => clearTimeout(timeout);
  }, [stageIndex]);

  const stage = useMemo(() => STAGE_SEQUENCE[stageIndex], [stageIndex]);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Animated.View
        key={stage}
        entering={FadeIn.duration(220)}
        exiting={FadeOut.duration(180)}
        className="flex-1"
        style={{ paddingTop: insets.top + 6 }}
      >
        <View className="px-4 pb-4 border-b border-[#EFEFEF]">
          <View className="flex-row items-center justify-between">
            <Text className="text-[12px] text-black">
              {stage === 'live' ? 'Live Video Fitting' : 'Waiting for Advisor To Join'}
            </Text>

            <View className="flex-row items-center">
              <StatusChip label={stage === 'live' ? '00:02:34' : 'Good Connection'} tone={stage === 'live' ? 'timer' : 'green'} />
              <TouchableOpacity onPress={() => router.back()} className="ml-3">
                <Feather name="x" size={18} color="#D68067" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View className="flex-1 px-4 pt-4">
          {stage === 'live' ? (
            <LivePreview />
          ) : (
            <WaitingPreview
              title={stage === 'analysis' ? 'Waiting For Advisor To Join' : 'Waiting For Advisor To Join'}
              showPreviewTag={stage === 'analysis'}
            />
          )}
        </View>

        {stage === 'live' ? (
          <View className="px-5 pb-8">
            <View className="border-t border-[#EFEFEF] pt-6 mt-4">
              <Text
                className="text-[12px] text-black mb-1"
                style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
              >
                Internal Notes
              </Text>
              <Text className="text-[10px] text-black/45 leading-4 mb-4">
                Only visible to advisors during calls.
              </Text>

              <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">
                Fit & Alteration Notes *
              </Text>
              <TextInput
                value={internalNotes}
                onChangeText={setInternalNotes}
                placeholder="e.g., Romantic wedding lace mermaid dress with low back and lack details."
                placeholderTextColor="#B9B9B9"
                className="border-b border-[#ECECEC] pb-2 text-[12px] text-black"
              />
            </View>

            <View className="flex-row mt-10">
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.back()}
                className="flex-1 border border-[#1A1A1A] py-4 items-center justify-center mr-1"
              >
                <Text className="text-[11px] uppercase tracking-[1px] text-black">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => router.back()}
                className="flex-1 bg-black py-4 items-center justify-center ml-1"
              >
                <Text className="text-[11px] uppercase tracking-[1px] text-white">
                  Save & Continue
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </Animated.View>
    </SafeAreaView>
  );
}
