import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { api } from '@shared/api/api';
import type { VideoCallBookingDress } from '@shared/bookingForVideoCall';
import { buildTryonSwitchPayload } from '@shared/videoCallSignals';
import { isLiveKitNativeSupported } from '@shared/livekitAvailability';

type VideoCallStage = 'waiting' | 'analysis' | 'live';

const STAGE_SEQUENCE: VideoCallStage[] = ['waiting', 'analysis', 'live'];

type LiveKitDeps = {
  LiveKitRoom: any;
  useTracks: any;
  VideoTrack: any;
  isTrackReference: any;
  useRoomContext: any;
  useRemoteParticipants: any;
  Track: any;
  AudioSession: any;
};

function loadLiveKitDeps(): LiveKitDeps | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const livekitMod = require('@livekit/react-native');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const lkClient = require('livekit-client');
    const Track = lkClient?.Track;
    if (
      !livekitMod ||
      typeof livekitMod.LiveKitRoom !== 'function' ||
      typeof livekitMod.useRoomContext !== 'function' ||
      typeof livekitMod.useRemoteParticipants !== 'function' ||
      !Track
    ) {
      return null;
    }
    const {
      LiveKitRoom,
      useTracks,
      VideoTrack,
      isTrackReference,
      useRoomContext,
      useRemoteParticipants,
    } = livekitMod;
    return {
      LiveKitRoom,
      useTracks,
      VideoTrack,
      isTrackReference,
      useRoomContext,
      useRemoteParticipants,
      Track,
      AudioSession: livekitMod?.AudioSession,
    };
  } catch {
    return null;
  }
}

const PartnerRoomView = React.memo(function PartnerRoomView(props: {
  deps: LiveKitDeps;
  bookingDresses: VideoCallBookingDress[];
  bookingId: number;
  frameHeight: number;
}) {
  const { deps, bookingDresses, bookingId, frameHeight } = props;
  const room = deps.useRoomContext();
  const remoteParticipants = deps.useRemoteParticipants();
  const tracks = deps.useTracks([deps.Track.Source.Camera]);
  const videoTracks = tracks.filter((t: any) => deps.isTrackReference(t));
  const remote = videoTracks.find((t: any) => !t.participant?.isLocal) ?? null;
  const local = videoTracks.find((t: any) => !!t.participant?.isLocal) ?? null;
  const [activeDressId, setActiveDressId] = React.useState<number | null>(bookingDresses[0]?.id ?? null);
  const emptyMainMessage =
    remoteParticipants.length > 0
      ? 'No customer video — they may have the camera off. Ask them to tap the camera icon on their phone.'
      : 'Waiting for customer…';

  return (
    <View style={{ width: '100%', height: frameHeight }}>
      {remote ? (
        <deps.VideoTrack trackRef={remote} mirror={false} style={{ width: '100%', height: frameHeight }} />
      ) : (
        <View className="bg-black w-full items-center justify-center px-6" style={{ height: frameHeight }}>
          <Text className="text-white/50 text-[11px] text-center leading-5">{emptyMainMessage}</Text>
        </View>
      )}

      {local ? (
        <View
          className="absolute right-4 top-4 border border-white/70 bg-white/90 overflow-hidden"
          style={{ width: 112, height: 152, borderRadius: 18 }}
        >
          <deps.VideoTrack trackRef={local} mirror={true} style={{ width: '100%', height: '100%' }} />
        </View>
      ) : (
        <View
          className="absolute right-4 top-4 border border-white/70 bg-black/80 overflow-hidden items-center justify-center px-2"
          style={{ width: 112, height: 152, borderRadius: 18 }}
        >
          <Ionicons name="videocam-off-outline" size={20} color="rgba(255,255,255,0.75)" />
          <Text className="text-white/60 text-[9px] text-center mt-2 leading-3">Camera off</Text>
        </View>
      )}

      {/* Advisor: switch outfit (signals customer UI; live AI renderer consumes this next). */}
      <View className="absolute left-3 right-3 bottom-3">
        <View className="bg-white/95 border border-white/70 px-2.5 py-2.5" style={{ borderRadius: 16, maxHeight: 118 }}>
          <View className="flex-row items-center justify-between mb-2">
            <View>
              <Text
                className="text-black uppercase"
                style={{ fontFamily: 'Helvetica Neue', fontWeight: '500', fontSize: 10, lineHeight: 10, letterSpacing: 1.2 }}
              >
                Live AI Try-On
              </Text>
              <Text className="text-black/45 text-[9px] mt-1">Tap a dress to show it on customer</Text>
            </View>
            <View className="bg-[#EEF8EE] px-2.5 py-1 rounded-full flex-row items-center">
              <View className="w-1.5 h-1.5 rounded-full bg-[#4EA35D] mr-1.5" />
              <Text className="text-[#4EA35D] text-[8px] uppercase tracking-[0.6px]">Ready</Text>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {bookingDresses.length === 0 ? (
            <View className="bg-[#F6F6F6] px-3 py-3 self-center" style={{ borderRadius: 12 }}>
              <Text className="text-black/50 text-[10px]">No dresses on this booking</Text>
            </View>
          ) : (
            <View className="flex-row items-center pr-2">
              {bookingDresses.map((d) => {
                const isActive = activeDressId === d.id;
                return (
                  <TouchableOpacity
                    key={d.id}
                    activeOpacity={0.9}
                    onPress={() => {
                      setActiveDressId(d.id);
                      if (!room?.localParticipant) return;
                      try {
                        const payload = buildTryonSwitchPayload({
                          bookingId,
                          dressId: d.id,
                          dressName: d.name,
                        });
                        room.localParticipant.publishData(payload, { reliable: true } as any);
                      } catch {
                        // no-op
                      }
                    }}
                    className={`mr-2 overflow-hidden border ${isActive ? 'border-black' : 'border-[#E5E5E5]'}`}
                    style={{ width: 78, borderRadius: 12, backgroundColor: isActive ? '#FFFFFF' : '#FAFAFA' }}
                  >
                    <View className="bg-[#F2F2F2]" style={{ width: '100%', height: 44 }}>
                      {d.image_url ? (
                        <Image source={{ uri: d.image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="none" />
                      ) : (
                        <View className="flex-1 items-center justify-center">
                          <Ionicons name="shirt-outline" size={18} color="rgba(0,0,0,0.35)" />
                        </View>
                      )}
                    </View>
                    <View className="px-2 py-1.5">
                      <Text className="text-black text-[9px] uppercase tracking-[0.4px]" numberOfLines={1}>
                        {d.name}
                      </Text>
                      <Text className={isActive ? 'text-black text-[8px] mt-1' : 'text-black/35 text-[8px] mt-1'} numberOfLines={1}>
                        {isActive ? 'Showing now' : 'Tap to switch'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
});

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

export default function BoutiqueVideoCallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookingId?: string }>();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const livekitSupported = useMemo(() => Platform.OS !== 'web' && isLiveKitNativeSupported(), []);
  const [stageIndex, setStageIndex] = useState(0);
  const [internalNotes, setInternalNotes] = useState('');
  const [ending, setEnding] = useState(false);
  const [tokenData, setTokenData] = useState<{ url: string; token: string; room: string; identity: string } | null>(
    null
  );
  const [tokenLoading, setTokenLoading] = useState(false);
  const [bookingDresses, setBookingDresses] = useState<VideoCallBookingDress[]>([]);
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [lkConnected, setLkConnected] = useState(false);

  const bookingId = useMemo(() => {
    const raw = params.bookingId;
    if (typeof raw !== 'string') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [params.bookingId]);

  const deps = useMemo(() => {
    if (!livekitSupported) return null;
    return loadLiveKitDeps();
  }, [livekitSupported]);

  const videoFrameHeight = useMemo(() => Math.max(360, Math.min(500, Math.round(screenHeight * 0.52))), [screenHeight]);

  const audioSessionRef = useRef<any>(null);
  useEffect(() => {
    audioSessionRef.current = deps?.AudioSession ?? null;
  }, [deps]);

  useEffect(() => {
    if (!lkConnected) return;
    const AudioSession = audioSessionRef.current;
    if (!AudioSession) return;
    (async () => {
      try {
        await AudioSession.startAudioSession();
        if (Platform.OS === 'ios') {
          await AudioSession.selectAudioOutput(speakerOn ? 'force_speaker' : 'default');
        } else if (Platform.OS === 'android') {
          await AudioSession.selectAudioOutput(speakerOn ? 'speaker' : 'earpiece');
        }
      } catch {
        // ignore
      }
    })();
  }, [lkConnected, speakerOn]);

  const toggleCamera = () => setCameraOn((v) => !v);

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

  useEffect(() => {
    if (stage !== 'live') {
      setLiveSeconds(0);
      return;
    }
    const interval = setInterval(() => setLiveSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [stage]);

  useEffect(() => {
    if (!bookingId) return;
    let mounted = true;
    api
      .get(`/bookings/${bookingId}`)
      .then((data) => {
        if (!mounted) return;
        const dresses = Array.isArray((data as { dresses?: unknown }).dresses)
          ? ((data as { dresses: VideoCallBookingDress[] }).dresses)
          : [];
        setBookingDresses(dresses);
      })
      .catch((error) => {
        if (!mounted) return;
        setBookingDresses([]);
        Alert.alert(
          'Booking',
          error instanceof Error ? error.message : 'Could not load dresses for this booking.'
        );
      });
    return () => {
      mounted = false;
    };
  }, [bookingId]);

  useEffect(() => {
    if (!livekitSupported) return;
    if (!bookingId) return;
    let mounted = true;
    setTokenLoading(true);
    setTokenData(null);
    api
      .get(`/video-calls/token?booking_id=${bookingId}`)
      .then((data) => {
        if (!mounted) return;
        setTokenData(data as any);
      })
      .catch((error) => {
        if (!mounted) return;
        Alert.alert(
          'Video call',
          error instanceof Error ? error.message : 'Could not start video call. Check LiveKit configuration on the server.'
        );
      })
      .finally(() => {
        if (!mounted) return;
        setTokenLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [bookingId]);

  useEffect(() => {
    if (!livekitSupported || bookingId == null) return;
    let cancelled = false;
    (async () => {
      try {
        await api.post('/video-calls/dismiss-ring', { booking_id: bookingId });
        if (cancelled) return;
        await api.post('/video-calls/ring', { booking_id: bookingId });
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const handleEndCall = async () => {
    if (ending) return;
    setEnding(true);
    try {
      if (bookingId) {
        await api.put(`/bookings/${bookingId}`, { status: 'completed' });
      }
    } catch (error) {
      console.warn('Failed to mark booking completed:', error);
    } finally {
      setEnding(false);
      router.replace({
        pathname: '/video-call-summary',
        params: {
          bookingId: bookingId ? String(bookingId) : '',
          notes: internalNotes || '',
          durationSeconds: String(liveSeconds),
        },
      } as any);
    }
  };

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
              <StatusChip
                label={
                  stage === 'live'
                    ? `00:${String(Math.floor(liveSeconds / 60)).padStart(2, '0')}:${String(liveSeconds % 60).padStart(2, '0')}`
                    : 'Good Connection'
                }
                tone={stage === 'live' ? 'timer' : 'green'}
              />
              <TouchableOpacity onPress={() => router.back()} className="ml-3">
                <Feather name="x" size={18} color="#D68067" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View className="flex-1 px-4 pt-4">
          {stage === 'live' ? (
            Platform.OS === 'web' ? (
              <View className="bg-black w-full items-center justify-center px-8 rounded-[28px] overflow-hidden border border-black/5" style={{ height: videoFrameHeight }}>
                <Text className="text-white/70 text-[12px] text-center">
                  Live video calls are not available in web preview. Test on iOS/Android.
                </Text>
              </View>
            ) : !bookingId ? (
              <View className="bg-black w-full items-center justify-center px-8 rounded-[28px] overflow-hidden border border-black/5" style={{ height: videoFrameHeight }}>
                <Text className="text-white/70 text-[12px] text-center">
                  This video call must be started from a booking.
                </Text>
              </View>
            ) : !isLiveKitNativeSupported() ? (
              <View className="bg-black w-full items-center justify-center px-8 rounded-[28px] overflow-hidden border border-black/5" style={{ height: videoFrameHeight }}>
                <Text className="text-white/70 text-[12px] text-center leading-5">
                  Video calls need a development build with WebRTC (Expo Go does not include LiveKit).{'\n\n'}
                  Run: npx expo run:android
                </Text>
              </View>
            ) : tokenLoading ? (
              <View className="bg-black w-full items-center justify-center rounded-[28px] overflow-hidden border border-black/5" style={{ height: videoFrameHeight }}>
                <ActivityIndicator color="white" />
                <Text className="text-white/50 text-[11px] mt-4">Connecting…</Text>
              </View>
            ) : tokenData ? (
              (() => {
                // Use memoized deps so the video tree stays stable.
                if (!deps || bookingId == null) {
                  return (
                    <View className="bg-black w-full items-center justify-center px-8 rounded-[28px] overflow-hidden border border-black/5" style={{ height: videoFrameHeight }}>
                      <Text className="text-white/70 text-[12px] text-center leading-5">
                        LiveKit failed to load. Stop Metro and run: npx expo start --clear, then rebuild the dev client.
                      </Text>
                    </View>
                  );
                }

                return (
                  <deps.LiveKitRoom
                    serverUrl={tokenData.url}
                    token={tokenData.token}
                    connect={true}
                    audio={micOn}
                    video={cameraOn}
                    options={{ adaptiveStream: { pixelDensity: 'screen' } }}
                    onConnected={() => {
                      setLkConnected(true);
                    }}
                  >
                    <View className="rounded-[28px] overflow-hidden border border-black/5">
                      <PartnerRoomView
                        deps={deps}
                        bookingDresses={bookingDresses}
                        bookingId={bookingId}
                        frameHeight={videoFrameHeight}
                      />
                    </View>
                  </deps.LiveKitRoom>
                );
              })()
            ) : (
              <View className="bg-black w-full items-center justify-center rounded-[28px] overflow-hidden border border-black/5" style={{ height: videoFrameHeight }}>
                <Text className="text-white/50 text-[11px]">Not connected</Text>
              </View>
            )
          ) : (
            <WaitingPreview
              title={stage === 'analysis' ? 'Waiting For Advisor To Join' : 'Waiting For Advisor To Join'}
              showPreviewTag={stage === 'analysis'}
            />
          )}
        </View>

        {stage === 'live' ? (
          <View className="px-5 pb-8">
            <View className="flex-row justify-center mt-6 gap-4">
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setMicOn((v) => !v)}
                disabled={!lkConnected}
                className={`w-14 h-14 rounded-full items-center justify-center ${micOn ? 'bg-[#F9F9F9]' : 'bg-[#FF3B30]'}`}
                style={{ opacity: lkConnected ? 1 : 0.4, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 }}
              >
                <Feather name={micOn ? 'mic' : 'mic-off'} size={22} color={micOn ? 'black' : 'white'} />
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setSpeakerOn((v) => !v)}
                disabled={!lkConnected}
                className={`w-14 h-14 rounded-full items-center justify-center ${speakerOn ? 'bg-[#F9F9F9]' : 'bg-[#FF3B30]'}`}
                style={{ opacity: lkConnected ? 1 : 0.4, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 }}
              >
                <Feather name={speakerOn ? 'volume-2' : 'volume-x'} size={22} color={speakerOn ? 'black' : 'white'} />
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={toggleCamera}
                disabled={!lkConnected}
                className={`w-14 h-14 rounded-full items-center justify-center ${cameraOn ? 'bg-[#F9F9F9]' : 'bg-[#FF3B30]'}`}
                style={{ opacity: lkConnected ? 1 : 0.4, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 }}
              >
                <Feather name={cameraOn ? 'video' : 'video-off'} size={22} color={cameraOn ? 'black' : 'white'} />
              </TouchableOpacity>
            </View>

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
                onPress={handleEndCall}
                disabled={ending}
                className={`flex-1 py-4 items-center justify-center ml-1 ${ending ? 'bg-black/40' : 'bg-black'}`}
              >
                <Text className="text-[11px] uppercase tracking-[1px] text-white">
                  {ending ? 'Ending…' : 'End Call'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </Animated.View>
    </SafeAreaView>
  );
}
