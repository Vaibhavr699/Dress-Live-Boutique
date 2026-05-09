import { Platform } from 'react-native';
import { isLiveKitNativeSupported } from './livekitAvailability';

let registered = false;

/**
 * Lazily registers LiveKit globals (WebRTC adapters, audio session) on first use.
 * Safe to call repeatedly — only the first invocation does work.
 */
export function ensureLiveKitRegistered(): void {
  if (registered) return;
  if (Platform.OS === 'web') return;
  if (!isLiveKitNativeSupported()) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const lk = require('@livekit/react-native');
    if (lk && typeof lk.registerGlobals === 'function') {
      lk.registerGlobals();
    }
    if (
      Platform.OS === 'android' &&
      lk?.AudioSession?.configureAudio &&
      lk?.AndroidAudioTypePresets?.communication
    ) {
      lk.AudioSession.configureAudio({
        audioTypeOptions: lk.AndroidAudioTypePresets.communication,
        preferredOutputList: ['speaker', 'earpiece', 'bluetooth', 'headset'],
      });
    }
    registered = true;
  } catch {
    // no-op — running on a platform/build without LiveKit native module
  }
}
