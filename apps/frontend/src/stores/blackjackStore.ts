import { create } from 'zustand';

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
export interface Card { suit: Suit; rank: Rank; }

export type BJGamePhase = 'betting' | 'player_turn' | 'dealer_turn' | 'settled';
export type BJOutcome = 'player_blackjack' | 'player_bust' | 'dealer_bust' | 'player_win' | 'dealer_win' | 'push' | null;

interface BlackjackState {
  betAmount: number;
  gamePhase: BJGamePhase;
  sessionId: number | null;
  playerHand: Card[];
  dealerUpCard: Card | null;      // visible dealer card
  dealerHand: Card[] | null;      // full dealer hand revealed after dealer turn
  playerValue: number;
  dealerValue: number | null;
  outcome: BJOutcome;
  isMuted: boolean;
  // Actions
  setBetAmount: (n: number) => void;
  halfBet: () => void;
  doubleBet: () => void;
  dealHand: (sessionId: number, playerHand: Card[], dealerUpCard: Card, playerValue: number) => void;
  settleImmediate: (outcome: BJOutcome, newBalance: number, playerHand: Card[], dealerHand: Card[]) => void;
  addPlayerCard: (card: Card, playerValue: number) => void;
  revealDealerHand: (dealerHand: Card[], dealerValue: number, outcome: BJOutcome) => void;
  resetToConfig: () => void;
  toggleMute: () => void;
}

export const useBlackjackStore = create<BlackjackState>()((set) => ({
  betAmount: Number(localStorage.getItem('lastBet_blackjack')) || 10,
  gamePhase: 'betting',
  sessionId: null,
  playerHand: [],
  dealerUpCard: null,
  dealerHand: null,
  playerValue: 0,
  dealerValue: null,
  outcome: null,
  isMuted: localStorage.getItem('isMuted_blackjack') === 'true',

  setBetAmount: (n) => set({ betAmount: Math.max(1, n) }),
  halfBet: () => set((s) => ({ betAmount: Math.max(1, Math.floor(s.betAmount / 2)) })),
  doubleBet: () => set((s) => ({ betAmount: s.betAmount * 2 })),
  dealHand: (sessionId, playerHand, dealerUpCard, playerValue) =>
    set({ gamePhase: 'player_turn', sessionId, playerHand, dealerUpCard, dealerHand: null, playerValue, dealerValue: null, outcome: null }),
  settleImmediate: (outcome, _newBalance, playerHand, dealerHand) =>
    set({ gamePhase: 'settled', outcome, playerHand, dealerHand, playerValue: 21 }),  // blackjack always 21
  addPlayerCard: (card, playerValue) =>
    set((s) => ({ playerHand: [...s.playerHand, card], playerValue })),
  revealDealerHand: (dealerHand, dealerValue, outcome) =>
    set({ gamePhase: 'settled', dealerHand, dealerValue, outcome }),
  resetToConfig: () =>
    set({ gamePhase: 'betting', sessionId: null, playerHand: [], dealerUpCard: null, dealerHand: null, playerValue: 0, dealerValue: null, outcome: null }),
  toggleMute: () => set((s) => {
    const next = !s.isMuted;
    localStorage.setItem('isMuted_blackjack', String(next));
    return { isMuted: next };
  }),
}));
