import { Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export type MediaPermissionKind = 'library' | 'camera';

const COPY: Record<MediaPermissionKind, { title: string; ask: string; settings: string }> = {
  library: {
    title: 'Photo access needed',
    ask: 'Allow Dress Live to access your photos so you can choose an image.',
    settings: 'Photo access is off. Turn on Photos for Dress Live in Settings, then try again.',
  },
  camera: {
    title: 'Camera access needed',
    ask: 'Allow Dress Live to use your camera to take a photo.',
    settings: 'Camera access is off. Turn on Camera for Dress Live in Settings, then try again.',
  },
};

/**
 * Request a media permission (photo library or camera) and, on denial, show a
 * clear help message instead of silently doing nothing. When the OS won't
 * prompt again (canAskAgain === false) the alert offers a shortcut straight to
 * the app's Settings page so the user has a real recovery path.
 *
 * Returns true only when access is granted, so callers can guard a picker with:
 *   if (!(await ensureMediaPermission('library'))) return;
 * and never proceed into something the user can't use.
 */
export async function ensureMediaPermission(kind: MediaPermissionKind): Promise<boolean> {
  const result =
    kind === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (result.granted) return true;

  const copy = COPY[kind];
  if (result.canAskAgain === false) {
    Alert.alert(copy.title, copy.settings, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => void Linking.openSettings() },
    ]);
  } else {
    Alert.alert(copy.title, copy.ask);
  }
  return false;
}
