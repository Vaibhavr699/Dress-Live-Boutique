import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Platform,
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { api } from '@shared/api/api';
import type { VideoCallBookingDress } from '@shared/bookingForVideoCall';
import { buildTryonSwitchPayload, parseDecartSubscribeTokenMessage } from '@shared/videoCallSignals';
import { isLiveKitNativeSupported } from '@shared/livekitAvailability';
import { useConsultantDecartSubscribe } from '@shared/hooks/useConsultantDecartSubscribe';
import { ARGarmentOverlay } from '../components/ar/ARGarmentOverlay';
import { useReceivedPoseLandmarks } from '../components/ar/useReceivedPoseLandmarks';

type VideoCallStage = 'waiting' | 'analysis' | 'live';

const STAGE_SEQUENCE: VideoCallStage[] = ['waiting', 'analysis', 'live'];

type LiveKitDeps = {
  LiveKitRoom: any;
  useTracks: any;
  VideoTrack: any;
  isTrackReference: any;
  useRoomContext: any;
  useRemoteParticipants: any;
  useLocalParticipant: any;
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
      useLocalParticipant,
    } = livekitMod;
    return {
      LiveKitRoom,
      useTracks,
      VideoTrack,
      isTrackReference,
      useRoomContext,
      useRemoteParticipants,
      useLocalParticipant,
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

  // Remote camera track (customer video)
  const tracks = deps.useTracks([deps.Track.Source.Camera], { onlySubscribed: false });
  const videoTracks = tracks.filter((t: any) => deps.isTrackReference(t));
  const remote = videoTracks.find((t: any) => !t.participant?.isLocal) ?? null;

  // Local camera track — use useLocalParticipant directly to avoid useTracks race
  // condition where the local publication briefly loses its track during renegotiation.
  const { localParticipant } = deps.useLocalParticipant();
  const localCamPub = localParticipant
    ? [...localParticipant.trackPublications.values()].find(
        (p: any) => p.source === deps.Track.Source.Camera && p.track
      ) ?? null
    : null;
  const local = localCamPub && localParticipant
    ? { participant: localParticipant, publication: localCamPub, source: deps.Track.Source.Camera }
    : null;

  const isRoomConnected = room?.state === 'connected';
  const [activeDressId, setActiveDressId] = React.useState<number | null>(bookingDresses[0]?.id ?? null);
  const emptyMainMessage =
    remoteParticipants.length > 0
      ? 'No customer video — they may have the camera off. Ask them to tap the camera icon on their phone.'
      : 'Waiting for customer…';

  // ── Receive the buyer's live pose landmarks ─────────────────────────
  // The buyer's app publishes ~5 Hz of torso keypoints over the LK data
  // channel. We feed the latest sample into <ARGarmentOverlay> so the
  // advisor sees the same dress warp on the buyer's remote video that
  // the buyer sees on themselves. Same affine warp on both sides → same
  // visual, no extra backend hit on the advisor side.
  const receivedLandmarks = useReceivedPoseLandmarks({
    room,
    bookingId,
    activeDressId,
  });

  // ── Receive the bride's Decart subscribe token ──────────────────────
  // When the bride has Decart turned on, her app publishes a
  // DECART_SUBSCRIBE_TOKEN message over the LK data channel. We stash
  // the latest token here and the useConsultantDecartSubscribe hook
  // turns it into a Decart-transformed stream we can render in place
  // of (or alongside) the LK remote video. When Decart is OFF on the
  // bride's side, no token ever arrives → hook stays idle → we fall
  // back to the existing LK-remote + pose-warp overlay path.
  const [decartSubscribeToken, setDecartSubscribeToken] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!room) return;
    const handler = (payload: Uint8Array) => {
      try {
        const raw = new TextDecoder().decode(payload);
        const msg = parseDecartSubscribeTokenMessage(raw);
        if (!msg || msg.bookingId !== bookingId) return;
        setDecartSubscribeToken(msg.token);
      } catch {
        // Other message types (pose landmarks, try-on frames) are
        // handled by their own listeners — silently ignore here.
      }
    };
    room.on('dataReceived', handler as any);
    return () => { room.off('dataReceived', handler as any); };
  }, [room, bookingId]);

  const decartSubscribe = useConsultantDecartSubscribe({ token: decartSubscribeToken });

  // Measured size of the remote video container — drives the AR overlay's
  // affine transform so the warp scales to whatever LiveKit is painting at.
  const [remoteSize, setRemoteSize] = React.useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Active dress image URL, looked up from the selected dress.
  const activeDressImageUrl = React.useMemo<string | null>(() => {
    if (activeDressId == null) return null;
    const d = bookingDresses.find((x) => x.id === activeDressId);
    return d?.image_url ?? null;
  }, [activeDressId, bookingDresses]);

  // Re-send the active dress signal whenever the customer joins so they get
  // the current selection even if they connected after the advisor tapped.
  React.useEffect(() => {
    if (!room?.localParticipant || !activeDressId) return;
    const activeDress = bookingDresses.find((d) => d.id === activeDressId);
    const sendCurrent = () => {
      try {
        const payload = buildTryonSwitchPayload({
          bookingId,
          dressId: activeDressId,
          dressName: activeDress?.name ?? null,
        });
        room.localParticipant.publishData(payload, { reliable: true } as any);
      } catch { /* no-op */ }
    };
    room.on('participantConnected', sendCurrent);
    return () => { room.off('participantConnected', sendCurrent); };
  }, [room, activeDressId, bookingDresses, bookingId]);

  return (
    <View
      style={{ width: '100%', height: frameHeight }}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== remoteSize.w || height !== remoteSize.h) {
          setRemoteSize({ w: width, h: height });
        }
      }}
    >
      {/* Main view priority:
          1. Decart-subscribed stream (bride has Decart turned on AND
             we successfully subscribed) — render straight from
             RTCView, NO pose-warp overlay (dress is baked into the
             stream already).
          2. LK remote camera + pose-warp overlay (legacy path) — for
             when the bride is on the older app version or Decart is
             off on her side.
          3. Empty-state placeholder. */}
      {decartSubscribe.subscribedStream ? (
        (() => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const RTCView = require('@livekit/react-native-webrtc').RTCView as React.ComponentType<any>;
          const url = decartSubscribe.subscribedStream.toURL?.();
          return url ? (
            <RTCView
              streamURL={url}
              style={{ width: '100%', height: frameHeight }}
              objectFit="cover"
              mirror={false}
              zOrder={0}
            />
          ) : (
            <View className="bg-black w-full items-center justify-center px-6" style={{ height: frameHeight }}>
              <Text className="text-white/60 text-[11px] text-center leading-5">
                AI try-on stream warming up…
              </Text>
            </View>
          );
        })()
      ) : remote ? (
        <>
          <deps.VideoTrack trackRef={remote} mirror={false} style={{ width: '100%', height: frameHeight }} zOrder={0} />
          {/* AR garment overlay rendered locally from the buyer's
              published pose landmarks. mirror={false} because the
              advisor sees the buyer's video un-mirrored (it's a remote
              feed) — landmarks come back in unmirrored image space so
              no flip is needed here. */}
          {remoteSize.w > 0 ? (
            <ARGarmentOverlay
              dressImageUrl={activeDressImageUrl}
              landmarks={receivedLandmarks}
              containerWidth={remoteSize.w}
              containerHeight={remoteSize.h || frameHeight}
              mirror={false}
              visible={!!receivedLandmarks}
            />
          ) : null}
        </>
      ) : (
        <View className="bg-black w-full items-center justify-center px-6" style={{ height: frameHeight }}>
          <Text className="text-white/50 text-[11px] text-center leading-5">
            {decartSubscribe.status === 'connecting'
              ? 'Connecting AI try-on stream from customer…'
              : decartSubscribe.status === 'error'
              ? `AI try-on stream error · ${decartSubscribe.errorMessage ?? 'unknown'}`
              : emptyMainMessage}
          </Text>
        </View>
      )}

      {local ? (
        <View
          className="absolute right-4 top-4 border border-white/70 bg-white/90 overflow-hidden"
          style={{ width: 112, height: 152, borderRadius: 18 }}
        >
          <deps.VideoTrack trackRef={local} mirror={true} style={{ width: '100%', height: '100%' }} zOrder={1} />
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
            {isRoomConnected ? (
              <View className="bg-[#EEF8EE] px-2.5 py-1 rounded-full flex-row items-center">
                <View className="w-1.5 h-1.5 rounded-full bg-[#4EA35D] mr-1.5" />
                <Text className="text-[#4EA35D] text-[8px] uppercase tracking-[0.6px]">Ready</Text>
              </View>
            ) : (
              <View className="bg-[#FFF4EC] px-2.5 py-1 rounded-full flex-row items-center">
                <View className="w-1.5 h-1.5 rounded-full bg-[#C9491A] mr-1.5" />
                <Text className="text-[#C9491A] text-[8px] uppercase tracking-[0.6px]">Connecting</Text>
              </View>
            )}
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
                      if (!isRoomConnected || !room?.localParticipant) return;
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

function WaitingPreview({ title }: { title: string }) {
  return (
    <>
      <View className="bg-black h-[320px] w-full" />

      <View className="items-center mt-4">
        <Text className="text-[16px] text-black">{title}</Text>
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
        Waiting For The Call Session To Start
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

  // ── Camera + microphone permissions ────────────────────────────────────
  // Without an explicit prompt + denied UI the LiveKit room silently
  // publishes nothing and the partner just sees a black PiP. Auto-fire
  // the OS dialog on mount; show a clear gate when access is blocked.
  const [cameraPerm, requestCameraPerm] = useCameraPermissions();
  const [micPerm, requestMicPerm] = useMicrophonePermissions();

  const permsKnown = !!cameraPerm && !!micPerm;
  const permsGranted = !!cameraPerm?.granted && !!micPerm?.granted;
  const permsHardDenied =
    (cameraPerm && !cameraPerm.granted && cameraPerm.canAskAgain === false) ||
    (micPerm && !micPerm.granted && micPerm.canAskAgain === false);

  useEffect(() => {
    if (!livekitSupported || Platform.OS === 'web') return;
    if (cameraPerm && !cameraPerm.granted && cameraPerm.canAskAgain) {
      void requestCameraPerm();
    }
    if (micPerm && !micPerm.granted && micPerm.canAskAgain) {
      void requestMicPerm();
    }
  }, [livekitSupported, cameraPerm?.status, micPerm?.status]);

  const handleOpenSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const handleRetryPermissions = useCallback(async () => {
    const c = await requestCameraPerm();
    const m = await requestMicPerm();
    if (!c.granted || !m.granted) {
      Alert.alert(
        'Still blocked',
        'Open Settings → Dress Live Partner → enable Camera and Microphone, then come back and try again.',
      );
    }
  }, [requestCameraPerm, requestMicPerm]);

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
      .catch((error: any) => {
        if (!mounted) return;
        // 403 from the join-window gate carries a friendly "opens at HH:MM…"
        // message. Pop back so the partner isn't stuck on a non-functional
        // call screen when they tap "Join" too early.
        const isTooEarly = error?.status === 403;
        const msg = error?.detail
          || (error instanceof Error ? error.message : 'Could not start video call. Check LiveKit configuration on the server.');
        Alert.alert(
          isTooEarly ? 'Too early to start' : 'Video call',
          typeof msg === 'string' ? msg : 'Could not start video call.',
          [{ text: 'OK', onPress: () => { try { router.back(); } catch { /* no-op */ } } }],
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
            ) : !permsKnown ? (
              <View className="bg-black w-full items-center justify-center rounded-[28px] overflow-hidden border border-black/5" style={{ height: videoFrameHeight }}>
                <ActivityIndicator color="white" />
                <Text className="text-white/60 text-[11px] mt-4">Checking camera & mic…</Text>
              </View>
            ) : permsHardDenied ? (
              <View className="bg-black w-full items-center justify-center px-8 rounded-[28px] overflow-hidden border border-black/5" style={{ height: videoFrameHeight }}>
                <View className="w-16 h-16 rounded-full bg-white/10 items-center justify-center mb-5">
                  <MaterialCommunityIcons name="video-off-outline" size={28} color="white" />
                </View>
                <Text className="text-white text-[14px] font-medium text-center mb-2">
                  Camera & microphone are blocked
                </Text>
                <Text className="text-white/65 text-[12px] text-center leading-5 mb-6">
                  Open Settings → Dress Live Partner → enable Camera and Microphone, then come back to this screen.
                </Text>
                <TouchableOpacity onPress={handleOpenSettings} activeOpacity={0.85} className="bg-white px-6 py-3 rounded-full">
                  <Text className="text-black text-[12px] font-bold uppercase tracking-[1.2px]">Open Settings</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRetryPermissions} className="mt-4">
                  <Text className="text-white/55 text-[10px] underline">I've enabled them — try again</Text>
                </TouchableOpacity>
              </View>
            ) : !permsGranted ? (
              <View className="bg-black w-full items-center justify-center px-8 rounded-[28px] overflow-hidden border border-black/5" style={{ height: videoFrameHeight }}>
                <View className="w-16 h-16 rounded-full bg-white/10 items-center justify-center mb-5">
                  <Ionicons name="videocam-outline" size={30} color="white" />
                </View>
                <Text className="text-white text-[14px] font-medium text-center mb-2">
                  Allow camera & microphone
                </Text>
                <Text className="text-white/65 text-[12px] text-center leading-5 mb-6">
                  You need camera + mic access so the customer can see and hear you on the live fitting call.
                </Text>
                <TouchableOpacity onPress={handleRetryPermissions} activeOpacity={0.85} className="bg-white px-6 py-3 rounded-full">
                  <Text className="text-black text-[12px] font-bold uppercase tracking-[1.2px]">Allow Access</Text>
                </TouchableOpacity>
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
                    {/* elevation forces this wrapper into Android's hardware
                        layer for shadow rendering, which keeps the WebRTC
                        SurfaceView (the local-camera PiP) paintable. Without
                        elevation, overflow-hidden + borderRadius routes
                        children through a software layer and SurfaceView
                        goes black. */}
                    <View
                      className="rounded-[28px] overflow-hidden border border-black/5"
                      style={{
                        elevation: 5,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.15,
                        shadowRadius: 10,
                      }}
                    >
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
            <WaitingPreview title="Waiting For Advisor To Join" />
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
