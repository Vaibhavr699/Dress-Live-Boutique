import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

interface CartItem {
  id: string;
  name: string;
  price: string;
  // Numeric price (currency units) — the source of truth for totals. `price`
  // is only a localized display string and must not be parsed for math.
  priceValue?: number;
  imageUrl?: string | null;
  boutiqueId?: number | null;
  quantity: number;
  selected: boolean;
}

interface CartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  toggleSelected: (id: string) => void;
  selectOnly: (id: string) => void;
  clearCart: () => void;
  totalItems: () => number;
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

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) => {
        const currentItems = get().items;
        const existingItem = currentItems.find((i) => i.id === item.id);

        if (existingItem) {
          set({
            items: currentItems.map((i) =>
              i.id === item.id ? { ...i, quantity: i.quantity + 1, selected: true } : i
            ),
          });
        } else {
          set({ items: [...currentItems, { ...item, quantity: 1 }] });
        }
      },
      removeItem: (id) => {
        set({ items: get().items.filter((i) => i.id !== id) });
      },
      updateQuantity: (id, quantity) => {
        if (quantity <= 0) {
          set({ items: get().items.filter((i) => i.id !== id) });
          return;
        }

        set({
          items: get().items.map((i) =>
            i.id === id ? { ...i, quantity } : i
          ),
        });
      },
      toggleSelected: (id) => {
        set({
          items: get().items.map((i) =>
            i.id === id ? { ...i, selected: !i.selected } : i
          ),
        });
      },
      selectOnly: (id) => {
        set({
          items: get().items.map((i) => {
            if (i.id === id) return { ...i, selected: true };
            if (!i.selected) return i;
            return { ...i, selected: false };
          }),
        });
      },
      clearCart: () => set({ items: [] }),
      totalItems: () => get().items.reduce((acc, item) => acc + item.quantity, 0),
    }),
    {
      name: 'cart-storage',
      storage: createJSONStorage(() => storage),
    }
  )
);
