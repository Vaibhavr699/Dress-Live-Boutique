import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/**
 * LiveKit for React Native depends on @livekit/react-native-webrtc (native code).
 * That is not available in the Expo Go app — only in a dev client or production build.
 */
export function isLiveKitNativeSupported(): boolean {
  if (Platform.OS === 'web') return false;
  return Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}
