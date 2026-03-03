import { create } from 'zustand';

export type BetZone =
  | 'red' | 'black' | 'odd' | 'even'
  | 'dozen_1' | 'dozen_2' | 'dozen_3'
  | 'col_1' | 'col_2' | 'col_3'
  | `number_${number}`;

export interface PlacedChip {
  zone: BetZone;
  amount: number;
}

export type GamePhase = 'betting' | 'spinning' | 'result';

interface RouletteState {
  selectedChip: number;
  placedChips: PlacedChip[];
  gamePhase: GamePhase;
  isMuted: boolean;
  // Actions
  setSelectedChip: (amount: number) => void;
  placeChip: (zone: BetZone) => void;
  undoLast: () => void;
  clearAll: () => void;
  halfBet: () => void;
  doubleBet: () => void;
  rebet: (chips: PlacedChip[]) => void;
  setGamePhase: (phase: GamePhase) => void;
  toggleMute: () => void;
}

export const useRouletteStore = create<RouletteState>()((set) => ({
  selectedChip: 10,
  placedChips: [],
  gamePhase: 'betting',
  isMuted: localStorage.getItem('mute') === 'true',
  setSelectedChip: (amount) => set({ selectedChip: amount }),
  placeChip: (zone) => set((s) => ({
    placedChips: [...s.placedChips, { zone, amount: s.selectedChip }],
  })),
  undoLast: () => set((s) => ({ placedChips: s.placedChips.slice(0, -1) })),
  clearAll: () => set({ placedChips: [] }),
  halfBet: () => set((s) => ({
    placedChips: s.placedChips.map((c) => ({ ...c, amount: Math.max(1, Math.floor(c.amount / 2)) })),
  })),
  doubleBet: () => set((s) => ({
    placedChips: s.placedChips.map((c) => ({ ...c, amount: c.amount * 2 })),
  })),
  rebet: (chips) => set({ placedChips: chips }),
  setGamePhase: (phase) => set({ gamePhase: phase }),
  toggleMute: () => set((s) => {
    const next = !s.isMuted;
    localStorage.setItem('mute', String(next));
    return { isMuted: next };
  }),
}));
