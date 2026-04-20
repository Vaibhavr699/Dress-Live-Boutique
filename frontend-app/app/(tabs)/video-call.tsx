import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, Platform, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@shared/api/api';
import type { VideoCallBookingDress } from '@shared/bookingForVideoCall';
import { parseTryonSwitchMessage } from '@shared/videoCallSignals';
import { isLiveKitNativeSupported } from '@shared/livekitAvailability';

type CallState = 'waiting' | 'active';
type TokenResponse = { url: string; token: string; room: string; identity: string };

export default function VideoCallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookingId?: string }>();
  const insets = useSafeAreaInsets();
  const [callState, setCallState] = useState<CallState>('waiting');
  const [seconds, setSeconds] = useState(0);
  const [micOn, setMicOn] = useState(true);
  // Fitting sessions need the advisor to see the customer; default camera on (user can turn off).
  const [cameraOn, setCameraOn] = useState(true);
  const [tokenData, setTokenData] = useState<TokenResponse | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [bookingDresses, setBookingDresses] = useState<VideoCallBookingDress[]>([]);
  const [ending, setEnding] = useState(false);

  const bookingId = useMemo(() => {
    const raw = params.bookingId;
    if (typeof raw !== 'string') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [params.bookingId]);

  const toggleCamera = async () => {
    setCameraOn((v) => !v);
  };

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!bookingId) return;
    let mounted = true;
    setTokenLoading(true);
    setTokenData(null);
    api
      .get(`/video-calls/token?booking_id=${bookingId}`)
      .then((data) => {
        if (!mounted) return;
        setTokenData(data as TokenResponse);
      })
      .catch((error) => {
        if (!mounted) return;
        Alert.alert('Video call', error instanceof Error ? error.message : 'Could not start video call.');
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
      .catch(() => {
        if (!mounted) return;
        setBookingDresses([]);
      });
    return () => {
      mounted = false;
    };
  }, [bookingId]);

  useEffect(() => {
    if (Platform.OS === 'web' || bookingId == null) return;
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

  // Timer logic
  useEffect(() => {
    let interval: any;
    if (callState === 'active') {
      interval = setInterval(() => {
        setSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callState]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `00:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEndCall = async () => {
    if (ending) return;
    setEnding(true);
    try {
      if (bookingId) {
        await api.put(`/bookings/${bookingId}`, { status: 'completed' });
      }
    } catch (error) {
      // Keep UX smooth; failing to set completed shouldn't trap the user.
      console.warn('Failed to mark booking completed:', error);
    } finally {
      setEnding(false);
      setCallState('waiting');
      setSeconds(0);
      router.replace({ pathname: '/video-call-summary', params: { bookingId: bookingId ? String(bookingId) : '' } } as any);
    }
  };

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View 
        className="px-6 py-4 flex-row justify-between items-center bg-white"
        style={{ paddingTop: insets.top + 10 }}
      >
        <View className="flex-1">
          <Text className="text-black text-sm font-medium">
            {callState === 'waiting' ? 'Waiting For Advisor To Join' : 'Live Video Fitting'}
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

      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Video Area */}
        <View className="px-6 mb-8 mt-4">
          <View 
            className={`w-full aspect-[3/4] rounded-3xl overflow-hidden relative ${cameraOn ? 'bg-transparent' : 'bg-black'}`}
            style={{ 
              elevation: 5, 
              shadowColor: '#000', 
              shadowOffset: { width: 0, height: 4 }, 
              shadowOpacity: 0.15, 
              shadowRadius: 10 
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
                  Video calls need a development build with WebRTC (Expo Go does not include LiveKit).{'\n\n'}
                  Run: npx expo run:android
                </Text>
              </View>
            ) : tokenLoading ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator color="white" />
                <Text className="text-white/50 text-[11px] mt-4">Connecting…</Text>
              </View>
            ) : tokenData ? (
              (() => {
                // Dynamic require so web bundling doesn't crash.
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const livekitMod = require('@livekit/react-native');
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const lkClient = require('livekit-client');
                const Track = lkClient?.Track;
                if (
                  !livekitMod ||
                  typeof livekitMod.LiveKitRoom !== 'function' ||
                  typeof livekitMod.useRoomContext !== 'function' ||
                  !Track
                ) {
                  return (
                    <View className="flex-1 items-center justify-center px-8">
                      <Text className="text-white/70 text-[12px] text-center leading-5">
                        LiveKit failed to load. Stop Metro and run: npx expo start --clear, then rebuild the dev client.
                      </Text>
                    </View>
                  );
                }
                const { LiveKitRoom, useTracks, VideoTrack, isTrackReference, useRoomContext } = livekitMod;

                const RoomView = () => {
                  const room = useRoomContext();
                  const tracks = useTracks([Track.Source.Camera]);
                  const videoTracks = tracks.filter((t: any) => isTrackReference(t));
                  const remote = videoTracks.find((t: any) => !t.participant?.isLocal) ?? null;
                  const local = videoTracks.find((t: any) => !!t.participant?.isLocal) ?? null;

                  const [activeDressLabel, setActiveDressLabel] = React.useState<string>('Advisor can switch dresses');

                  React.useEffect(() => {
                    if (!room || bookingId == null) return;
                    const handler = (payload: Uint8Array) => {
                      try {
                        const raw = new TextDecoder().decode(payload);
                        const msg = parseTryonSwitchMessage(raw);
                        if (!msg || msg.bookingId !== bookingId) return;
                        setActiveDressLabel(
                          msg.dressName?.trim()
                            ? `Active dress: ${msg.dressName.trim()}`
                            : `Active dress #${msg.dressId}`
                        );
                      } catch {
                        // ignore
                      }
                    };
                    room.on('dataReceived', handler as any);
                    return () => {
                      room.off('dataReceived', handler as any);
                    };
                  }, [room, bookingId]);

                  return (
                    <View style={{ width: '100%', height: '100%' }}>
                      {remote ? (
                        <VideoTrack trackRef={remote} style={{ width: '100%', height: '100%' }} />
                      ) : (
                        <View className="flex-1 items-center justify-center">
                          <Text className="text-white/50 text-[11px]">Waiting for advisor…</Text>
                        </View>
                      )}

                      {local ? (
                        <View
                          className="absolute right-4 top-4 border border-white/70 bg-white/90 overflow-hidden"
                          style={{ width: 110, height: 150, borderRadius: 16 }}
                        >
                          <VideoTrack trackRef={local} style={{ width: '100%', height: '100%' }} />
                        </View>
                      ) : null}

                      <View className="absolute left-4 bottom-4 bg-black/60 px-3 py-2 rounded-full">
                        <Text className="text-white text-[10px]">{activeDressLabel}</Text>
                      </View>
                    </View>
                  );
                };

                return (
                  <LiveKitRoom
                    serverUrl={tokenData.url}
                    token={tokenData.token}
                    connect={true}
                    audio={micOn}
                    video={cameraOn}
                    options={{ adaptiveStream: { pixelDensity: 'screen' } }}
                    onConnected={() => setCallState('active')}
                  >
                    <RoomView />
                  </LiveKitRoom>
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

            {/* Inset handled by LiveKit tracks when connected */}
          </View>

          {/* Controls */}
          <View className="flex-row justify-center gap-8 mt-10">
            <TouchableOpacity 
              onPress={() => setMicOn(!micOn)}
              activeOpacity={0.8}
              className={`w-14 h-14 rounded-full items-center justify-center ${micOn ? 'bg-[#F9F9F9]' : 'bg-[#FF3B30]'}`}
              style={{ elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 }}
            >
              <Feather name={micOn ? "mic" : "mic-off"} size={22} color={micOn ? "black" : "white"} />
            </TouchableOpacity>
            
            <TouchableOpacity 
               onPress={toggleCamera}
               activeOpacity={0.8}
               className={`w-14 h-14 rounded-full items-center justify-center ${cameraOn ? 'bg-[#F9F9F9]' : 'bg-[#FF3B30]'}`}
               style={{ elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 }}
            >
              <Feather name={cameraOn ? "video" : "video-off"} size={22} color={cameraOn ? "black" : "white"} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Info Text */}
        <View className="px-8 items-center mb-10">
          <Text className="text-black text-lg font-medium text-center mb-2">
            {callState === 'waiting' ? 'Waiting For Advisor To Join' : 'Advisory Support Live'}
          </Text>
          <Text className="text-black/50 text-[13px] text-center px-6 leading-5">
            {callState === 'waiting' 
              ? 'Your session will begin automatically as soon as boutique advisor joins.'
              : 'Advisor can control Try-On and switch dresses for you.'}
          </Text>
          {bookingDresses.length > 0 ? (
            <Text className="text-black/35 text-[11px] text-center mt-3 px-6">
              {bookingDresses.length} dress{bookingDresses.length === 1 ? '' : 'es'} on this booking
            </Text>
          ) : null}
        </View>

        {/* Preparation Tips Section (only when waiting) */}
        {callState === 'waiting' && (
          <View className="px-8 pb-10">
            <View className="bg-[#F9F9F9] p-6 rounded-2xl">
              <Text className="text-black text-[12px] font-bold uppercase mb-6 tracking-[1px] opacity-40">Preparation Tips</Text>
              <View className="gap-5">
                {[
                  'Ensure you are in a well-lit room',
                  'Stand 2-3 meters back for full body view',
                  'Wear tight-fitting clothes for accurate AI'
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
          </View>
        )}
      </ScrollView>

      {/* Footer (only when active) */}
      {callState === 'active' && (
        <View 
          className="absolute bottom-0 left-0 right-0 bg-white/90 px-8 pt-6 pb-12 border-t border-[#F5F5F5]"
          style={{ paddingBottom: insets.bottom + 10 }}
        >
          <TouchableOpacity 
            activeOpacity={0.9}
            onPress={handleEndCall}
            disabled={ending}
            className={`w-full py-5 rounded-sm items-center justify-center shadow-lg ${ending ? 'bg-black/40' : 'bg-black'}`}
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
