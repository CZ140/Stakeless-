import { create } from 'zustand';

interface BalanceState {
  balance: number | null;
  // Current tier level (0–5), kept fresh from /auth/me and tier:up socket events.
  // null until the profile loads; drives the tier flair on the balance chip.
  tierLevel: number | null;
  setBalance: (n: number) => void;
  setTierLevel: (level: number) => void;
  clearBalance: () => void;
}

export const useBalanceStore = create<BalanceState>()((set) => ({
  balance: null,
  tierLevel: null,
  setBalance: (n) => set({ balance: n }),
  setTierLevel: (level) => set({ tierLevel: level }),
  clearBalance: () => set({ balance: null, tierLevel: null }),
}));
