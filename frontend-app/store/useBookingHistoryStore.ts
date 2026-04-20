import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type BookingHistoryItem = {
  id: number;
  appointment_type: 'video' | 'in_store';
  status: 'requested' | 'accepted' | 'rejected' | 'rescheduled' | 'completed';
  scheduled_for: string;
  language: string;
  location?: string | null;
};

type BookingHistoryState = {
  items: BookingHistoryItem[];
  lastSyncedAt: string | null;
  setFromApi: (items: BookingHistoryItem[]) => void;
  upsert: (item: BookingHistoryItem) => void;
  remove: (id: number) => void;
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

function normalize(items: BookingHistoryItem[]) {
  const map = new Map<number, BookingHistoryItem>();
  for (const item of items) {
    if (!item || typeof item.id !== 'number') continue;
    map.set(item.id, item);
  }
  return Array.from(map.values());
}

export const useBookingHistoryStore = create<BookingHistoryState>()(
  persist(
    (set, get) => ({
      items: [],
      lastSyncedAt: null,
      setFromApi: (items) =>
        set({
          items: normalize(items),
          lastSyncedAt: new Date().toISOString(),
        }),
      upsert: (item) => {
        const current = get().items;
        const next = normalize([item, ...current]);
        set({ items: next });
      },
      remove: (id) => set({ items: get().items.filter((b) => b.id !== id) }),
      clear: () => set({ items: [], lastSyncedAt: null }),
    }),
    {
      name: 'booking-history-storage',
      storage: createJSONStorage(() => storage),
    }
  )
);

