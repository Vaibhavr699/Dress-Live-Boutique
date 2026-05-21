import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';

interface User {
  id: number;
  email: string;
  full_name: string;
  profile_image_url?: string | null;
  profile_image_uri?: string | null;
  phone?: string | null;
  address?: string | null;
  apartment_number?: string | null;
  state_province?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  is_active: boolean;
  is_superuser: boolean;
  role?: 'buyer' | 'partner';
  boutique_id?: number | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
}

import { Platform } from 'react-native';

// Custom storage for SecureStore (Native) with fallback to localStorage (Web)
const secureStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return localStorage.getItem(name);
    }
    return await SecureStore.getItemAsync(name);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.setItem(name, value);
      return;
    }
    await SecureStore.setItemAsync(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(name);
      return;
    }
    await SecureStore.deleteItemAsync(name);
  },
};


/**
 * Best-effort unregister of this device's Expo push token so the user
 * doesn't keep receiving pushes for someone else after they log out (and
 * so the next person who logs in on this device doesn't inherit them).
 *
 * Runs only on native (web doesn't have expo-notifications, and
 * Constants.appOwnership === 'expo' is Expo Go which can't get a token
 * anyway). Wrapped in try/catch so a slow Expo lookup or a 401 doesn't
 * block the logout flow.
 */
async function unregisterPushTokenForCurrentDevice(authBearer: string | null): Promise<void> {
  if (!authBearer) return;
  if (Platform.OS === 'web') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default ?? require('expo-constants');
    if (Constants?.appOwnership === 'expo') return;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    const tokenRes = await Notifications.getExpoPushTokenAsync();
    const expoToken = tokenRes?.data;
    if (!expoToken) return;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { api } = require('../api/api') as typeof import('../api/api');
    await api.delete('/notifications/push-tokens', {
      body: JSON.stringify({ expo_token: expoToken }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authBearer}`,
      },
    });
  } catch {
    // Best-effort — never let push-token cleanup failure block logout.
  }
}


export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      setToken: (token) => set({ token, isAuthenticated: !!token }),
      setUser: (user) => set({ user }),
      logout: async () => {
        // Snapshot the token BEFORE clearing it — the API call below
        // needs the Authorization header and we're about to wipe it.
        const currentToken = get().token;
        // Clear local state immediately so the UI doesn't sit on a
        // half-logged-out screen waiting for the network round-trip. The
        // server-side cleanup runs in the background.
        set({ user: null, token: null, isAuthenticated: false });
        // Fire-and-forget; logout shouldn't await network failures.
        void unregisterPushTokenForCurrentDevice(currentToken);
      },
      initialize: async () => {
        // Zustand persist handles most of this, but we can add extra logic here if needed
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => secureStorage),
    }
  )
);
