import { create } from 'zustand';

// The payload pushed over the `tier:up` socket event when a settled round vaults
// the player into a new tier. Drives the celebration modal.
export interface TierUp {
  level: number;
  name: string;
  reward: number;
  dailyBonus: number;
}

interface TierCelebrationState {
  pending: TierUp | null;
  celebrate: (t: TierUp) => void;
  dismiss: () => void;
}

export const useTierCelebrationStore = create<TierCelebrationState>()((set) => ({
  pending: null,
  celebrate: (t) => set({ pending: t }),
  dismiss: () => set({ pending: null }),
}));
