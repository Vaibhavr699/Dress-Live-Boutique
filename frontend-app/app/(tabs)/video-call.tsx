import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import ViewShot from 'react-native-view-shot';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@shared/api/api';
import type { VideoCallBookingDress } from '@shared/bookingForVideoCall';
import { parseTryonSwitchMessage } from '@shared/videoCallSignals';
import { isLiveKitNativeSupported } from '@shared/livekitAvailability';
import { ensureLiveKitRegistered } from '@shared/livekitInit';

type CallState = 'waiting' | 'active';
type TokenResponse = { url: string; token: string; room: string; identity: string };

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
    ensureLiveKitRegistered();
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
    const { LiveKitRoom, useTracks, VideoTrack, isTrackReference, useRoomContext, useRemoteParticipants, useLocalParticipant } = livekitMod;
    const AudioSession = livekitMod?.AudioSession;
    return { LiveKitRoom, useTracks, VideoTrack, isTrackReference, useRoomContext, useRemoteParticipants, useLocalParticipant, Track, AudioSession };
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
  tryOnOverlayUri: string | null;
  tryOnLoading: boolean;
  captureActive: boolean;
  onLiveFrame: (dataUrl: string) => void;
}) {
  const { deps, bookingId, frameHeight, onDressSwitch, tryOnOverlayUri, tryOnLoading, captureActive, onLiveFrame } = props;
  const room = deps.useRoomContext();
  const remoteParticipants = deps.useRemoteParticipants();
  const viewShotRef = useRef<ViewShot | null>(null);
  const onLiveFrameRef = useRef(onLiveFrame);
  React.useEffect(() => { onLiveFrameRef.current = onLiveFrame; }, [onLiveFrame]);

  // Remote camera track (advisor video)
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

  // ── Auto-capture loop ──
  // While the buyer's local video is published AND a dress is active, grab a
  // frame from the off-screen ViewShot every ~2s, downscale to 640px, and hand
  // the resulting data URL to the parent (which fires generateTryOn).
  // We depend on the trackSid (stable string) rather than the `local` object
  // (new identity every render) to avoid restarting the timer on every render.
  const localTrackSid: string | null = localCamPub?.trackSid ?? null;
  React.useEffect(() => {
    if (!captureActive || !localTrackSid) return;
    let cancelled = false;

    const captureOnce = async () => {
      try {
        const ref = viewShotRef.current;
        if (!ref || typeof ref.capture !== 'function') return;
        const uri = await ref.capture();
        if (cancelled || !uri) return;
        const resized = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 640 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        if (cancelled || !resized.base64) return;
        onLiveFrameRef.current(`data:image/jpeg;base64,${resized.base64}`);
      } catch {
        // Single capture failure is non-fatal — the next tick will retry.
      }
    };

    // First capture after a short warmup so the video pipeline has frames to grab.
    const initial = setTimeout(captureOnce, 1500);
    const interval = setInterval(captureOnce, 2000);
    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [captureActive, localTrackSid]);

  return (
    <View style={{ width: '100%', height: frameHeight }}>
      {remote ? (
        <deps.VideoTrack trackRef={remote} mirror={false} style={{ width: '100%', height: frameHeight }} zOrder={0} />
      ) : (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-white/60 text-[12px] text-center leading-5">{emptyMainMessage}</Text>
        </View>
      )}

      {/* Live try-on overlay — covers main video with AI dressed result */}
      {tryOnOverlayUri ? (
        <View
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          pointerEvents="none"
        >
          <Image
            source={{ uri: tryOnOverlayUri }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
          />
          <View
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              backgroundColor: 'rgba(0,0,0,0.55)',
              borderRadius: 20,
              paddingHorizontal: 10,
              paddingVertical: 5,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#4EA35D', marginRight: 6 }} />
            <Text style={{ color: 'white', fontSize: 9, letterSpacing: 0.5 }}>AI Try-On</Text>
          </View>
        </View>
      ) : tryOnLoading ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          pointerEvents="none"
        >
          <ActivityIndicator color="white" size="large" />
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 10 }}>
            Applying dress…
          </Text>
        </View>
      ) : null}

      {/* Visible local PiP. ViewShot wraps it so auto-capture grabs real
          frames — off-screen LiveKit views don't get painted on either
          platform, which produced black captures. The PiP itself is the
          capture surface. */}
      {local ? (
        <View
          className="absolute right-4 top-4 border border-white/70 bg-white/90 overflow-hidden"
          style={{ width: 168, height: 224, borderRadius: 18 }}
        >
          <ViewShot
            ref={viewShotRef}
            options={{ format: 'jpg', quality: 0.85, result: 'tmpfile' }}
            style={{ width: '100%', height: '100%' }}
          >
            <deps.VideoTrack
              trackRef={local}
              mirror={true}
              style={{ width: '100%', height: '100%' }}
              zOrder={1}
            />
          </ViewShot>
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
  const [tryOnError, setTryOnError] = useState<string | null>(null);
  const [tryOnDressName, setTryOnDressName] = useState<string | null>(null);
  const [tryOnActiveDressId, setTryOnActiveDressId] = useState<number | null>(null);
  const [photoCapturing, setPhotoCapturing] = useState(false);

  // ── HD freeze-frame state (Phase 4) ─────────────────────────────────────
  const [hdLoading, setHdLoading] = useState(false);
  const [hdResultUri, setHdResultUri] = useState<string | null>(null);
  const [hdError, setHdError] = useState<string | null>(null);
  const [hdModalOpen, setHdModalOpen] = useState(false);

  // ── Phase 5 telemetry & failure tracking ───────────────────────────────
  const consecutiveFailuresRef = useRef(0);
  const [showLightingHint, setShowLightingHint] = useState(false);

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
      const elapsed = seconds;
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
  // quality 'live' (default) → OpenCV path, sub-second response.
  // quality 'hd' → Fashn path, 10–30s, photo-realistic (Phase 4 freeze frame).
  const generateTryOn = useCallback(async (dressId: number, quality: 'live' | 'hd' = 'live') => {
    const photo = tryOnPhotoRef.current;
    const bId = bookingIdRef.current;
    if (!photo || !bId) return;

    const startedAt = Date.now();
    setTryOnLoading(true);
    setTryOnResultUri(null);
    setTryOnError(null);
    try {
      const res = await api.post(
        '/ai/live-tryon-frame',
        {
          booking_id: bId,
          dress_id: dressId,
          frame_data_url: photo,
          quality,
        },
        // HD path can take up to 2 minutes; live path stays at default 30s timeout.
        quality === 'hd' ? { timeoutMs: 120_000 } : undefined,
      ) as { image_data_url?: string | null; quality?: string };
      const elapsedMs = Date.now() - startedAt;
      if (res?.image_data_url) {
        setTryOnResultUri(res.image_data_url);
        consecutiveFailuresRef.current = 0;
        setShowLightingHint(false);
        // Phase 5 telemetry — dev only.
        if (__DEV__) {
          console.log(`[tryon] dress=${dressId} quality=${res?.quality ?? quality} latency=${elapsedMs}ms`);
        }
      } else {
        setTryOnError('No result returned. Please try again.');
        consecutiveFailuresRef.current += 1;
      }
    } catch (err: any) {
      // 429 from server rate limit is expected during fast auto-capture — drop silently.
      if (err?.status === 429) return;
      const msg = err?.detail || err?.message || 'Try-on failed. Please try again.';
      setTryOnError(typeof msg === 'string' ? msg : 'Try-on failed. Please try again.');
      consecutiveFailuresRef.current += 1;
    } finally {
      // Phase 5 — surface a lighting hint after 3 consecutive failures.
      if (consecutiveFailuresRef.current >= 3) {
        setShowLightingHint(true);
      }
      setTryOnLoading(false);
    }
  }, []);

  // ── Phase 4: HD freeze-frame ────────────────────────────────────────────
  // Captures the current live frame and sends it through Fashn for a
  // photo-realistic still. Opens a full-screen modal with the result.
  const captureHdPreview = useCallback(async () => {
    const photo = tryOnPhotoRef.current;
    const bId = bookingIdRef.current;
    const dressId = tryOnActiveDressIdRef.current;
    if (!photo || !bId || !dressId) {
      Alert.alert('Hold on', 'Pick a dress and let the live preview warm up first.');
      return;
    }
    setHdLoading(true);
    setHdError(null);
    setHdResultUri(null);
    setHdModalOpen(true);
    const startedAt = Date.now();
    try {
      const res = await api.post(
        '/ai/live-tryon-frame',
        {
          booking_id: bId,
          dress_id: dressId,
          frame_data_url: photo,
          quality: 'hd',
        },
        { timeoutMs: 120_000 },
      ) as { image_data_url?: string | null; quality?: string };
      const elapsedMs = Date.now() - startedAt;
      if (__DEV__) {
        console.log(`[tryon:hd] dress=${dressId} quality=${res?.quality ?? 'hd'} latency=${elapsedMs}ms`);
      }
      if (res?.image_data_url) {
        setHdResultUri(res.image_data_url);
      } else {
        setHdError('HD preview returned no image. Please try again.');
      }
    } catch (err: any) {
      const msg = err?.detail || err?.message || 'HD preview failed. Please try again.';
      setHdError(typeof msg === 'string' ? msg : 'HD preview failed. Please try again.');
    } finally {
      setHdLoading(false);
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

  // Stable live-frame handler. Auto-capture in BuyerRoomView calls this every
  // ~2s with a fresh data URL of the buyer's current video frame. We update
  // the photo state and, if a dress is active and we are not already
  // rendering, kick off a new try-on. The backend rate-limits to 1 / 3s.
  const tryOnActiveDressIdRef = useRef<number | null>(null);
  const tryOnLoadingRef = useRef(false);
  useEffect(() => { tryOnActiveDressIdRef.current = tryOnActiveDressId; }, [tryOnActiveDressId]);
  useEffect(() => { tryOnLoadingRef.current = tryOnLoading; }, [tryOnLoading]);

  const liveFrameHandlerRef = useRef<(dataUrl: string) => void>(() => {});
  liveFrameHandlerRef.current = (dataUrl: string) => {
    tryOnPhotoRef.current = dataUrl;
    setTryOnPhotoDataUrl(dataUrl);
    const activeId = tryOnActiveDressIdRef.current;
    if (activeId && !tryOnLoadingRef.current) {
      void generateTryOn(activeId);
    }
  };
  const stableOnLiveFrame = useCallback(
    (dataUrl: string) => liveFrameHandlerRef.current(dataUrl),
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
                      tryOnOverlayUri={tryOnResultUri}
                      tryOnLoading={tryOnLoading}
                      captureActive={callState === 'active' && tryOnActiveDressId != null}
                      onLiveFrame={stableOnLiveFrame}
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

            {/* Live AI Try-On — auto-capture from video stream */}
            <View className="bg-[#F9F9F9] p-6 rounded-2xl">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-black text-[12px] font-bold uppercase tracking-[1px] opacity-40">
                  Live AI Try-On
                </Text>
                <View className="flex-row items-center bg-[#EEF8EE] px-2.5 py-1 rounded-full">
                  <View className="w-1.5 h-1.5 rounded-full bg-[#4EA35D] mr-1.5" />
                  <Text className="text-[#4EA35D] text-[8px] uppercase tracking-[0.6px]">Auto</Text>
                </View>
              </View>

              <Text className="text-black/55 text-[12px] leading-5 mb-3">
                Stand in front of the camera once the call starts. We will auto-capture your video and apply each dress the consultant selects — no manual photo needed.
              </Text>

              <TouchableOpacity
                onPress={() => capturePhoto(false)}
                disabled={photoCapturing}
                className="self-start"
              >
                <Text className="text-black/40 text-[9px] uppercase tracking-[1px] underline">
                  {photoCapturing ? 'Picking…' : 'Or pick from gallery'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── ACTIVE STATE: Live AI Try-On result panel ── */}
        {callState === 'active' && (
          <View className="px-8 pb-6">
            <View className="bg-[#F9F9F9] rounded-2xl overflow-hidden">
              {/* Panel header */}
              <View className="px-5 pt-5 pb-4 flex-row items-center justify-between border-b border-black/5">
                <View className="flex-1 mr-3">
                  <Text className="text-black text-[11px] font-bold uppercase tracking-[1.2px]">
                    Live AI Try-On
                  </Text>
                  {tryOnDressName ? (
                    <Text className="text-black/50 text-[10px] mt-0.5" numberOfLines={1}>
                      {tryOnDressName}
                    </Text>
                  ) : null}
                </View>
                <View className="flex-row items-center bg-[#EEF8EE] px-2.5 py-1 rounded-full">
                  <View className="w-1.5 h-1.5 rounded-full bg-[#4EA35D] mr-1.5" />
                  <Text className="text-[#4EA35D] text-[8px] uppercase tracking-[0.6px]">Live</Text>
                </View>
              </View>

              {/* Panel body */}
              <View className="p-5">
                {!tryOnPhotoDataUrl ? (
                  /* Waiting for first auto-capture */
                  <View className="flex-row items-center py-3">
                    <ActivityIndicator color="#1A1A1A" size="small" />
                    <Text className="text-black/55 text-[11px] ml-3">
                      Warming up live capture…
                    </Text>
                  </View>
                ) : tryOnLoading ? (
                  /* Generating — spinner shown on video overlay; panel shows brief status */
                  <View className="flex-row items-center py-3">
                    <ActivityIndicator color="#1A1A1A" size="small" />
                    <Text className="text-black/55 text-[11px] ml-3">
                      {tryOnDressName ? `Applying ${tryOnDressName}…` : 'Generating try-on…'}
                    </Text>
                  </View>
                ) : tryOnError ? (
                  /* Try-on failed — show reason + retry */
                  <View className="items-center py-8">
                    <View className="w-12 h-12 rounded-full bg-[#FFF4EC] items-center justify-center mb-4">
                      <Feather name="alert-circle" size={22} color="#C9491A" />
                    </View>
                    <Text className="text-black/70 text-[12px] text-center font-medium mb-1">
                      Try-on could not generate
                    </Text>
                    <Text className="text-black/45 text-[10px] text-center leading-4 px-4 mb-5">
                      {tryOnError}
                    </Text>
                    {tryOnActiveDressId ? (
                      <TouchableOpacity
                        onPress={() => void generateTryOn(tryOnActiveDressId)}
                        disabled={tryOnLoading}
                        activeOpacity={0.85}
                        className="flex-row items-center gap-2 border border-black/20 px-4 py-2.5 rounded-sm"
                      >
                        <Feather name="refresh-cw" size={12} color="#555" />
                        <Text className="text-black/60 text-[10px] uppercase tracking-[1px]">Retry</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : tryOnResultUri ? (
                  /* Result shown on video overlay — compact status in panel */
                  <View>
                    <View className="flex-row items-center justify-between py-2">
                      <View className="flex-row items-center bg-[#EEF8EE] px-3 py-1.5 rounded-full">
                        <View className="w-1.5 h-1.5 rounded-full bg-[#4EA35D] mr-1.5" />
                        <Text className="text-[#4EA35D] text-[9px] uppercase tracking-[0.6px]">
                          Showing on video
                        </Text>
                      </View>
                      <Text className="text-black/40 text-[9px] uppercase tracking-[0.8px]">
                        Auto-refreshing
                      </Text>
                    </View>
                    {showLightingHint ? (
                      <View className="mt-3 bg-[#FFF8EC] border border-[#F0D4A0] px-3 py-2 flex-row items-start gap-2 rounded-sm">
                        <Feather name="sun" size={12} color="#A87A2A" />
                        <Text className="text-[#A87A2A] text-[10px] leading-4 flex-1">
                          Try-on keeps failing — please move toward better lighting and stand fully in frame.
                        </Text>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      onPress={captureHdPreview}
                      disabled={hdLoading}
                      activeOpacity={0.85}
                      className="mt-3 flex-row items-center gap-2 bg-black py-3 px-4 self-start rounded-sm"
                      style={{ opacity: hdLoading ? 0.5 : 1 }}
                    >
                      <Feather name="zap" size={12} color="white" />
                      <Text className="text-white text-[10px] font-bold uppercase tracking-[1.2px]">
                        {hdLoading ? 'Generating HD…' : 'Capture HD preview'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => capturePhoto(true)}
                      disabled={photoCapturing || tryOnLoading}
                      className="mt-3 self-start flex-row items-center gap-1.5"
                    >
                      <Feather name="camera" size={11} color="#666" />
                      <Text className="text-black/40 text-[9px] uppercase tracking-[0.8px] underline">
                        {photoCapturing ? 'Capturing…' : 'Snap manually'}
                      </Text>
                    </TouchableOpacity>
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

      {/* ── Phase 4: HD freeze-frame modal ── */}
      <Modal
        visible={hdModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setHdModalOpen(false)}
      >
        <Pressable
          onPress={() => setHdModalOpen(false)}
          className="flex-1 bg-black/85 items-center justify-center px-6"
        >
          <Pressable onPress={(e) => e.stopPropagation()} className="w-full max-w-md">
            <View className="bg-white rounded-2xl overflow-hidden">
              <View className="px-5 pt-5 pb-3 flex-row items-center justify-between">
                <View>
                  <Text className="text-black text-[12px] font-bold uppercase tracking-[1.5px]">
                    HD Preview
                  </Text>
                  {tryOnDressName ? (
                    <Text className="text-black/50 text-[10px] mt-1" numberOfLines={1}>
                      {tryOnDressName}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity onPress={() => setHdModalOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={22} color="#000" />
                </TouchableOpacity>
              </View>

              <View style={{ aspectRatio: 3 / 4, backgroundColor: '#F4F4F4' }}>
                {hdResultUri ? (
                  <Image source={{ uri: hdResultUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                ) : hdLoading ? (
                  <View className="flex-1 items-center justify-center px-8">
                    <ActivityIndicator color="#1A1A1A" size="large" />
                    <Text className="text-black/70 text-[12px] mt-5 font-medium text-center">
                      Hold still — generating HD preview
                    </Text>
                    <Text className="text-black/40 text-[10px] mt-2 text-center leading-4">
                      AI rendering can take 10–30 seconds.
                    </Text>
                  </View>
                ) : hdError ? (
                  <View className="flex-1 items-center justify-center px-8">
                    <Feather name="alert-circle" size={28} color="#C9491A" />
                    <Text className="text-black/70 text-[12px] mt-4 text-center font-medium">
                      Could not generate HD preview
                    </Text>
                    <Text className="text-black/45 text-[10px] mt-2 text-center leading-4">
                      {hdError}
                    </Text>
                    <TouchableOpacity
                      onPress={captureHdPreview}
                      className="mt-5 flex-row items-center gap-2 border border-black/20 px-4 py-2.5 rounded-sm"
                    >
                      <Feather name="refresh-cw" size={12} color="#555" />
                      <Text className="text-black/60 text-[10px] uppercase tracking-[1px]">Try again</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              {hdResultUri ? (
                <View className="px-5 py-4 flex-row gap-3">
                  <TouchableOpacity
                    onPress={captureHdPreview}
                    className="flex-1 border border-black/15 py-3 items-center rounded-sm"
                  >
                    <Text className="text-black/70 text-[10px] font-bold uppercase tracking-[1.2px]">
                      Re-render
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setHdModalOpen(false)}
                    className="flex-1 bg-black py-3 items-center rounded-sm"
                  >
                    <Text className="text-white text-[10px] font-bold uppercase tracking-[1.2px]">
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
