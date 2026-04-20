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
  externalKey?: string | null;
  kind?:
    | 'booking_requested'
    | 'booking_updated'
    | 'booking_cancelled'
    | 'booking_upcoming'
    | 'booking_reminder'
    | null;
  appointmentType?: 'video' | 'in_store' | null;
  scheduledFor?: string | null;
  location?: string | null;
  customerName?: string | null;
  status?: string | null;
  action?: { type: 'booking'; bookingId: number } | null;
};

type NotificationState = {
  items: NotificationItem[];
  add: (item: Omit<NotificationItem, 'id' | 'createdAt' | 'readAt'> & { createdAt?: string }) => void;
  upsert: (item: Omit<NotificationItem, 'id' | 'createdAt' | 'readAt'> & { createdAt?: string }) => void;
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

function buildNotification(item: Omit<NotificationItem, 'id' | 'createdAt' | 'readAt'> & { createdAt?: string }): NotificationItem {
  return {
    id: makeId(),
    title: item.title,
    body: item.body ?? null,
    createdAt: item.createdAt ?? new Date().toISOString(),
    readAt: null,
    externalKey: item.externalKey ?? null,
    kind: item.kind ?? null,
    appointmentType: item.appointmentType ?? null,
    scheduledFor: item.scheduledFor ?? null,
    location: item.location ?? null,
    customerName: item.customerName ?? null,
    status: item.status ?? null,
    action: item.action ?? null,
  };
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) => {
        const next = buildNotification(item);
        set({ items: [next, ...get().items].slice(0, 50) });
      },
      upsert: (item) => {
        const next = buildNotification(item);
        const key = next.externalKey?.trim();
        if (!key) {
          set({ items: [next, ...get().items].slice(0, 50) });
          return;
        }
        const existing = get().items;
        const index = existing.findIndex((n) => (n.externalKey || '').trim() === key);
        if (index === -1) {
          set({ items: [next, ...existing].slice(0, 50) });
          return;
        }
        const current = existing[index];
        const changed =
          current.title !== next.title ||
          current.body !== next.body ||
          current.scheduledFor !== next.scheduledFor ||
          current.status !== next.status ||
          current.location !== next.location ||
          current.customerName !== next.customerName;
        const updated: NotificationItem = {
          ...current,
          ...next,
          id: current.id,
          createdAt: changed ? next.createdAt : current.createdAt,
          readAt: changed ? null : current.readAt ?? null,
        };
        const merged = [...existing];
        merged.splice(index, 1);
        set({ items: [updated, ...merged].slice(0, 50) });
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
      name: 'partner-notification-storage',
      storage: createJSONStorage(() => storage),
    }
  )
);
