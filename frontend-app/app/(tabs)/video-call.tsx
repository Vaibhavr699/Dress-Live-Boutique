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
  Linking,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import ViewShot from 'react-native-view-shot';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@shared/api/api';
import type { VideoCallBookingDress } from '@shared/bookingForVideoCall';
import {
  buildDecartSubscribeTokenPayload,
  buildPoseLandmarksPayload,
  buildTryonFrameChunks,
  parseTryonSwitchMessage,
} from '@shared/videoCallSignals';
import { isLiveKitNativeSupported } from '@shared/livekitAvailability';
import { ensureLiveKitRegistered } from '@shared/livekitInit';
import { isBuyerDecartEnabled } from '@shared/decartConfig';
import { useBuyerDecartVideo } from '@shared/hooks/useBuyerDecartVideo';
import { ARGarmentOverlay } from '../../components/ar/ARGarmentOverlay';
import { useLivePoseLandmarks } from '../../components/ar/useLivePoseLandmarks';

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

// Imperative handle exposed by BuyerRoomView so the parent can grab a
// fresh ViewShot frame on demand (e.g. when the user taps "Capture HD"
// and we want the exact pose they're holding right now, not whatever
// the auto-capture loop happened to grab up to 2s ago).
type BuyerRoomHandle = {
  captureNow: () => Promise<string | null>;
  publishTryonFrame: (params: { dressId: number; imageDataUrl: string }) => void;
};

// BuyerRoomView receives a stable onDressSwitch callback so React.memo
// never re-renders this component due to try-on state changes in the parent.
const BuyerRoomView = React.memo(React.forwardRef<BuyerRoomHandle, {
  deps: LiveKitDeps;
  bookingId: number;
  frameHeight: number;
  onDressSwitch: (dressId: number, dressName: string | null) => void;
  tryOnOverlayUri: string | null;
  tryOnLoading: boolean;
  captureActive: boolean;
  cameraOn: boolean;
  onLiveFrame: (dataUrl: string) => void;
  /** URL of the currently-selected dress image (parent looks it up
   * from bookingDresses keyed on tryOnActiveDressId). When non-null
   * and a pose is detected, we render the live AR garment overlay
   * on the local PiP between CatVTON snapshots. */
  activeDressImageUrl: string | null;
  /** Numeric ID of the currently-selected dress — included in the
   * pose-landmark payload we publish to the advisor so they know which
   * dress to render their own AR overlay with. */
  activeDressId: number | null;
}>(function BuyerRoomView(props, ref) {
  const { deps, bookingId, frameHeight, onDressSwitch, tryOnOverlayUri, tryOnLoading, captureActive, cameraOn, onLiveFrame, activeDressImageUrl, activeDressId } = props;
  const room = deps.useRoomContext();
  const remoteParticipants = deps.useRemoteParticipants();

  // ── Decart Lucy 2.1 VTON pipeline (feature-flagged) ───────────────────
  // When the bride env opts in, the local camera publishing is owned by
  // this hook rather than by LiveKit's auto-publish. The transformed
  // stream becomes the bride's single LiveKit video track for the entire
  // call; dress switches just call realtime.set() on that same track.
  //
  // Flag-off behavior is the legacy pose-warp + PNG overlay path: this
  // hook returns status='idle' immediately and does no work.
  const decartEnabled = isBuyerDecartEnabled();
  const decart = useBuyerDecartVideo({ enabled: decartEnabled && cameraOn, bookingId });

  // ── Broadcast Decart's subscribe-token over the LiveKit data channel ──
  // Architectural note (see app/decart-spike.tsx for context): we used to
  // try to republish Decart's transformed MediaStreamTrack through
  // LiveKit's separate peer connection. react-native-webrtc rejects that
  // ("transceiver could not be added") because a remote-receiver track
  // can't double as a sender on a different RTCPeerConnection. Instead,
  // we ship Decart's subscribeToken to the consultant over LK data, and
  // the consultant calls Decart's subscribe API to receive the SAME
  // transformed stream straight from Decart's CDN. No republish hop.
  //
  // We re-broadcast on every remote-participant change so an advisor who
  // joins after the bride still gets a usable token without us caching it
  // server-side.
  React.useEffect(() => {
    if (!decartEnabled || !room?.localParticipant) return;
    if (!decart.subscribeToken) return;
    try {
      const payload = buildDecartSubscribeTokenPayload({
        bookingId,
        token: decart.subscribeToken,
      });
      room.localParticipant.publishData(payload, { reliable: true } as any);
    } catch {
      // best-effort — if the advisor never gets the token, the call
      // still works for audio + the bride still sees her own try-on.
    }
  }, [decartEnabled, room, decart.subscribeToken, bookingId, remoteParticipants.length]);

  // Forward dress switches into the Decart session. The data-channel
  // handler below sets `activeDressId` via onDressSwitch → parent state →
  // this prop, so reacting on activeDressId catches both consultant taps
  // and parent-initiated state changes (e.g. if we ever add a bride-side
  // dress picker).
  React.useEffect(() => {
    if (!decartEnabled || decart.status !== 'connected') return;
    if (activeDressId == null) {
      decart.clearDress();
      return;
    }
    decart.switchDress(activeDressId);
  }, [decartEnabled, decart.status, activeDressId, decart.switchDress, decart.clearDress]);
  const viewShotRef = useRef<ViewShot | null>(null);
  const onLiveFrameRef = useRef(onLiveFrame);
  React.useEffect(() => { onLiveFrameRef.current = onLiveFrame; }, [onLiveFrame]);

  // Shared frame-capture helper used by both the auto-loop and the parent's
  // imperative captureNow(). Returns the JPEG data URL or null on failure /
  // black-frame.
  const captureFrame = React.useCallback(async (): Promise<string | null> => {
    const v = viewShotRef.current;
    if (!v || typeof v.capture !== 'function') return null;
    try {
      const uri = await v.capture();
      if (!uri) return null;
      const resized = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 640 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (!resized.base64) return null;
      const sizeKb = (resized.base64.length * 0.75) / 1024;
      if (sizeKb < 8) return null; // black-frame guard
      return `data:image/jpeg;base64,${resized.base64}`;
    } catch {
      return null;
    }
  }, []);

  React.useImperativeHandle(ref, () => ({
    captureNow: () => captureFrame(),
    publishTryonFrame: ({ dressId, imageDataUrl }) => {
      // Best-effort fan-out to other room participants (the advisor) so
      // they see the same overlay on their copy of the buyer's video.
      // Reliable delivery, chunked under the LK 15KB packet ceiling.
      try {
        const lp = room?.localParticipant;
        if (!lp || typeof lp.publishData !== 'function') return;
        const { chunks } = buildTryonFrameChunks({ bookingId, dressId, imageDataUrl });
        for (const chunk of chunks) {
          lp.publishData(chunk, { reliable: true } as any);
        }
      } catch {
        // Drop silently — the buyer still sees their own overlay locally.
      }
    },
  }), [captureFrame, room, bookingId]);

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

  // Measured size of the main video frame — used to size the AR overlay
  // so its affine transform maps normalized [0,1] landmarks into the
  // correct pixel rect regardless of phone width.
  const [mainSize, setMainSize] = React.useState<{ w: number; h: number }>({ w: 0, h: 0 });

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

  // ── Live AR pose-tracking ──
  // Independent of the 2 s CatVTON loop. Polls /ai/live-pose-landmarks at
  // ~5 fps so <ARGarmentOverlay> can warp a flat garment PNG onto the
  // local PiP in between photoreal snapshots. Disabled when the camera
  // is off, no dress is selected, or the local track isn't published.
  const livePose = useLivePoseLandmarks({
    bookingId,
    captureFrame,
    // Skip pose detection entirely when Decart is doing the try-on —
    // the dress is already baked into the video stream by the server,
    // there's nothing left to warp client-side.
    enabled: !decartEnabled && cameraOn && !!activeDressImageUrl && !!localCamPub,
  });

  // ── Fan-out pose landmarks to the advisor ──
  // Every time a fresh pose sample lands, broadcast it over the LK data
  // channel so the advisor's app can render the EXACT same AR overlay on
  // their copy of the buyer's remote video. Unreliable delivery is fine —
  // we sample 5×/sec, dropping one is invisible, late delivery would be
  // worse than miss. The payload is a tiny JSON envelope (≪ 1 KB) so no
  // chunking is required.
  React.useEffect(() => {
    if (decartEnabled) return;                 // consultant doesn't need landmarks when dress is in the video itself
    if (!room?.localParticipant) return;
    if (!livePose.landmarks || activeDressId == null) return;
    try {
      const payload = buildPoseLandmarksPayload({
        bookingId,
        dressId: activeDressId,
        landmarks: livePose.landmarks,
      });
      room.localParticipant.publishData(payload, { reliable: false } as any);
    } catch {
      // best-effort — local AR keeps working even if the advisor never
      // receives a single sample.
    }
  }, [decartEnabled, room, bookingId, activeDressId, livePose.landmarks]);

  // ── Auto-capture loop ──
  // While the buyer's local video is published AND a dress is active, grab a
  // frame from the visible PiP ViewShot every ~2s, downscale to 640px, and
  // hand it to the parent (which fires generateTryOn).
  //
  // If captures come back essentially black (Android SurfaceView limitation
  // on some devices), we detect it via the JPEG payload size — a 640x* JPEG
  // of normal video is 40–150 KB, but the same dimensions of a solid black
  // frame compresses to under 8 KB. After repeated black captures we pause
  // the loop and let the user fall back to the manual "Snap manually" path.
  const localTrackSid: string | null = localCamPub?.trackSid ?? null;
  const blackFrameStreakRef = React.useRef(0);
  const [captureDisabled, setCaptureDisabled] = React.useState(false);

  // Reset failure state whenever the user re-activates capture (e.g. picks a
  // new dress after the loop self-disabled).
  React.useEffect(() => {
    if (captureActive) {
      blackFrameStreakRef.current = 0;
      setCaptureDisabled(false);
    }
  }, [captureActive]);

  React.useEffect(() => {
    if (!captureActive || !localTrackSid || captureDisabled) return;
    let cancelled = false;

    const captureOnce = async () => {
      const dataUrl = await captureFrame();
      if (cancelled) return;
      if (dataUrl == null) {
        blackFrameStreakRef.current += 1;
        if (__DEV__) {
          console.log(`[tryon:capture] black-ish or failed frame, streak=${blackFrameStreakRef.current}`);
        }
        if (blackFrameStreakRef.current >= 3) setCaptureDisabled(true);
        return;
      }
      blackFrameStreakRef.current = 0;
      onLiveFrameRef.current(dataUrl);
    };

    // First capture after a short warmup so the video pipeline has frames to grab.
    const initial = setTimeout(captureOnce, 1500);
    const interval = setInterval(captureOnce, 2000);
    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [captureActive, localTrackSid, captureDisabled, captureFrame]);

  // Republish each fresh landmark sample over the LK data channel so the
  // advisor's app can render the matching AR overlay on its copy of the
  // buyer's remote video. One small JSON envelope (≪15 KB) per sample — no
  // chunking needed. `reliable: false` because losing one sample is fine;
  // the next one is ~200 ms away.
  React.useEffect(() => {
    if (decartEnabled) return;                 // see note above
    if (!room?.localParticipant) return;
    const lm = livePose.landmarks;
    if (!lm || !activeDressImageUrl || activeDressId == null) return;
    try {
      const payload = buildPoseLandmarksPayload({
        bookingId,
        dressId: activeDressId,
        landmarks: lm,
      });
      room.localParticipant.publishData(payload, { reliable: false } as any);
    } catch {
      // best-effort; the buyer's local AR is still fine on its own
    }
  }, [decartEnabled, room, bookingId, livePose.landmarks, activeDressImageUrl, activeDressId]);

  return (
    <View
      style={{ width: '100%', height: frameHeight }}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== mainSize.w || height !== mainSize.h) {
          setMainSize({ w: width, h: height });
        }
      }}
    >
      {/* MAIN view. Two render paths:
          - Decart on: render the transformed MediaStream straight from
            the @livekit/react-native-webrtc RTCView. The bride's video
            never enters LiveKit at all — only audio + data channel do.
          - Decart off: existing path — local LiveKit VideoTrack wrapped
            in ViewShot with the AR PNG overlay composited on top. */}
      {decartEnabled ? (
        decart.transformedStream ? (
          (() => {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const RTCView = require('@livekit/react-native-webrtc').RTCView as React.ComponentType<any>;
            const url = decart.transformedStream.toURL?.();
            return url ? (
              <RTCView
                streamURL={url}
                style={{ width: '100%', height: frameHeight }}
                objectFit="cover"
                mirror={true}
              />
            ) : (
              <View className="flex-1 items-center justify-center px-8">
                <Text className="text-white/60 text-[12px] text-center leading-5">
                  Waiting for AI try-on stream…
                </Text>
              </View>
            );
          })()
        ) : (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-white/60 text-[12px] text-center leading-5">
              {cameraOn ? 'Starting AI try-on…' : 'Camera off'}
            </Text>
          </View>
        )
      ) : local ? (
        <>
          <ViewShot
            ref={viewShotRef}
            options={{ format: 'jpg', quality: 0.85, result: 'tmpfile' }}
            style={{ width: '100%', height: frameHeight }}
          >
            <deps.VideoTrack
              trackRef={local}
              mirror={true}
              style={{ width: '100%', height: frameHeight }}
              zOrder={0}
            />
          </ViewShot>
          {/* AR overlay outside the ViewShot so captures don't double-render. */}
          {mainSize.w > 0 ? (
            <ARGarmentOverlay
              dressImageUrl={activeDressImageUrl}
              landmarks={livePose.landmarks}
              containerWidth={mainSize.w}
              containerHeight={mainSize.h || frameHeight}
              mirror={true}
              visible={cameraOn}
            />
          ) : null}
        </>
      ) : (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-white/60 text-[12px] text-center leading-5">
            {cameraOn ? 'Starting your camera…' : 'Camera off'}
          </Text>
        </View>
      )}

      {/* Advisor in a small corner PiP — buyer still needs to see who they
          are talking to, but the focus is themselves wearing the dress. */}
      {remote ? (
        <View
          className="absolute right-4 top-4 border border-white/70 bg-black/90 overflow-hidden"
          style={{ width: 112, height: 152, borderRadius: 18 }}
        >
          <deps.VideoTrack
            trackRef={remote}
            mirror={false}
            style={{ width: '100%', height: '100%' }}
            zOrder={1}
          />
        </View>
      ) : (
        <View
          className="absolute right-4 top-4 border border-white/70 bg-black/90 overflow-hidden items-center justify-center px-2"
          style={{ width: 112, height: 152, borderRadius: 18 }}
        >
          <Text className="text-white/60 text-[9px] text-center leading-3">{emptyMainMessage}</Text>
        </View>
      )}

      {/* Decart diagnostic banner — visible until both Decart says
          'connected' AND we have a subscribeToken to hand to the advisor.
          Hidden in the legacy code path entirely. */}
      {decartEnabled && (decart.status !== 'connected' || !decart.subscribeToken) ? (
        <View
          className="absolute left-4 right-4 top-4 bg-black/85 border border-white/30 px-3 py-2"
          style={{ borderRadius: 12 }}
        >
          <Text className="text-white text-[10px] tracking-[1.5px] uppercase" numberOfLines={3}>
            {decart.status === 'error'
              ? `AI try-on offline · ${decart.errorMessage ?? 'unknown'}`
              : decart.status !== 'connected'
              ? `AI try-on · ${decart.status}…`
              : `AI try-on · waiting for subscribe token…`}
          </Text>
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
          {!cameraOn ? (
            <View className="bg-[#FFECEC] px-2.5 py-1 rounded-full flex-row items-center">
              <View className="w-1.5 h-1.5 rounded-full bg-[#C9302B] mr-1.5" />
              <Text className="text-[#C9302B] text-[8px] uppercase tracking-[0.6px]">Camera Off</Text>
            </View>
          ) : captureDisabled ? (
            <View className="bg-[#FFF4EC] px-2.5 py-1 rounded-full flex-row items-center">
              <View className="w-1.5 h-1.5 rounded-full bg-[#C9491A] mr-1.5" />
              <Text className="text-[#C9491A] text-[8px] uppercase tracking-[0.6px]">Tap Snap</Text>
            </View>
          ) : (
            <View className="bg-[#EEF8EE] px-2.5 py-1 rounded-full flex-row items-center">
              <View className="w-1.5 h-1.5 rounded-full bg-[#4EA35D] mr-1.5" />
              <Text className="text-[#4EA35D] text-[8px] uppercase tracking-[0.6px]">Live</Text>
            </View>
          )}
        </View>
        {!cameraOn ? (
          <Text className="text-[#C9302B] text-[9px] mt-2 leading-3">
            Your camera is off. Tap the camera button below to turn it on and start the live try-on.
          </Text>
        ) : captureDisabled ? (
          <Text className="text-[#A87A2A] text-[9px] mt-2 leading-3">
            Auto-capture is not working on this device. Tap “Snap manually” below to refresh the try-on.
          </Text>
        ) : null}
      </View>
    </View>
  );
}));

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
  // Imperative handle into BuyerRoomView for fresh captures + publishing
  // overlay frames to the advisor over the LK data channel.
  const buyerRoomHandleRef = useRef<BuyerRoomHandle | null>(null);

  const bookingId = useMemo(() => {
    const raw = params.bookingId;
    if (typeof raw !== 'string') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [params.bookingId]);

  useEffect(() => { tryOnPhotoRef.current = tryOnPhotoDataUrl; }, [tryOnPhotoDataUrl]);
  useEffect(() => { bookingIdRef.current = bookingId; }, [bookingId]);

  // Image URL of the currently-selected dress — fed to the AR overlay
  // inside BuyerRoomView so the live garment warp can render between
  // CatVTON snapshots. We pull from the same bookingDresses list the
  // dress-switch UI consumes, so it stays in sync automatically.
  // TODO: prefer dress.ai_model_url (background-removed) over image_url
  // once the bookings serializer exposes it.
  const activeDressImageUrl = useMemo<string | null>(() => {
    if (tryOnActiveDressId == null) return null;
    const match = bookingDresses.find((d) => d.id === tryOnActiveDressId);
    return match?.image_url ?? null;
  }, [tryOnActiveDressId, bookingDresses]);

  const deps = useMemo(() => {
    if (!livekitSupported) return null;
    return loadLiveKitDeps();
  }, [livekitSupported]);

  const videoFrameHeight = useMemo(
    () => Math.max(360, Math.min(500, Math.round(screenHeight * 0.52))),
    [screenHeight],
  );

  // ── Camera + microphone permissions ────────────────────────────────────
  // Without explicit prompting + an explicit "denied" UI, the LiveKit room
  // silently publishes nothing and the user just sees a black PiP with no
  // hint that camera access is the problem. Field reports confirm this is
  // exactly what was happening — auto-prompt the OS dialog on mount, and
  // when permission is permanently denied (canAskAgain=false) show a clear
  // gate with a button to jump into iOS/Android Settings.
  const [cameraPerm, requestCameraPerm] = useCameraPermissions();
  const [micPerm, requestMicPerm] = useMicrophonePermissions();

  const permsKnown = !!cameraPerm && !!micPerm;
  const permsGranted = !!cameraPerm?.granted && !!micPerm?.granted;
  const permsHardDenied =
    (cameraPerm && !cameraPerm.granted && cameraPerm.canAskAgain === false) ||
    (micPerm && !micPerm.granted && micPerm.canAskAgain === false);

  // Auto-fire the OS prompt the first time we land on the screen so the
  // user actually sees a dialog instead of guessing.
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
        'Tap “Open Settings” and enable Camera + Microphone for Dress Live, then come back and try again.',
      );
    }
  }, [requestCameraPerm, requestMicPerm]);

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
      .catch((error: any) => {
        if (!mounted) return;
        // 403 from the server's 5-min join-window gate carries a friendly
        // "Video call opens at HH:MM…" detail string. Surface it AND pop the
        // user back so they aren't stuck on a non-functional call screen.
        const isTooEarly = error?.status === 403;
        const msg = error?.detail || (error instanceof Error ? error.message : 'Could not start video call.');
        Alert.alert(
          isTooEarly ? 'Too early to join' : 'Video call',
          typeof msg === 'string' ? msg : 'Could not start video call.',
          [{ text: 'OK', onPress: () => { try { router.back(); } catch { /* no-op */ } } }],
        );
      })
      .finally(() => { if (mounted) setTokenLoading(false); });
    return () => { mounted = false; };
  }, [bookingId, livekitSupported, router]);

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
  //
  // `frameOverride` lets the caller supply a freshly captured frame (used
  // by the HD lock-pose flow) instead of whatever the auto-loop last stored.
  const generateTryOn = useCallback(async (
    dressId: number,
    quality: 'live' | 'hd' = 'live',
    frameOverride?: string,
  ) => {
    const photo = frameOverride ?? tryOnPhotoRef.current;
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
        // Fan the live overlay out to the advisor over the LK data channel
        // so they see exactly what the buyer sees. HD freeze frames stay
        // local to the buyer's modal — those are explicit captures, not
        // continuous video.
        if (quality === 'live') {
          try {
            buyerRoomHandleRef.current?.publishTryonFrame({ dressId, imageDataUrl: res.image_data_url });
          } catch { /* non-fatal */ }
        }
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
  // Lock-pose: when the user taps "Capture HD" we ALWAYS snap a fresh frame
  // from the visible PiP (rather than reusing the last auto-captured one,
  // which can be up to 2s old). This way the HD render reflects the exact
  // pose they're holding when they tap, not whatever the loop happened to
  // grab. Falls back to the cached frame if the imperative capture fails.
  const captureHdPreview = useCallback(async () => {
    const bId = bookingIdRef.current;
    const dressId = tryOnActiveDressIdRef.current;
    if (!bId || !dressId) {
      Alert.alert('Hold on', 'Pick a dress and let the live preview warm up first.');
      return;
    }

    setHdLoading(true);
    setHdError(null);
    setHdResultUri(null);
    setHdModalOpen(true);

    let lockedFrame: string | null = null;
    try {
      lockedFrame = (await buyerRoomHandleRef.current?.captureNow()) ?? null;
    } catch {
      lockedFrame = null;
    }
    const photo = lockedFrame ?? tryOnPhotoRef.current;
    if (!photo) {
      setHdError('Could not capture a frame. Please make sure the camera is on and try again.');
      setHdLoading(false);
      return;
    }
    // Keep the cached frame in sync with what we just sent — useful if the
    // user re-renders or switches dress while the modal is open.
    if (lockedFrame) tryOnPhotoRef.current = lockedFrame;

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
        console.log(`[tryon:hd] dress=${dressId} quality=${res?.quality ?? 'hd'} latency=${elapsedMs}ms locked=${!!lockedFrame}`);
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
            ) : !permsKnown ? (
              <View className="flex-1 items-center justify-center px-8 bg-black">
                <ActivityIndicator color="white" />
                <Text className="text-white/60 text-[11px] mt-4">Checking camera & mic…</Text>
              </View>
            ) : permsHardDenied ? (
              <View className="flex-1 items-center justify-center px-8 bg-black">
                <View className="w-16 h-16 rounded-full bg-white/10 items-center justify-center mb-5">
                  <MaterialCommunityIcons name="video-off-outline" size={28} color="white" />
                </View>
                <Text className="text-white text-[14px] font-medium text-center mb-2">
                  Camera & microphone are blocked
                </Text>
                <Text className="text-white/65 text-[12px] text-center leading-5 mb-6">
                  Open Settings → Dress Live → enable Camera and Microphone, then come back to this screen.
                </Text>
                <TouchableOpacity
                  onPress={handleOpenSettings}
                  activeOpacity={0.85}
                  className="bg-white px-6 py-3 rounded-full"
                >
                  <Text className="text-black text-[12px] font-bold uppercase tracking-[1.2px]">
                    Open Settings
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRetryPermissions} className="mt-4">
                  <Text className="text-white/55 text-[10px] underline">I've enabled them — try again</Text>
                </TouchableOpacity>
              </View>
            ) : !permsGranted ? (
              <View className="flex-1 items-center justify-center px-8 bg-black">
                <View className="w-16 h-16 rounded-full bg-white/10 items-center justify-center mb-5">
                  <Ionicons name="videocam-outline" size={30} color="white" />
                </View>
                <Text className="text-white text-[14px] font-medium text-center mb-2">
                  Allow camera & microphone
                </Text>
                <Text className="text-white/65 text-[12px] text-center leading-5 mb-6">
                  Dress Live needs your camera so the stylist can see you, and your mic so you can talk during the call.
                </Text>
                <TouchableOpacity
                  onPress={handleRetryPermissions}
                  activeOpacity={0.85}
                  className="bg-white px-6 py-3 rounded-full"
                >
                  <Text className="text-black text-[12px] font-bold uppercase tracking-[1.2px]">
                    Allow Access
                  </Text>
                </TouchableOpacity>
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
                // When the bride's Decart pipeline is enabled, BuyerRoomView
                // publishes the transformed track manually. Tell LiveKit not
                // to auto-publish the raw camera, otherwise we'd briefly
                // ship the un-transformed feed before Decart's onRemoteStream
                // lands, and the consultant would see it.
                const decartOwnsVideo = isBuyerDecartEnabled();
                return (
                  <deps.LiveKitRoom
                    serverUrl={tokenData.url}
                    token={tokenData.token}
                    connect={true}
                    audio={micOn}
                    video={cameraOn && !decartOwnsVideo}
                    options={{ adaptiveStream: { pixelDensity: 'screen' } }}
                    onConnected={() => { setCallState('active'); setLkConnected(true); }}
                  >
                    <BuyerRoomView
                      ref={buyerRoomHandleRef}
                      deps={deps}
                      bookingId={bookingId}
                      frameHeight={videoFrameHeight}
                      onDressSwitch={stableOnDressSwitch}
                      tryOnOverlayUri={tryOnResultUri}
                      tryOnLoading={tryOnLoading}
                      // Auto-CatVTON loop is OFF in real-time AR mode — no
                      // tile renders its output anymore, so the bandwidth
                      // and GPU minutes were pure waste. Manual HD captures
                      // still work through buyerRoomHandleRef.captureNow().
                      captureActive={false}
                      cameraOn={cameraOn}
                      onLiveFrame={stableOnLiveFrame}
                      activeDressImageUrl={activeDressImageUrl}
                      activeDressId={tryOnActiveDressId}
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
                {!cameraOn ? (
                  /* Camera turned off — explain why nothing is happening */
                  <View className="flex-row items-center py-3">
                    <Feather name="video-off" size={14} color="#C9302B" />
                    <Text className="text-[#C9302B] text-[11px] ml-3 flex-1">
                      Camera is off. Turn it on to start the live try-on.
                    </Text>
                  </View>
                ) : !tryOnPhotoDataUrl ? (
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
