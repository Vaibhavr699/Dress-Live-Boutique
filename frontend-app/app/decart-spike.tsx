/**
 * Decart Lucy 2.1 VTON live-stream spike.
 *
 * Standalone test screen — NOT linked from any nav. Open by navigating to
 * `/decart-spike` from a dev build (e.g. paste the URL in expo-dev-client,
 * or wire a temp button in the home tab while testing).
 *
 * What this proves:
 *   1. @decartai/sdk imports and runs under Metro.
 *   2. Decart's WebRTC bridge picks up LiveKit's registered globals
 *      (RTCPeerConnection / MediaStream from @livekit/react-native-webrtc)
 *      instead of needing the conflicting `react-native-webrtc` install.
 *   3. The remote (transformed) MediaStream can be rendered locally —
 *      proving the track is a usable WebRTC stream we could later wrap
 *      in a LiveKit LocalVideoTrack and publish.
 *   4. setPrompt / setImage successfully swap the active garment.
 *
 * What this does NOT yet do (next milestone):
 *   - Publish the transformed stream to LiveKit
 *   - Wire to a real booking via /decart-token (token is pasted manually)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ensureLiveKitRegistered } from '@shared/livekitInit';
import { isLiveKitNativeSupported } from '@shared/livekitAvailability';

// All Decart SDK access is dynamically required so the screen still loads
// (with a helpful error message) on platforms where the SDK isn't usable
// — same defensive pattern the existing video-call.tsx uses for LiveKit.
type DecartSdk = {
  createDecartClient: (opts: { apiKey: string }) => DecartClient;
  models: { realtime: (name: string) => any };
};
type DecartClient = {
  realtime: {
    connect: (
      stream: any,
      opts: {
        model: any;
        onRemoteStream: (s: any) => void;
        initialState?: { prompt?: { text: string; enhance?: boolean }; image?: string | null };
      },
    ) => Promise<RealtimeClient>;
  };
};
type RealtimeClient = {
  set: (input: { prompt?: string; image?: string | null; enhance?: boolean }) => Promise<void>;
  setPrompt: (prompt: string, opts?: { enhance?: boolean }) => Promise<void>;
  setImage: (image: string | null, opts?: { prompt?: string; enhance?: boolean }) => Promise<void>;
  disconnect: () => void;
  isConnected: () => boolean;
  on: (event: string, cb: (data: any) => void) => void;
};

function loadDecartSdk(): DecartSdk | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@decartai/sdk');
  } catch (e) {
    return null;
  }
}

function loadWebRtc() {
  // We never install react-native-webrtc directly. LiveKit ships its fork
  // (@livekit/react-native-webrtc) and registers its primitives as globals
  // when ensureLiveKitRegistered() runs. mediaDevices, MediaStream, etc.
  // are available on globalThis after that — which is exactly what the
  // Decart SDK looks for.
  //
  // CRITICAL: never call this at render time. The webrtc module accesses
  // its native bridge at module init — if the bridge isn't loaded yet
  // (Expo Go, or the very first touch before LiveKit init), the require
  // throws "WebRTC native module not found" and React surfaces it as an
  // unhandled exception even with try/catch. Always call from inside an
  // effect or button handler, AFTER ensureLiveKitRegistered().
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@livekit/react-native-webrtc');
  } catch (e) {
    return null;
  }
}

type LogEntry = { ts: string; level: 'info' | 'warn' | 'error'; msg: string };

export default function DecartSpikeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [ekToken, setEkToken] = useState('');
  const [status, setStatus] = useState<
    'idle' | 'registering' | 'getting-camera' | 'connecting' | 'connected' | 'error'
  >('idle');
  const [hasRemote, setHasRemote] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [promptInput, setPromptInput] = useState(
    'elegant ivory A-line wedding gown, chiffon, sweetheart neckline',
  );
  const [imageInput, setImageInput] = useState('');

  const realtimeRef = useRef<RealtimeClient | null>(null);
  const localStreamRef = useRef<any>(null);
  const remoteStreamRef = useRef<any>(null);
  // Render the local + remote streams to <RTCView> by stashing their srcObject.
  // We use refs + state hooks to force re-render only when track URLs change.
  const [localStreamUrl, setLocalStreamUrl] = useState<string | null>(null);
  const [remoteStreamUrl, setRemoteStreamUrl] = useState<string | null>(null);

  // Native-module probe — runs once after mount, AFTER ensureLiveKitRegistered
  // has had a chance to wire the bridge. Storing the loaded module + RTCView
  // in state means we never have to call require() at render time (which would
  // crash on Expo Go / a misconfigured dev client).
  const [nativeProbe, setNativeProbe] = useState<{
    webrtc: any | null;
    RTCView: React.ComponentType<any> | null;
    error: string | null;
  }>({ webrtc: null, RTCView: null, error: null });

  const log = useCallback((level: LogEntry['level'], msg: string) => {
    const ts = new Date().toISOString().slice(11, 19);
    setLogs((prev) => [{ ts, level, msg }, ...prev].slice(0, 30));
    if (level === 'error') console.error('[decart-spike]', msg);
    else if (level === 'warn') console.warn('[decart-spike]', msg);
    else console.log('[decart-spike]', msg);
  }, []);

  // Probe the native bridge AFTER mount, after LiveKit init. This is the
  // only place we touch @livekit/react-native-webrtc — never at render.
  useEffect(() => {
    if (!isLiveKitNativeSupported()) {
      setNativeProbe({
        webrtc: null,
        RTCView: null,
        error:
          'LiveKit native module unavailable on this binary. ' +
          'Likely you are running Expo Go — you need a dev-client build. ' +
          'Run: `npx expo prebuild --clean && npx expo run:ios` (or run:android).',
      });
      return;
    }
    try {
      ensureLiveKitRegistered();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const webrtc = require('@livekit/react-native-webrtc');
      setNativeProbe({
        webrtc,
        RTCView: webrtc?.RTCView ?? null,
        error: null,
      });
    } catch (e: any) {
      setNativeProbe({
        webrtc: null,
        RTCView: null,
        error:
          `Loaded LiveKit but @livekit/react-native-webrtc failed to bind: ${e?.message || String(e)}. ` +
          'Rebuild the dev client: `npx expo prebuild --clean && npx expo run:ios` (or run:android).',
      });
    }
  }, []);

  // ── The spike itself ──────────────────────────────────────────────────
  const runSpike = useCallback(async () => {
    if (nativeProbe.error) {
      Alert.alert('Native bridge missing', nativeProbe.error);
      return;
    }
    if (!ekToken.trim()) {
      Alert.alert(
        'Token required',
        'Paste a Decart client token (ek_...) into the input above first.\n\n' +
          'Mint one with:\ncurl -X POST https://api.decart.ai/v1/client/tokens \\\n' +
          '  -H "x-api-key: $DECART_API_KEY" \\\n' +
          '  -H "content-type: application/json" \\\n' +
          '  -d \'{"expiresIn":3600,"allowedModels":["lucy-2.1-vton"]}\'',
      );
      return;
    }

    // (1) Registered globals — LiveKit takes care of this; we just have to
    // be sure it ran before Decart tries to touch RTCPeerConnection.
    setStatus('registering');
    log('info', '1. Registering LiveKit globals…');
    if (!isLiveKitNativeSupported()) {
      log('error', 'LiveKit native not supported on this build. Need a dev client with WebRTC.');
      setStatus('error');
      return;
    }
    ensureLiveKitRegistered();
    log(
      'info',
      `  globalThis.RTCPeerConnection: ${typeof (globalThis as any).RTCPeerConnection}`,
    );
    log('info', `  globalThis.MediaStream: ${typeof (globalThis as any).MediaStream}`);

    // (2) Load Decart SDK.
    const sdk = loadDecartSdk();
    if (!sdk) {
      log('error', '@decartai/sdk failed to require — restart Metro with --clear?');
      setStatus('error');
      return;
    }
    log('info', '2. Decart SDK loaded.');

    // (3) Grab the camera through LiveKit's registered mediaDevices. This
    // is the SAME path getUserMedia takes in production — proves the track
    // we hand Decart is the kind it can transform.
    setStatus('getting-camera');
    log('info', '3. Requesting camera via @livekit/react-native-webrtc…');
    const webrtc = nativeProbe.webrtc;
    if (!webrtc?.mediaDevices) {
      log('error', `@livekit/react-native-webrtc.mediaDevices missing — ${nativeProbe.error || 'unknown reason'}`);
      setStatus('error');
      return;
    }
    let rawStream: any;
    try {
      rawStream = await webrtc.mediaDevices.getUserMedia({
        audio: false,                                  // audio bypasses Decart in prod
        video: { frameRate: 20, width: 1088, height: 624, facingMode: 'user' },
      });
    } catch (e: any) {
      log('error', `getUserMedia failed: ${e?.message || String(e)}`);
      setStatus('error');
      return;
    }
    localStreamRef.current = rawStream;
    setLocalStreamUrl(rawStream.toURL?.() ?? null);
    log('info', `   camera ok — ${rawStream.getVideoTracks().length} video track(s)`);

    // (4) Open the Decart realtime session.
    setStatus('connecting');
    log('info', '4. Creating Decart client + opening realtime stream…');
    try {
      const client = sdk.createDecartClient({ apiKey: ekToken.trim() });
      const model = sdk.models.realtime('lucy-2.1-vton');
      log('info', `   model: ${model.name} @ ${model.fps}fps ${model.width}x${model.height}`);

      const realtime = await client.realtime.connect(rawStream, {
        model,
        // Decart rejects an empty `prompt.text` (zod min:1). Connect with
        // a neutral placeholder so the session opens cleanly — the user
        // will replace it via setPrompt the moment they apply a dress.
        // To actually achieve "no dress" later, call .set({ image: null })
        // and OMIT the prompt entirely; do NOT pass prompt: ''.
        initialState: { prompt: { text: 'person standing in a neutral room', enhance: false } },
        onRemoteStream: (transformedStream: any) => {
          remoteStreamRef.current = transformedStream;
          setRemoteStreamUrl(transformedStream.toURL?.() ?? null);
          setHasRemote(true);
          log(
            'info',
            `5. onRemoteStream fired — ${transformedStream.getVideoTracks?.().length ?? '?'} video track(s)`,
          );
        },
      });
      realtimeRef.current = realtime;

      realtime.on('connectionChange', (state: string) => log('info', `   connection: ${state}`));
      realtime.on('error', (err: any) => log('error', `Decart error: ${err?.message || String(err)}`));
      realtime.on('generationTick', ({ seconds }: any) => {
        // Quiet log every 5s so we know rendering is alive without flooding.
        if (Math.floor(seconds) % 5 === 0) log('info', `   …generating @ ${Math.floor(seconds)}s`);
      });

      setStatus('connected');
      log('info', '✓ Spike connected. Try the dress-switch buttons.');
    } catch (e: any) {
      log('error', `Decart connect failed: ${e?.message || String(e)}`);
      setStatus('error');
    }
  }, [ekToken, log]);

  // ── Manual dress switching ─────────────────────────────────────────────
  const applyPrompt = useCallback(async () => {
    if (!realtimeRef.current) return;
    try {
      log('info', `→ set({ prompt: "${promptInput.slice(0, 40)}..." })`);
      await realtimeRef.current.set({
        prompt: promptInput,
        image: imageInput.trim() || null,
        enhance: false,
      });
    } catch (e: any) {
      log('error', `set() failed: ${e?.message || String(e)}`);
    }
  }, [promptInput, imageInput, log]);

  const clearDress = useCallback(async () => {
    if (!realtimeRef.current) return;
    try {
      // For "no dress": clear the image reference but keep a neutral prompt.
      // Decart rejects empty prompt strings (zod min:1) — passing '' here
      // would 422 the same way connect() did. The bride sees herself with
      // no garment overlaid because we cleared the reference image.
      log('info', '→ setImage(null)  (no dress — keep last prompt as fallback)');
      await realtimeRef.current.setImage(null);
    } catch (e: any) {
      log('error', `setImage() failed: ${e?.message || String(e)}`);
    }
  }, [log]);

  // ── Cleanup ────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      try { realtimeRef.current?.disconnect(); } catch {}
      try { localStreamRef.current?.getTracks?.().forEach((t: any) => t.stop()); } catch {}
    };
  }, []);

  // ── UI ─────────────────────────────────────────────────────────────────
  const RTCView = nativeProbe.RTCView ?? undefined;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Text style={{ color: '#0af', fontSize: 14 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Decart spike · {status}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {nativeProbe.error && (
          <View style={[styles.logBox, { borderColor: '#ff7070', backgroundColor: '#2a0000', marginBottom: 12 }]}>
            <Text style={[styles.logLine, { color: '#ff7070', lineHeight: 16 }]}>
              ⚠ {nativeProbe.error}
            </Text>
          </View>
        )}
        <Text style={styles.label}>Decart client token (ek_…)</Text>
        <TextInput
          value={ekToken}
          onChangeText={setEkToken}
          placeholder="ek_..."
          placeholderTextColor="#666"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          style={styles.input}
        />

        <TouchableOpacity
          onPress={runSpike}
          disabled={status === 'connecting' || status === 'getting-camera'}
          style={[styles.button, status === 'connected' && styles.buttonSuccess]}
        >
          {status === 'connecting' || status === 'getting-camera' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {status === 'connected' ? 'Reconnect' : 'Run spike'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Side-by-side video preview */}
        <View style={styles.videoRow}>
          <View style={styles.videoCol}>
            <Text style={styles.videoLabel}>local (raw camera)</Text>
            <View style={styles.videoBox}>
              {RTCView && localStreamUrl ? (
                <RTCView streamURL={localStreamUrl} style={styles.video} objectFit="cover" />
              ) : (
                <Text style={styles.placeholder}>
                  {status === 'idle' ? 'press Run spike' : '…'}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.videoCol}>
            <Text style={styles.videoLabel}>remote (decart)</Text>
            <View style={styles.videoBox}>
              {RTCView && remoteStreamUrl ? (
                <RTCView streamURL={remoteStreamUrl} style={styles.video} objectFit="cover" />
              ) : (
                <Text style={styles.placeholder}>{hasRemote ? '…' : 'waiting'}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Dress switcher */}
        {status === 'connected' && (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.label}>prompt</Text>
            <TextInput
              value={promptInput}
              onChangeText={setPromptInput}
              placeholder="e.g. ivory A-line wedding gown"
              placeholderTextColor="#666"
              multiline
              style={styles.input}
            />
            <Text style={styles.label}>image URL (optional, public/signed)</Text>
            <TextInput
              value={imageInput}
              onChangeText={setImageInput}
              placeholder="https://supabase.../dress.jpg"
              placeholderTextColor="#666"
              autoCapitalize="none"
              style={styles.input}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={applyPrompt} style={[styles.button, { flex: 1 }]}>
                <Text style={styles.buttonText}>Apply prompt</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={clearDress} style={[styles.button, styles.buttonOutline, { flex: 1 }]}>
                <Text style={[styles.buttonText, { color: '#fff' }]}>No dress</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Logs */}
        <View style={{ marginTop: 16 }}>
          <Text style={styles.label}>logs</Text>
          <View style={styles.logBox}>
            {logs.map((e, i) => (
              <Text
                key={i}
                style={[
                  styles.logLine,
                  e.level === 'error' && { color: '#ff7070' },
                  e.level === 'warn' && { color: '#ffd070' },
                ]}
              >
                {e.ts}  {e.msg}
              </Text>
            ))}
            {logs.length === 0 && <Text style={styles.placeholder}>—</Text>}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  title: { color: '#fff', fontSize: 14, fontWeight: '600' },
  label: { color: '#888', fontSize: 11, marginTop: 12, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 },
  input: {
    color: '#fff',
    backgroundColor: '#111',
    borderColor: '#222',
    borderWidth: 1,
    padding: 10,
    fontSize: 12,
    fontFamily: 'Menlo',
    minHeight: 38,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: '#0a7',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 10,
    alignItems: 'center',
  },
  buttonSuccess: { backgroundColor: '#080' },
  buttonOutline: { backgroundColor: 'transparent', borderColor: '#444', borderWidth: 1 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  videoRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  videoCol: { flex: 1 },
  videoLabel: { color: '#888', fontSize: 10, marginBottom: 4 },
  videoBox: {
    aspectRatio: 9 / 16,
    backgroundColor: '#111',
    borderColor: '#222',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: { width: '100%', height: '100%' },
  placeholder: { color: '#444', fontSize: 11 },
  logBox: {
    backgroundColor: '#0a0a0a',
    borderColor: '#222',
    borderWidth: 1,
    padding: 8,
    minHeight: 100,
  },
  logLine: { color: '#aaa', fontSize: 10, fontFamily: 'Menlo', lineHeight: 14 },
});
