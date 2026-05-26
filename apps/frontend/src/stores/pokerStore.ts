import { create } from 'zustand';
import type { PublicTableState, PrivateHand, PokerHandResult, PokerTableSummary, PokerChatMessage, Card } from '@gambling/shared';

// Poker UI state: the lobby list, the open table's public state, my private hole
// cards, the most recent finished-hand result (shown briefly between hands), the
// table chat backlog, and the recent-hands history (most-recent-first).
interface PokerState {
  lobby: PokerTableSummary[];
  table: PublicTableState | null;
  myHole: Card[] | null; // my two hole cards (from poker:hand, private)
  mySeat: number | null;
  lastResult: PokerHandResult | null;
  chat: PokerChatMessage[];
  history: PokerHandResult[]; // most-recent-first

  setLobby: (lobby: PokerTableSummary[]) => void;
  setTable: (table: PublicTableState | null) => void;
  setHand: (hand: PrivateHand | null) => void;
  setResult: (result: PokerHandResult | null) => void;
  setChatHistory: (messages: PokerChatMessage[]) => void;
  addChatMessage: (message: PokerChatMessage) => void;
  setHandHistory: (hands: PokerHandResult[]) => void;
  addHandResult: (result: PokerHandResult) => void;
  reset: () => void;
}

export const usePokerStore = create<PokerState>()((set) => ({
  lobby: [],
  table: null,
  myHole: null,
  mySeat: null,
  lastResult: null,
  chat: [],
  history: [],

  setLobby: (lobby) => set({ lobby }),
  setTable: (table) => set({ table }),
  setHand: (hand) => set(hand ? { myHole: hand.holeCards, mySeat: hand.seatIndex } : { myHole: null, mySeat: null }),
  setResult: (lastResult) => set({ lastResult }),
  setChatHistory: (chat) => set({ chat }),
  addChatMessage: (message) =>
    set((s) => ({ chat: [...s.chat, message].slice(-50) })),
  setHandHistory: (history) => set({ history }),
  addHandResult: (result) =>
    set((s) =>
      // The freshly-finished hand is newest → prepend; dedupe the subscribe race.
      s.history[0]?.handNumber === result.handNumber
        ? s
        : { history: [result, ...s.history].slice(0, 30) },
    ),
  reset: () => set({ table: null, myHole: null, mySeat: null, lastResult: null, chat: [], history: [] }),
}));
