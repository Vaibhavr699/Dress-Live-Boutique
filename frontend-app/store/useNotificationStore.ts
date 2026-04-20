import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type NotificationItem = {
  id: string;
  title: string;
  body?: string | null;
  createdAt: string;
  readAt?: string | null;
  action?: { type: 'booking'; bookingId: number } | null;
};

type NotificationState = {
  items: NotificationItem[];
  add: (item: Omit<NotificationItem, 'id' | 'createdAt' | 'readAt'> & { createdAt?: string }) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
};

const storage = {
  getItem: async (name: string): Promise<string | null> => {
    if (Platform.OS === 'web') return localStorage.getItem(name);
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

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) => {
        const next: NotificationItem = {
          id: makeId(),
          title: item.title,
          body: item.body ?? null,
          createdAt: item.createdAt ?? new Date().toISOString(),
          readAt: null,
          action: item.action ?? null,
        };
        set({ items: [next, ...get().items].slice(0, 50) });
      },
      markRead: (id) =>
        set({
          items: get().items.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)),
        }),
      markAllRead: () =>
        set({
          items: get().items.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
        }),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'notification-storage',
      storage: createJSONStorage(() => storage),
    }
  )
);

