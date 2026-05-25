import { create } from 'zustand';
import type { CoinSide } from '@gambling/shared';

export interface CoinflipResult {
  result: CoinSide;
  call: CoinSide;
  win: boolean;
  multiplier: number;
  profit: number;
}

interface CoinflipState {
  betAmount: number;
  call: CoinSide;
  flipping: boolean;
  lastResult: CoinflipResult | null;
  setBetAmount: (n: number) => void;
  setCall: (c: CoinSide) => void;
  setFlipping: (b: boolean) => void;
  setLastResult: (r: CoinflipResult | null) => void;
}

export const useCoinflipStore = create<CoinflipState>()((set) => ({
  betAmount: Number(localStorage.getItem('lastBet_flip')) || 10,
  call: 'heads',
  flipping: false,
  lastResult: null,
  setBetAmount: (n) => set({ betAmount: Math.max(1, Math.floor(n)) }),
  setCall: (c) => set({ call: c }),
  setFlipping: (b) => set({ flipping: b }),
  setLastResult: (r) => set({ lastResult: r }),
}));
