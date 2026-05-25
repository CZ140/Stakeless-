import { create } from 'zustand';
import type { PumpDifficulty } from '@gambling/shared';

export type PumpPhase = 'betting' | 'active' | 'result';

export interface PumpResultData {
  won: boolean;
  payout: number;
  pumps: number;
  multiplier: number;
  popped: boolean;
}

const lastDifficulty = (localStorage.getItem('lastDifficulty_pump') as PumpDifficulty | null) ?? 'medium';

interface PumpState {
  betAmount: number;
  difficulty: PumpDifficulty;
  phase: PumpPhase;
  sessionId: number | null;
  pumps: number;
  multiplier: number; // cumulative payout multiplier
  maxPumps: number;
  maxedOut: boolean; // balloon is full — only cash-out remains
  result: PumpResultData | null;

  setBetAmount: (n: number) => void;
  setDifficulty: (d: PumpDifficulty) => void;
  startRound: (p: { sessionId: number; maxPumps: number }) => void;
  applyInflate: (p: { pumps: number; multiplier: number; maxedOut: boolean }) => void;
  applyPop: (p: { pumps: number; multiplier: number }) => void;
  applyCashout: (p: { payout: number; multiplier: number; pumps: number }) => void;
  restoreSession: (s: {
    sessionId: number;
    difficulty: PumpDifficulty;
    pumps: number;
    multiplier: number;
    maxPumps: number;
    betAmount: number;
  }) => void;
  reset: () => void;
}

export const usePumpStore = create<PumpState>()((set) => ({
  betAmount: Number(localStorage.getItem('lastBet_pump')) || 10,
  difficulty: lastDifficulty,
  phase: 'betting',
  sessionId: null,
  pumps: 0,
  multiplier: 1,
  maxPumps: 0,
  maxedOut: false,
  result: null,

  setBetAmount: (n) => set({ betAmount: Math.max(1, Math.floor(n)) }),
  setDifficulty: (d) => {
    localStorage.setItem('lastDifficulty_pump', d);
    set({ difficulty: d });
  },

  startRound: ({ sessionId, maxPumps }) =>
    set({ phase: 'active', sessionId, pumps: 0, multiplier: 1, maxPumps, maxedOut: false, result: null }),

  applyInflate: ({ pumps, multiplier, maxedOut }) => set({ pumps, multiplier, maxedOut }),

  applyPop: ({ pumps, multiplier }) =>
    set({ phase: 'result', result: { won: false, payout: 0, pumps, multiplier, popped: true } }),

  applyCashout: ({ payout, multiplier, pumps }) =>
    set({ phase: 'result', result: { won: true, payout, pumps, multiplier, popped: false } }),

  restoreSession: (s) =>
    set({
      phase: 'active',
      sessionId: s.sessionId,
      difficulty: s.difficulty,
      pumps: s.pumps,
      multiplier: s.multiplier,
      maxPumps: s.maxPumps,
      maxedOut: s.pumps >= s.maxPumps,
      result: null,
    }),

  reset: () =>
    set({ phase: 'betting', sessionId: null, pumps: 0, multiplier: 1, maxPumps: 0, maxedOut: false, result: null }),
}));
