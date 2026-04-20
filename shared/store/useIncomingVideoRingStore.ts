import { create } from 'zustand';

export type IncomingVideoRingPayload = {
  bookingId: number;
  callerDisplayName: string;
  callerRole: 'buyer' | 'partner';
  scheduledFor?: string | null;
};

type State = {
  incoming: IncomingVideoRingPayload | null;
  setIncoming: (v: IncomingVideoRingPayload | null) => void;
};

export const useIncomingVideoRingStore = create<State>((set) => ({
  incoming: null,
  setIncoming: (incoming) => set({ incoming }),
}));
