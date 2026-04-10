import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

interface WishlistItem {
  id: string;
  name: string;
  price: string;
  image: any;
}

interface WishlistState {
  items: WishlistItem[];
  toggleItem: (item: WishlistItem) => void;
  isInWishlist: (id: string) => boolean;
}

const storage = {
  getItem: async (name: string): Promise<string | null> => {
    if (Platform.OS === 'web') return localStorage.getItem(name);
    return await SecureStore.getItemAsync(name);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.setItem(name, value);
    } else {
      await SecureStore.setItemAsync(name, value);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(name);
    } else {
      await SecureStore.deleteItemAsync(name);
    }
  },
};

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],
      toggleItem: (item) => {
        const currentItems = get().items;
        const index = currentItems.findIndex((i) => i.id === item.id);

        if (index > -1) {
          set({ items: currentItems.filter((i) => i.id !== item.id) });
        } else {
          set({ items: [...currentItems, item] });
        }
      },
      isInWishlist: (id) => get().items.some((item) => item.id === id),
    }),
    {
      name: 'wishlist-storage',
      storage: createJSONStorage(() => storage),
    }
  )
);
