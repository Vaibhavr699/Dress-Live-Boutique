import { create } from 'zustand';

/**
 * Transient (in-memory, not persisted) handoff of the just-placed order from
 * the checkout screen to the order-summary confirmation screen.
 *
 * Checkout clears the cart immediately after a successful payment, so the
 * confirmation screen can no longer read the purchased items or totals from the
 * cart. It reads them from here instead — using the backend-authoritative
 * cents amounts (what Stripe actually charged) and the real order id.
 */
export type LastOrderItem = {
  id: string;
  name: string;
  quantity: number;
  price: string;
  imageUrl?: string | null;
};

export type LastOrder = {
  orderId: number;
  currency: string;
  subtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
  items: LastOrderItem[];
};

interface LastOrderState {
  order: LastOrder | null;
  setOrder: (order: LastOrder) => void;
  clear: () => void;
}

export const useLastOrderStore = create<LastOrderState>((set) => ({
  order: null,
  setOrder: (order) => set({ order }),
  clear: () => set({ order: null }),
}));
