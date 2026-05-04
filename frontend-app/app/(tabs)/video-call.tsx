import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@shared/api/api';
import type { VideoCallBookingDress } from '@shared/bookingForVideoCall';
import { parseTryonSwitchMessage } from '@shared/videoCallSignals';
import { isLiveKitNativeSupported } from '@shared/livekitAvailability';

type CallState = 'waiting' | 'active';
type TokenResponse = { url: string; token: string; room: string; identity: string };

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
    const { LiveKitRoom, useTracks, VideoTrack, isTrackReference, useRoomContext, useRemoteParticipants } = livekitMod;
    const AudioSession = livekitMod?.AudioSession;
    return { LiveKitRoom, useTracks, VideoTrack, isTrackReference, useRoomContext, useRemoteParticipants, Track, AudioSession };
  } catch {
    return null;
  }
}

// BuyerRoomView receives a stable onDressSwitch callback so React.memo
// never re-renders this component due to try-on state changes in the parent.
const BuyerRoomView = React.memo(function BuyerRoomView(props: {
  deps: LiveKitDeps;
  bookingId: number;
  frameHeight: number;
  onDressSwitch: (dressId: number, dressName: string | null) => void;
}) {
  const { deps, bookingId, frameHeight, onDressSwitch } = props;
  const room = deps.useRoomContext();
  const remoteParticipants = deps.useRemoteParticipants();
  const tracks = deps.useTracks([deps.Track.Source.Camera]);
  const videoTracks = tracks.filter((t: any) => deps.isTrackReference(t));
  const remote = videoTracks.find((t: any) => !t.participant?.isLocal) ?? null;
  const local = videoTracks.find((t: any) => !!t.participant?.isLocal) ?? null;
  const emptyMainMessage =
    remoteParticipants.length > 0
      ? 'Advisor joined without video. They may need to enable their camera.'
      : 'Waiting for advisor…';

  const [activeDressLabel, setActiveDressLabel] = React.useState<string>('Waiting for consultant selection');

  React.useEffect(() => {
    if (!room) return;
    const handler = (payload: Uint8Array) => {
      try {
        const raw = new TextDecoder().decode(payload);
        const msg = parseTryonSwitchMessage(raw);
        if (!msg || msg.bookingId !== bookingId) return;
        const label = msg.dressName?.trim() ? msg.dressName.trim() : `Dress #${msg.dressId}`;
        setActiveDressLabel(label);
        onDressSwitch(msg.dressId, msg.dressName ?? null);
      } catch {
        // ignore
      }
    };
    room.on('dataReceived', handler as any);
    return () => { room.off('dataReceived', handler as any); };
  }, [room, bookingId, onDressSwitch]);

  return (
    <View style={{ width: '100%', height: frameHeight }}>
      {remote ? (
        <deps.VideoTrack trackRef={remote} mirror={false} style={{ width: '100%', height: frameHeight }} />
      ) : (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-white/60 text-[12px] text-center leading-5">{emptyMainMessage}</Text>
        </View>
      )}

      {local ? (
        <View
          className="absolute right-4 top-4 border border-white/70 bg-white/90 overflow-hidden"
          style={{ width: 112, height: 152, borderRadius: 18 }}
        >
          <deps.VideoTrack trackRef={local} mirror={true} style={{ width: '100%', height: '100%' }} />
        </View>
      ) : null}

      <View
        className="absolute left-4 right-4 bottom-4 bg-white/95 border border-white/70 px-4 py-3"
        style={{ borderRadius: 18 }}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-1 mr-3">
            <Text
              className="text-black uppercase"
              style={{ fontFamily: 'Helvetica Neue', fontWeight: '500', fontSize: 10, lineHeight: 10, letterSpacing: 1.2 }}
            >
              Live AI Try-On
            </Text>
            <Text className="text-black/70 text-[11px] mt-1" numberOfLines={1}>
              {activeDressLabel}
            </Text>
          </View>
          <View className="bg-[#EEF8EE] px-2.5 py-1 rounded-full flex-row items-center">
            <View className="w-1.5 h-1.5 rounded-full bg-[#4EA35D] mr-1.5" />
            <Text className="text-[#4EA35D] text-[8px] uppercase tracking-[0.6px]">Live</Text>
          </View>
        </View>
      </View>
    </View>
  );
});

export default function VideoCallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookingId?: string }>();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const livekitSupported = useMemo(() => Platform.OS !== 'web' && isLiveKitNativeSupported(), []);

  const [callState, setCallState] = useState<CallState>('waiting');
  const [seconds, setSeconds] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [lkConnected, setLkConnected] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [tokenData, setTokenData] = useState<TokenResponse | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [bookingDresses, setBookingDresses] = useState<VideoCallBookingDress[]>([]);
  const [ending, setEnding] = useState(false);

  // ── AI Try-On state ─────────────────────────────────────────────────────
  const [tryOnPhotoDataUrl, setTryOnPhotoDataUrl] = useState<string | null>(null);
  const [tryOnResultUri, setTryOnResultUri] = useState<string | null>(null);
  const [tryOnLoading, setTryOnLoading] = useState(false);
  const [tryOnDressName, setTryOnDressName] = useState<string | null>(null);
  const [tryOnActiveDressId, setTryOnActiveDressId] = useState<number | null>(null);
  const [photoCapturing, setPhotoCapturing] = useState(false);

  // Refs so the stable onDressSwitch callback always reads latest values
  const tryOnPhotoRef = useRef<string | null>(null);
  const bookingIdRef = useRef<number | null>(null);

  const bookingId = useMemo(() => {
    const raw = params.bookingId;
    if (typeof raw !== 'string') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [params.bookingId]);

  useEffect(() => { tryOnPhotoRef.current = tryOnPhotoDataUrl; }, [tryOnPhotoDataUrl]);
  useEffect(() => { bookingIdRef.current = bookingId; }, [bookingId]);

  const deps = useMemo(() => {
    if (!livekitSupported) return null;
    return loadLiveKitDeps();
  }, [livekitSupported]);

  const videoFrameHeight = useMemo(
    () => Math.max(360, Math.min(500, Math.round(screenHeight * 0.52))),
    [screenHeight],
  );

  // ── Audio session ────────────────────────────────────────────────────────
  const audioSessionRef = useRef<any>(null);
  useEffect(() => { audioSessionRef.current = deps?.AudioSession ?? null; }, [deps]);

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
      } catch { /* ignore */ }
    })();
  }, [lkConnected, speakerOn]);

  // ── Token & booking fetch ────────────────────────────────────────────────
  useEffect(() => {
    if (!livekitSupported || !bookingId) return;
    let mounted = true;
    setTokenLoading(true);
    setTokenData(null);
    api.get(`/video-calls/token?booking_id=${bookingId}`)
      .then((data) => { if (mounted) setTokenData(data as TokenResponse); })
      .catch((error) => { if (mounted) Alert.alert('Video call', error instanceof Error ? error.message : 'Could not start video call.'); })
      .finally(() => { if (mounted) setTokenLoading(false); });
    return () => { mounted = false; };
  }, [bookingId]);

  useEffect(() => {
    if (!bookingId) return;
    let mounted = true;
    api.get(`/bookings/${bookingId}`)
      .then((data) => {
        if (!mounted) return;
        const dresses = Array.isArray((data as { dresses?: unknown }).dresses)
          ? (data as { dresses: VideoCallBookingDress[] }).dresses
          : [];
        setBookingDresses(dresses);
      })
      .catch(() => { if (mounted) setBookingDresses([]); });
    return () => { mounted = false; };
  }, [bookingId]);

  useEffect(() => {
    if (!livekitSupported || bookingId == null) return;
    let cancelled = false;
    (async () => {
      try {
        await api.post('/video-calls/dismiss-ring', { booking_id: bookingId });
        if (cancelled) return;
        await api.post('/video-calls/ring', { booking_id: bookingId });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [bookingId]);

  // ── Timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let interval: any;
    if (callState === 'active') {
      interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [callState]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `00:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ── End call ─────────────────────────────────────────────────────────────
  const handleEndCall = async () => {
    if (ending) return;
    setEnding(true);
    try {
      if (bookingId) await api.put(`/bookings/${bookingId}`, { status: 'completed' });
    } catch (error) {
      console.warn('Failed to mark booking completed:', error);
    } finally {
      setEnding(false);
      setCallState('waiting');
      const elapsed = seconds;
      setSeconds(0);
      router.replace({
        pathname: '/video-call-summary',
        params: {
          bookingId: bookingId ? String(bookingId) : '',
          durationSeconds: String(elapsed),
        },
      } as any);
    }
  };

  // ── AI Try-On: generate result for current dress ─────────────────────────
  const generateTryOn = useCallback(async (dressId: number) => {
    const photo = tryOnPhotoRef.current;
    const bId = bookingIdRef.current;
    if (!photo || !bId) return;

    setTryOnLoading(true);
    setTryOnResultUri(null);
    try {
      const res = await api.post('/ai/live-tryon-frame', {
        booking_id: bId,
        dress_id: dressId,
        frame_data_url: photo,
      }) as { image_data_url?: string | null };
      if (res?.image_data_url) setTryOnResultUri(res.image_data_url);
    } catch {
      // silently fail — the dress label badge in the video still updates
    } finally {
      setTryOnLoading(false);
    }
  }, []);

  // Stable dress-switch callback: BuyerRoomView never re-renders because of
  // try-on state changes, but this handler always reads the latest values via refs.
  const dressSwitchHandlerRef = useRef<(dressId: number, dressName: string | null) => void>(() => {});
  dressSwitchHandlerRef.current = (dressId, dressName) => {
    const label = dressName?.trim() || `Dress #${dressId}`;
    setTryOnDressName(label);
    setTryOnActiveDressId(dressId);
    void generateTryOn(dressId);
  };
  const stableOnDressSwitch = useCallback(
    (dressId: number, dressName: string | null) => dressSwitchHandlerRef.current(dressId, dressName),
    [],
  );

  // ── Photo capture ────────────────────────────────────────────────────────
  const capturePhoto = useCallback(async (preferCamera = true) => {
    setPhotoCapturing(true);
    try {
      if (preferCamera) {
        const camPerm = await ImagePicker.requestCameraPermissionsAsync();
        if (camPerm.granted) {
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            quality: 0.85,
            base64: true,
          });
          if (!result.canceled && result.assets?.[0]?.base64) {
            const dataUrl = `data:image/jpeg;base64,${result.assets[0].base64}`;
            setTryOnPhotoDataUrl(dataUrl);
            setTryOnResultUri(null);
            // If a dress is already active, regenerate immediately with new photo
            if (tryOnActiveDressId) {
              tryOnPhotoRef.current = dataUrl;
              void generateTryOn(tryOnActiveDressId);
            }
            return;
          }
          if (result.canceled) return;
        }
      }
      // Fallback: gallery
      const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!libPerm.granted) {
        Alert.alert('Permission needed', 'Allow photo library access to select your try-on photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]?.base64) {
        const dataUrl = `data:image/jpeg;base64,${result.assets[0].base64}`;
        setTryOnPhotoDataUrl(dataUrl);
        setTryOnResultUri(null);
        if (tryOnActiveDressId) {
          tryOnPhotoRef.current = dataUrl;
          void generateTryOn(tryOnActiveDressId);
        }
      }
    } catch {
      Alert.alert('Photo', 'Could not capture photo. Please try again.');
    } finally {
      setPhotoCapturing(false);
    }
  }, [generateTryOn, tryOnActiveDressId]);

  // ── Unsupported platform fallback ────────────────────────────────────────
  if (!livekitSupported) {
    return (
      <View className="flex-1 bg-white px-8 items-center justify-center">
        <MaterialCommunityIcons name="video-off-outline" size={48} color="#1A1A1A" />
        <Text className="text-black text-[16px] font-medium mt-6 mb-2">Video calls need a development build</Text>
        <Text className="text-black/45 text-[12px] text-center leading-5">
          Expo Go does not include the native WebRTC module required for LiveKit video calls.
          Open this app in a development build or EAS build to test video calling.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.9}
          className="mt-8 border border-black px-6 py-3"
        >
          <Text className="text-black text-[11px] font-bold uppercase tracking-[1px]">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      {/* ── Header ── */}
      <View
        className="px-6 py-4 flex-row justify-between items-center bg-white"
        style={{ paddingTop: insets.top + 10 }}
      >
        <View className="flex-1">
          <Text className="text-black text-sm font-medium">
            {callState === 'waiting' ? 'Boutique Portal Team Joining Soon' : 'Live Video Fitting'}
          </Text>
        </View>

        {callState === 'waiting' ? (
          <View className="flex-row items-center bg-[#F2FBF6] px-2 py-1 rounded-full mr-4">
            <View className="w-2 h-2 rounded-full bg-[#34C759] mr-2" />
            <Text className="text-[#34C759] text-[10px] font-medium uppercase">Good Connection</Text>
          </View>
        ) : (
          <View className="flex-row items-center bg-[#F2FBF6] px-2 py-1 rounded-full mr-4">
            <View className="w-2 h-2 rounded-full bg-[#34C759] mr-2" />
            <Text className="text-[#34C759] text-[10px] font-medium">{formatTime(seconds)}</Text>
          </View>
        )}

        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="black" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: callState === 'active' ? 100 : 0 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Video frame ── */}
        <View className="px-6 mb-8 mt-4">
          <View
            className={`w-full rounded-[28px] overflow-hidden relative border border-black/5 ${cameraOn ? 'bg-transparent' : 'bg-black'}`}
            style={{
              height: videoFrameHeight,
              elevation: 5,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 10,
            }}
          >
            {Platform.OS === 'web' ? (
              <View className="flex-1 items-center justify-center px-8">
                <Text className="text-white/60 text-[12px] text-center">
                  Live video calls are not available in web preview. Please test on iOS/Android.
                </Text>
              </View>
            ) : !bookingId ? (
              <View className="flex-1 items-center justify-center px-8">
                <Text className="text-white/70 text-[12px] text-center">
                  This video call must be started from a booking.
                </Text>
              </View>
            ) : !isLiveKitNativeSupported() ? (
              <View className="flex-1 items-center justify-center px-8">
                <Text className="text-white/70 text-[12px] text-center leading-5">
                  Video calls need a development build with WebRTC.{'\n\n'}Run: npx expo run:android
                </Text>
              </View>
            ) : tokenLoading ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator color="white" />
                <Text className="text-white/50 text-[11px] mt-4">Connecting…</Text>
              </View>
            ) : tokenData ? (
              (() => {
                if (!deps || bookingId == null) {
                  return (
                    <View className="flex-1 items-center justify-center px-8">
                      <Text className="text-white/70 text-[12px] text-center leading-5">
                        LiveKit failed to load. Run: npx expo start --clear, then rebuild.
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
                    onConnected={() => { setCallState('active'); setLkConnected(true); }}
                  >
                    <BuyerRoomView
                      deps={deps}
                      bookingId={bookingId}
                      frameHeight={videoFrameHeight}
                      onDressSwitch={stableOnDressSwitch}
                    />
                  </deps.LiveKitRoom>
                );
              })()
            ) : (
              <View className="flex-1 items-center justify-center">
                <MaterialCommunityIcons name="video-off-outline" size={48} color="white" opacity={0.3} />
                <Text className="text-white/30 text-xs mt-4 font-light uppercase tracking-[1px]">
                  Not connected
                </Text>
              </View>
            )}
          </View>

          {/* ── Controls ── */}
          <View className="flex-row justify-center gap-8 mt-10">
            <TouchableOpacity
              onPress={() => setMicOn(!micOn)}
              activeOpacity={0.8}
              className={`w-14 h-14 rounded-full items-center justify-center ${micOn ? 'bg-[#F9F9F9]' : 'bg-[#FF3B30]'}`}
              style={{ elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 }}
            >
              <Feather name={micOn ? 'mic' : 'mic-off'} size={22} color={micOn ? 'black' : 'white'} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setSpeakerOn((v) => !v)}
              activeOpacity={0.8}
              className={`w-14 h-14 rounded-full items-center justify-center ${speakerOn ? 'bg-[#F9F9F9]' : 'bg-[#FF3B30]'}`}
              style={{ elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 }}
            >
              <Feather name={speakerOn ? 'volume-2' : 'volume-x'} size={22} color={speakerOn ? 'black' : 'white'} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setCameraOn((v) => !v)}
              activeOpacity={0.8}
              className={`w-14 h-14 rounded-full items-center justify-center ${cameraOn ? 'bg-[#F9F9F9]' : 'bg-[#FF3B30]'}`}
              style={{ elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 }}
            >
              <Feather name={cameraOn ? 'video' : 'video-off'} size={22} color={cameraOn ? 'black' : 'white'} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Info text ── */}
        <View className="px-8 items-center mb-8">
          <Text className="text-black text-lg font-medium text-center mb-2">
            {callState === 'waiting' ? 'Please Wait' : 'Advisory Support Live'}
          </Text>
          <Text className="text-black/50 text-[13px] text-center px-6 leading-5">
            {callState === 'waiting'
              ? 'The team from Boutique Portal will join soon. Please wait while we notify your boutique owner that you are ready for the call.'
              : 'Your consultant will switch dresses and your AI try-on will update automatically.'}
          </Text>
          {bookingDresses.length > 0 ? (
            <Text className="text-black/35 text-[11px] text-center mt-3 px-6">
              {bookingDresses.length} dress{bookingDresses.length === 1 ? '' : 'es'} shortlisted for this call
            </Text>
          ) : null}
        </View>

        {/* ── WAITING STATE: Preparation tips + photo capture ── */}
        {callState === 'waiting' && (
          <View className="px-8 pb-6 gap-4">
            {/* Preparation tips */}
            <View className="bg-[#F9F9F9] p-6 rounded-2xl">
              <Text className="text-black text-[12px] font-bold uppercase mb-6 tracking-[1px] opacity-40">
                Preparation Tips
              </Text>
              <View className="gap-5">
                {[
                  'Ensure you are in a well-lit room',
                  'Stand 2-3 meters back for full body view',
                  'Wear tight-fitting clothes for accurate AI',
                ].map((tip, i) => (
                  <View key={i} className="flex-row items-center">
                    <View className="bg-[#34C759] rounded-full p-[3px] mr-4">
                      <Ionicons name="checkmark" size={12} color="white" />
                    </View>
                    <Text className="text-black/70 text-[13px] font-light">{tip}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Try-On photo capture */}
            <View className="bg-[#F9F9F9] p-6 rounded-2xl">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-black text-[12px] font-bold uppercase tracking-[1px] opacity-40">
                  Try-On Photo
                </Text>
                {tryOnPhotoDataUrl ? (
                  <View className="flex-row items-center bg-[#EEF8EE] px-2.5 py-1 rounded-full">
                    <View className="w-1.5 h-1.5 rounded-full bg-[#4EA35D] mr-1.5" />
                    <Text className="text-[#4EA35D] text-[8px] uppercase tracking-[0.6px]">Ready</Text>
                  </View>
                ) : (
                  <View className="flex-row items-center bg-[#FFF4EC] px-2.5 py-1 rounded-full">
                    <View className="w-1.5 h-1.5 rounded-full bg-[#C9491A] mr-1.5" />
                    <Text className="text-[#C9491A] text-[8px] uppercase tracking-[0.6px]">Not set</Text>
                  </View>
                )}
              </View>

              {tryOnPhotoDataUrl ? (
                /* Photo captured — show preview */
                <View className="flex-row items-start gap-4">
                  <View className="overflow-hidden rounded-xl border border-black/5" style={{ width: 72, height: 96 }}>
                    <Image source={{ uri: tryOnPhotoDataUrl }} style={{ width: 72, height: 96 }} contentFit="cover" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-black/70 text-[12px] leading-5 mb-3">
                      Your photo is ready. When the consultant switches dresses, your AI preview will generate instantly.
                    </Text>
                    <View className="flex-row gap-3">
                      <TouchableOpacity
                        onPress={() => capturePhoto(true)}
                        disabled={photoCapturing}
                        className="border border-black px-3 py-2"
                      >
                        <Text className="text-black text-[9px] font-bold uppercase tracking-[1px]">
                          Retake
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => capturePhoto(false)}
                        disabled={photoCapturing}
                        className="border border-black/20 px-3 py-2"
                      >
                        <Text className="text-black/50 text-[9px] uppercase tracking-[1px]">
                          Gallery
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ) : (
                /* No photo yet */
                <View>
                  <Text className="text-black/55 text-[12px] leading-5 mb-5">
                    Take a full-body photo now so AI can apply dresses on you the moment your consultant selects them.
                  </Text>
                  <View className="gap-3">
                    <TouchableOpacity
                      onPress={() => capturePhoto(true)}
                      disabled={photoCapturing}
                      activeOpacity={0.9}
                      className="bg-black py-4 items-center rounded-sm"
                      style={{ opacity: photoCapturing ? 0.5 : 1 }}
                    >
                      {photoCapturing ? (
                        <ActivityIndicator color="white" size="small" />
                      ) : (
                        <View className="flex-row items-center gap-2">
                          <Feather name="camera" size={14} color="white" />
                          <Text className="text-white text-[11px] font-bold uppercase tracking-[1.5px]">
                            Take Full-Body Photo
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => capturePhoto(false)}
                      disabled={photoCapturing}
                      activeOpacity={0.9}
                      className="border border-black/20 py-3.5 items-center rounded-sm"
                    >
                      <View className="flex-row items-center gap-2">
                        <Feather name="image" size={13} color="#666" />
                        <Text className="text-black/50 text-[10px] uppercase tracking-[1px]">
                          Choose from Gallery
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── ACTIVE STATE: Live AI Try-On result panel ── */}
        {callState === 'active' && (
          <View className="px-8 pb-6">
            <View className="bg-[#F9F9F9] rounded-2xl overflow-hidden">
              {/* Panel header */}
              <View className="px-5 pt-5 pb-4 flex-row items-center justify-between border-b border-black/5">
                <View>
                  <Text className="text-black text-[11px] font-bold uppercase tracking-[1.2px]">
                    Live AI Try-On
                  </Text>
                  {tryOnDressName ? (
                    <Text className="text-black/50 text-[10px] mt-0.5" numberOfLines={1}>
                      {tryOnDressName}
                    </Text>
                  ) : null}
                </View>
                {tryOnPhotoDataUrl ? (
                  <TouchableOpacity
                    onPress={() => capturePhoto(true)}
                    disabled={photoCapturing || tryOnLoading}
                    className="flex-row items-center gap-1.5 border border-black/15 px-3 py-1.5 rounded-full"
                  >
                    <Feather name="refresh-cw" size={11} color="#555" />
                    <Text className="text-black/55 text-[9px] uppercase tracking-[0.8px]">
                      {photoCapturing ? 'Capturing…' : 'New Photo'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Panel body */}
              <View className="p-5">
                {!tryOnPhotoDataUrl ? (
                  /* No photo — prompt to capture */
                  <View>
                    <Text className="text-black/55 text-[12px] leading-5 mb-4">
                      Capture a full-body photo so AI can apply each dress on you as your consultant switches them.
                    </Text>
                    <TouchableOpacity
                      onPress={() => capturePhoto(true)}
                      disabled={photoCapturing}
                      activeOpacity={0.9}
                      className="bg-black py-4 items-center rounded-sm mb-3"
                      style={{ opacity: photoCapturing ? 0.5 : 1 }}
                    >
                      {photoCapturing ? (
                        <ActivityIndicator color="white" size="small" />
                      ) : (
                        <View className="flex-row items-center gap-2">
                          <Feather name="camera" size={14} color="white" />
                          <Text className="text-white text-[11px] font-bold uppercase tracking-[1.5px]">
                            Capture Photo
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => capturePhoto(false)}
                      disabled={photoCapturing}
                      activeOpacity={0.9}
                      className="border border-black/15 py-3 items-center rounded-sm"
                    >
                      <Text className="text-black/45 text-[10px] uppercase tracking-[1px]">
                        Choose from Gallery
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : tryOnLoading ? (
                  /* Generating */
                  <View className="items-center py-10">
                    <ActivityIndicator color="#1A1A1A" size="large" />
                    <Text className="text-black/60 text-[12px] mt-4 text-center font-medium">
                      {tryOnDressName ? `Trying on ${tryOnDressName}…` : 'Generating your try-on…'}
                    </Text>
                    <Text className="text-black/35 text-[10px] mt-1 text-center">
                      AI is applying the dress to your photo
                    </Text>
                  </View>
                ) : tryOnResultUri ? (
                  /* Result ready */
                  <View>
                    <View className="overflow-hidden rounded-xl border border-black/5">
                      <Image
                        source={{ uri: tryOnResultUri }}
                        style={{ width: '100%', height: 380 }}
                        contentFit="contain"
                      />
                    </View>
                    <View className="flex-row items-center justify-between mt-4">
                      <View className="flex-row items-center bg-[#EEF8EE] px-2.5 py-1 rounded-full">
                        <View className="w-1.5 h-1.5 rounded-full bg-[#4EA35D] mr-1.5" />
                        <Text className="text-[#4EA35D] text-[8px] uppercase tracking-[0.6px]">
                          Preview ready
                        </Text>
                      </View>
                      {tryOnActiveDressId ? (
                        <TouchableOpacity
                          onPress={() => void generateTryOn(tryOnActiveDressId)}
                          disabled={tryOnLoading}
                          className="flex-row items-center gap-1"
                        >
                          <Feather name="refresh-cw" size={11} color="#999" />
                          <Text className="text-black/40 text-[10px] uppercase tracking-[0.8px]">
                            Refresh
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                ) : (
                  /* Photo set but no dress selected yet */
                  <View className="items-center py-10">
                    <View className="w-12 h-12 rounded-full bg-black/5 items-center justify-center mb-4">
                      <MaterialCommunityIcons name="tshirt-crew-outline" size={24} color="#1A1A1A" style={{ opacity: 0.3 }} />
                    </View>
                    <Text className="text-black/40 text-[12px] text-center font-medium mb-1">
                      Waiting for dress selection
                    </Text>
                    <Text className="text-black/30 text-[10px] text-center leading-4">
                      Your try-on will appear here{'\n'}as soon as your consultant picks a dress
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Footer: End call (active only) ── */}
      {callState === 'active' && (
        <View
          className="absolute bottom-0 left-0 right-0 bg-white/95 px-8 pt-4"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleEndCall}
            disabled={ending}
            className={`w-full py-5 rounded-sm items-center justify-center ${ending ? 'bg-black/40' : 'bg-black'}`}
          >
            <Text className="text-white text-[12px] font-bold tracking-[3px] uppercase">
              {ending ? 'Ending…' : 'End Call & Choose Dress'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
