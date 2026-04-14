import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

type ShortlistState = {
  dressIds: number[];
  toggle: (dressId: number) => { ok: true } | { ok: false; reason: 'limit' };
  add: (dressId: number) => { ok: true } | { ok: false; reason: 'limit' };
  remove: (dressId: number) => void;
  set: (dressIds: number[]) => void;
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

function normalizeIds(input: number[]) {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const id of input) {
    const normalized = Number(id);
    if (!Number.isFinite(normalized) || normalized <= 0) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out.slice(0, 4);
}

export const useShortlistStore = create<ShortlistState>()(
  persist(
    (set, get) => ({
      dressIds: [],
      toggle: (dressId) => {
        const normalized = Number(dressId);
        const current = get().dressIds;
        if (current.includes(normalized)) {
          set({ dressIds: current.filter((id) => id !== normalized) });
          return { ok: true };
        }
        if (current.length >= 4) {
          return { ok: false, reason: 'limit' };
        }
        set({ dressIds: [...current, normalized] });
        return { ok: true };
      },
      add: (dressId) => {
        const normalized = Number(dressId);
        const current = get().dressIds;
        if (current.includes(normalized)) {
          return { ok: true };
        }
        if (current.length >= 4) {
          return { ok: false, reason: 'limit' };
        }
        set({ dressIds: [...current, normalized] });
        return { ok: true };
      },
      remove: (dressId) => {
        const normalized = Number(dressId);
        set({ dressIds: get().dressIds.filter((id) => id !== normalized) });
      },
      set: (dressIds) => {
        set({ dressIds: normalizeIds(dressIds) });
      },
      clear: () => set({ dressIds: [] }),
    }),
    {
      name: 'shortlist-storage',
      storage: createJSONStorage(() => storage),
    }
  )
);

