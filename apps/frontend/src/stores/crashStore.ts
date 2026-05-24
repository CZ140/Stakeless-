import { create } from 'zustand';

export type CrashPhase = 'idle' | 'running' | 'cashed' | 'busted';

export interface CrashResult {
  win: boolean;
  multiplier: number; // cash-out multiplier on a win, crash point on a loss
  payout: number; // 0 on a loss
  profit: number; // net (payout − stake)
  auto: boolean;
}

export interface CrashHistoryEntry {
  value: number; // the multiplier the round ended at
  win: boolean;
}

interface CrashState {
  betAmount: number;
  autoEnabled: boolean;
  autoValue: number; // target multiplier when auto is enabled (≥ 1.01)
  isMuted: boolean;
  phase: CrashPhase;
  sessionId: number | null;
  lastResult: CrashResult | null;
  history: CrashHistoryEntry[];

  setBetAmount: (n: number) => void;
  setAutoEnabled: (b: boolean) => void;
  setAutoValue: (n: number) => void;
  toggleMute: () => void;
  startRunning: (sessionId: number) => void;
  settle: (result: CrashResult) => void;
  resetToIdle: () => void;
}

export const useCrashStore = create<CrashState>()((set) => ({
  betAmount: Number(localStorage.getItem('lastBet_crash')) || 10,
  autoEnabled: localStorage.getItem('autoEnabled_crash') === 'true',
  autoValue: Number(localStorage.getItem('autoValue_crash')) || 2,
  isMuted: localStorage.getItem('isMuted_crash') === 'true',
  phase: 'idle',
  sessionId: null,
  lastResult: null,
  history: [],

  setBetAmount: (n) => set({ betAmount: Math.max(1, Math.floor(n)) }),
  setAutoEnabled: (b) =>
    set(() => {
      localStorage.setItem('autoEnabled_crash', String(b));
      return { autoEnabled: b };
    }),
  setAutoValue: (n) =>
    set(() => {
      const v = Math.max(1.01, Math.round(n * 100) / 100);
      localStorage.setItem('autoValue_crash', String(v));
      return { autoValue: v };
    }),
  toggleMute: () =>
    set((s) => {
      const next = !s.isMuted;
      localStorage.setItem('isMuted_crash', String(next));
      return { isMuted: next };
    }),
  startRunning: (sessionId) => set({ phase: 'running', sessionId, lastResult: null }),
  settle: (result) =>
    set((s) => ({
      phase: result.win ? 'cashed' : 'busted',
      lastResult: result,
      sessionId: null,
      history: [{ value: result.multiplier, win: result.win }, ...s.history].slice(0, 12),
    })),
  resetToIdle: () => set({ phase: 'idle', sessionId: null, lastResult: null }),
}));
