import { create } from 'zustand';
import type { RpsChoice, RpsOutcome } from '@gambling/shared';

export interface RpsResult {
  choice: RpsChoice;
  house: RpsChoice;
  outcome: RpsOutcome;
  multiplier: number;
  profit: number;
}

interface RpsState {
  betAmount: number;
  choice: RpsChoice;
  playing: boolean;
  lastResult: RpsResult | null;
  setBetAmount: (n: number) => void;
  setChoice: (c: RpsChoice) => void;
  setPlaying: (b: boolean) => void;
  setLastResult: (r: RpsResult | null) => void;
}

export const useRpsStore = create<RpsState>()((set) => ({
  betAmount: Number(localStorage.getItem('lastBet_rps')) || 10,
  choice: 'rock',
  playing: false,
  lastResult: null,
  setBetAmount: (n) => set({ betAmount: Math.max(1, Math.floor(n)) }),
  setChoice: (c) => set({ choice: c }),
  setPlaying: (b) => set({ playing: b }),
  setLastResult: (r) => set({ lastResult: r }),
}));
