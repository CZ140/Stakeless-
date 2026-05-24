import { create } from 'zustand';

export interface LeaderboardRow {
  id: number;
  username: string;
  value: number;
  tierLevel: number;
}

export interface LeaderboardSnapshot {
  byBalance: LeaderboardRow[];
  byWagered: LeaderboardRow[];
  byProfit: LeaderboardRow[];
}

export interface OwnRanks {
  balance: { rank: number; value: number } | null;
  wagered: { rank: number; value: number } | null;
  profit: { rank: number; value: number } | null;
}

interface LeaderboardState {
  snapshot: LeaderboardSnapshot | null;
  ownRanks: OwnRanks | null;
  activeTab: 'balance' | 'wagered' | 'profit';
  setSnapshot: (snapshot: LeaderboardSnapshot) => void;
  setOwnRanks: (ownRanks: OwnRanks | null) => void;
  setActiveTab: (tab: 'balance' | 'wagered' | 'profit') => void;
}

export const useLeaderboardStore = create<LeaderboardState>()((set) => ({
  snapshot: null,
  ownRanks: null,
  activeTab: 'balance',
  setSnapshot: (snapshot) => set({ snapshot }),
  setOwnRanks: (ownRanks) => set({ ownRanks }),
  setActiveTab: (activeTab) => set({ activeTab }),
}));
