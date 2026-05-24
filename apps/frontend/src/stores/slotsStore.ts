import { create } from 'zustand';
import type { SlotGrid, SlotLineWin } from '@gambling/shared';

export interface SlotsResult {
  grid: SlotGrid;
  lines: SlotLineWin[];
  totalPayout: number;
  win: boolean;
  profit: number;
}

interface SlotsState {
  betAmount: number;
  isMuted: boolean;
  spinning: boolean;
  lastResult: SlotsResult | null;
  setBetAmount: (n: number) => void;
  toggleMute: () => void;
  setSpinning: (b: boolean) => void;
  setLastResult: (r: SlotsResult | null) => void;
}

export const useSlotsStore = create<SlotsState>()((set) => ({
  betAmount: Number(localStorage.getItem('lastBet_slots')) || 10,
  isMuted: localStorage.getItem('isMuted_slots') === 'true',
  spinning: false,
  lastResult: null,
  setBetAmount: (n) => set({ betAmount: Math.max(1, Math.floor(n)) }),
  toggleMute: () =>
    set((s) => {
      const next = !s.isMuted;
      localStorage.setItem('isMuted_slots', String(next));
      return { isMuted: next };
    }),
  setSpinning: (b) => set({ spinning: b }),
  setLastResult: (r) => set({ lastResult: r }),
}));
