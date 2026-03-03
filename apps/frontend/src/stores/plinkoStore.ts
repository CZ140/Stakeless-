import { create } from 'zustand';

export type RiskLevel = 'low' | 'medium' | 'high' | 'expert';
export type GamePhase = 'betting' | 'dropping' | 'result';

interface PlinkoState {
  betAmount: number;
  rows: number;          // 8–16
  riskLevel: RiskLevel;
  gamePhase: GamePhase;
  isMuted: boolean;
  lastResult: { bucket: number; multiplier: number; profit: number } | null;
  // Actions
  setBetAmount: (n: number) => void;
  setRows: (n: number) => void;
  setRiskLevel: (r: RiskLevel) => void;
  halfBet: () => void;
  doubleBet: () => void;
  setGamePhase: (p: GamePhase) => void;
  toggleMute: () => void;
  setLastResult: (r: PlinkoState['lastResult']) => void;
}

export const usePlinkoStore = create<PlinkoState>()((set) => ({
  betAmount: Number(localStorage.getItem('lastBet_plinko')) || 10,
  rows: 12,
  riskLevel: 'medium',
  gamePhase: 'betting',
  isMuted: localStorage.getItem('isMuted_plinko') === 'true',
  lastResult: null,
  setBetAmount: (n) => set({ betAmount: Math.max(1, n) }),
  setRows: (n) => set({ rows: Math.min(16, Math.max(8, n)) }),
  setRiskLevel: (r) => set({ riskLevel: r }),
  halfBet: () => set((s) => ({ betAmount: Math.max(1, Math.floor(s.betAmount / 2)) })),
  doubleBet: () => set((s) => ({ betAmount: s.betAmount * 2 })),
  setGamePhase: (p) => set({ gamePhase: p }),
  toggleMute: () => set((s) => {
    const next = !s.isMuted;
    localStorage.setItem('isMuted_plinko', String(next));
    return { isMuted: next };
  }),
  setLastResult: (r) => set({ lastResult: r }),
}));
