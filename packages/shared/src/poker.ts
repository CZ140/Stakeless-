// Poker — No-Limit Texas Hold'em engine primitives. PURE and RNG-free: the deck
// shuffle (crypto) and the authoritative table state machine live backend-only
// (services/poker). This module is the single source of truth for the pieces the
// backend (settlement) and frontend (display/validation) must agree on:
//   • cards + deck
//   • the 7-card hand evaluator (a single comparable integer score)
//   • betting math (legal actions, no-limit min-raise)
//   • side-pot construction + showdown award
// Everything here is deterministic and exhaustively unit-tested.
import type { SocialUser } from './social.js';

// ─── Cards ──────────────────────────────────────────────────────────────────
// Suit 0..3 = clubs ♣, diamonds ♦, hearts ♥, spades ♠ (suit is irrelevant to
// hand value beyond flush detection). Rank 2..14 (J=11, Q=12, K=13, A=14).
export type Suit = 0 | 1 | 2 | 3;
export interface Card {
  rank: number; // 2..14
  suit: Suit;
}

export const SUIT_CHARS = ['c', 'd', 'h', 's'] as const;
const RANK_CHARS: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};
const CHAR_RANK: Record<string, number> = Object.fromEntries(
  Object.entries(RANK_CHARS).map(([r, c]) => [c, Number(r)]),
);

export function cardToString(c: Card): string {
  return `${RANK_CHARS[c.rank]}${SUIT_CHARS[c.suit]}`;
}

export function cardFromString(s: string): Card {
  const rank = CHAR_RANK[s[0]!.toUpperCase()];
  const suit = SUIT_CHARS.indexOf(s[1]!.toLowerCase() as (typeof SUIT_CHARS)[number]) as Suit;
  if (rank === undefined || suit < 0) throw new Error(`Invalid card: ${s}`);
  return { rank, suit };
}

// A fresh, ordered 52-card deck (NOT shuffled — shuffling is the backend's job).
export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (let suit = 0 as Suit; suit < 4; suit = (suit + 1) as Suit) {
    for (let rank = 2; rank <= 14; rank++) deck.push({ rank, suit });
  }
  return deck;
}

// ─── Hand evaluation ──────────────────────────────────────────────────────────
export const HAND_CATEGORY = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
} as const;

const CATEGORY_NAMES = [
  'High Card',
  'Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
];

export function handCategoryName(category: number): string {
  return CATEGORY_NAMES[category] ?? 'Unknown';
}

export interface RankedHand {
  score: number; // single comparable integer — higher is better
  category: number;
}

// Encode a category + ordered tiebreaker ranks into one comparable integer.
// Base-15 with 5 tiebreaker slots (ranks ≤ 14 < 15); category dominates.
function encode(category: number, tiebreakers: number[]): number {
  let score = category;
  for (let i = 0; i < 5; i++) {
    score = score * 15 + (tiebreakers[i] ?? 0);
  }
  return score;
}

// Detect a straight in 5 distinct ranks; returns the straight's high card (5 for
// the wheel A-2-3-4-5) or 0 if not a straight.
function straightHigh(distinctDesc: number[]): number {
  if (distinctDesc.length !== 5) return 0;
  // Wheel: A,5,4,3,2 → treat as 5-high.
  if (distinctDesc[0] === 14 && distinctDesc[1] === 5 && distinctDesc[2] === 4 && distinctDesc[3] === 3 && distinctDesc[4] === 2) {
    return 5;
  }
  for (let i = 0; i < 4; i++) {
    if (distinctDesc[i]! - 1 !== distinctDesc[i + 1]!) return 0;
  }
  return distinctDesc[0]!;
}

// Rank exactly 5 cards.
export function rank5(cards: Card[]): RankedHand {
  if (cards.length !== 5) throw new Error('rank5 needs exactly 5 cards');
  const isFlush = cards.every((c) => c.suit === cards[0]!.suit);

  // Count by rank, then order [rank,count] by (count desc, rank desc).
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  const byCount = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const countShape = byCount.map((e) => e[1]); // e.g. [3,2] full house
  const rankOrder = byCount.map((e) => e[0]); // tiebreakers for non-straights

  const distinctDesc = [...counts.keys()].sort((a, b) => b - a);
  const sHigh = straightHigh(distinctDesc);

  if (isFlush && sHigh) return { score: encode(HAND_CATEGORY.STRAIGHT_FLUSH, [sHigh]), category: HAND_CATEGORY.STRAIGHT_FLUSH };
  if (countShape[0] === 4) return { score: encode(HAND_CATEGORY.QUADS, rankOrder), category: HAND_CATEGORY.QUADS };
  if (countShape[0] === 3 && countShape[1] === 2) return { score: encode(HAND_CATEGORY.FULL_HOUSE, rankOrder), category: HAND_CATEGORY.FULL_HOUSE };
  if (isFlush) return { score: encode(HAND_CATEGORY.FLUSH, distinctDesc), category: HAND_CATEGORY.FLUSH };
  if (sHigh) return { score: encode(HAND_CATEGORY.STRAIGHT, [sHigh]), category: HAND_CATEGORY.STRAIGHT };
  if (countShape[0] === 3) return { score: encode(HAND_CATEGORY.TRIPS, rankOrder), category: HAND_CATEGORY.TRIPS };
  if (countShape[0] === 2 && countShape[1] === 2) return { score: encode(HAND_CATEGORY.TWO_PAIR, rankOrder), category: HAND_CATEGORY.TWO_PAIR };
  if (countShape[0] === 2) return { score: encode(HAND_CATEGORY.PAIR, rankOrder), category: HAND_CATEGORY.PAIR };
  return { score: encode(HAND_CATEGORY.HIGH_CARD, distinctDesc), category: HAND_CATEGORY.HIGH_CARD };
}

// All 21 ways to exclude 2 of 7 cards (i.e. choose the best 5).
const EXCLUDE_PAIRS: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) out.push([i, j]);
  return out;
})();

// Best 5-card hand from 5..7 cards (Hold'em: 2 hole + 3..5 board).
export function evaluateHand(cards: Card[]): RankedHand {
  if (cards.length === 5) return rank5(cards);
  if (cards.length === 7) {
    let best: RankedHand | null = null;
    for (const [i, j] of EXCLUDE_PAIRS) {
      const five: Card[] = [];
      for (let k = 0; k < 7; k++) if (k !== i && k !== j) five.push(cards[k]!);
      const r = rank5(five);
      if (!best || r.score > best.score) best = r;
    }
    return best!;
  }
  // 6 cards (rare paths): choose best 5 of 6.
  if (cards.length === 6) {
    let best: RankedHand | null = null;
    for (let skip = 0; skip < 6; skip++) {
      const five = cards.filter((_, idx) => idx !== skip);
      const r = rank5(five);
      if (!best || r.score > best.score) best = r;
    }
    return best!;
  }
  throw new Error(`evaluateHand needs 5..7 cards, got ${cards.length}`);
}

// Compare two hands (each 5..7 cards). -1 if a<b, 0 tie, 1 if a>b.
export function compareHands(a: Card[], b: Card[]): -1 | 0 | 1 {
  const sa = evaluateHand(a).score;
  const sb = evaluateHand(b).score;
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

// ─── Betting math ──────────────────────────────────────────────────────────────
export type PokerActionType = 'fold' | 'check' | 'call' | 'raise';
export interface PokerAction {
  type: PokerActionType;
  // For 'raise': the TOTAL amount committed this street (no-limit "raise to").
  amount?: number;
}

// Minimal slice of table state needed to compute one seat's legal actions.
export interface ActionContext {
  stack: number; // chips behind (not yet committed this street)
  currentBet: number; // highest committed-this-street across active seats
  committedThisStreet: number; // what this seat has already put in this street
  minRaise: number; // size of the last full raise (≥ bigBlind)
  bigBlind: number;
}

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number; // chips needed to call (capped at stack → all-in call)
  canRaise: boolean;
  minRaiseTo: number; // smallest legal "raise to" total this street
  maxRaiseTo: number; // all-in "raise to" total this street
}

// No-Limit legal actions. Amounts for raises are "raise TO" totals (the standard
// no-limit convention) measured as total committed this street by this seat.
export function legalActions(ctx: ActionContext): LegalActions {
  const toCall = Math.max(0, ctx.currentBet - ctx.committedThisStreet);
  const callAmount = Math.min(toCall, ctx.stack);
  const canCheck = toCall === 0;
  const canCall = toCall > 0 && ctx.stack > 0;

  // A raise requires chips beyond merely calling.
  const maxRaiseTo = ctx.committedThisStreet + ctx.stack; // shove
  const fullRaiseTo = ctx.currentBet + Math.max(ctx.minRaise, ctx.bigBlind);
  const canRaise = ctx.stack > toCall && maxRaiseTo > ctx.currentBet;
  // If a full raise isn't affordable you may still shove (a short all-in raise).
  const minRaiseTo = Math.min(fullRaiseTo, maxRaiseTo);

  return {
    canFold: true,
    canCheck,
    canCall,
    callAmount,
    canRaise,
    minRaiseTo,
    maxRaiseTo,
  };
}

// ─── Side pots + showdown award ─────────────────────────────────────────────────
export interface SeatContribution {
  seat: number; // seat index
  committed: number; // total chips this seat put in the hand
  folded: boolean;
}

export interface Pot {
  amount: number;
  eligibleSeats: number[]; // seats that can win this pot (non-folded contributors)
}

// Build main + side pots from each seat's total contribution this hand. Folded
// seats' chips still fund the pots but those seats are not eligible to win.
// Consecutive layers with the same eligible set are merged.
export function buildPots(contributions: SeatContribution[]): Pot[] {
  const levels = [...new Set(contributions.filter((c) => c.committed > 0).map((c) => c.committed))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    const layer = level - prev;
    let amount = 0;
    const eligible: number[] = [];
    for (const c of contributions) {
      if (c.committed >= level) {
        amount += layer; // every seat that reached this level contributes one layer
        if (!c.folded) eligible.push(c.seat);
      }
    }
    if (amount > 0) {
      const last = pots[pots.length - 1];
      if (last && sameSet(last.eligibleSeats, eligible)) {
        last.amount += amount; // merge equal-eligibility layers
      } else {
        pots.push({ amount, eligibleSeats: eligible });
      }
    }
    prev = level;
  }
  return pots;
}

function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

// Award pots to the best eligible hand(s). `scores` maps seat → comparable hand
// score (from evaluateHand). Ties split equally; any odd remainder chip(s) go to
// the earliest eligible seat in `oddChipOrder` (seats left of the button first).
// Returns seat → total chips won.
export function awardPots(
  pots: Pot[],
  scores: Map<number, number>,
  oddChipOrder?: number[],
): Map<number, number> {
  const winnings = new Map<number, number>();
  const add = (seat: number, n: number) => winnings.set(seat, (winnings.get(seat) ?? 0) + n);

  for (const pot of pots) {
    const contenders = pot.eligibleSeats.filter((s) => scores.has(s));
    if (contenders.length === 0) continue;
    let best = -Infinity;
    for (const s of contenders) best = Math.max(best, scores.get(s)!);
    const winners = contenders.filter((s) => scores.get(s) === best);

    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;
    for (const s of winners) add(s, share);

    // Distribute odd chips one at a time by the requested order.
    if (remainder > 0) {
      const order = (oddChipOrder ?? winners).filter((s) => winners.includes(s));
      const ring = order.length > 0 ? order : winners;
      let i = 0;
      while (remainder > 0) {
        add(ring[i % ring.length]!, 1);
        remainder--;
        i++;
      }
    }
  }
  return winnings;
}

// ─── Shared DTOs (table view exchanged with the client) ──────────────────────────
export type SeatStatus = 'empty' | 'active' | 'folded' | 'allin' | 'sittingOut' | 'leaving';
export type Street = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface PublicSeat {
  seatIndex: number;
  userId: number | null; // null = empty seat
  username: string | null;
  avatarColor: string | null;
  isBot: boolean;
  stack: number;
  committedThisStreet: number;
  status: SeatStatus;
  // Hole cards are only present at showdown for seats that reached it (revealed).
  revealedCards?: Card[];
}

export interface PublicTableState {
  id: number;
  name: string;
  smallBlind: number;
  bigBlind: number;
  maxSeats: number;
  seats: PublicSeat[];
  board: Card[];
  pots: { amount: number }[];
  totalPot: number;
  buttonIndex: number;
  street: Street;
  actingSeat: number | null; // seat index whose turn it is, or null
  actionDeadline: number | null; // epoch ms the acting seat must act by
  handNumber: number;
  currentBet: number; // highest committed-this-street (for the client's bet slider)
  minRaise: number; // size of the last full raise (≥ big blind)
}

export interface PrivateHand {
  seatIndex: number;
  holeCards: Card[];
}

// The outcome of one finished hand — emitted to the table for display.
export interface PokerHandResultSeat {
  seatIndex: number;
  userId: number;
  username: string;
  won: number; // chips won from the pot(s)
  net: number; // won minus chips put in this hand
  committed: number;
  holeCards: Card[] | null; // revealed only at showdown for non-folded seats
  handName?: string; // e.g. "Two Pair" (shown hands only)
  folded: boolean;
}

export interface PokerHandResult {
  handNumber: number;
  board: Card[];
  potTotal: number;
  showdown: boolean; // false when everyone folded to one player
  seats: PokerHandResultSeat[];
  winners: number[]; // seat indexes that won chips
}

// A friend's "come join this table" invite — pushed live to the invitee.
export interface PokerInvite {
  tableId: number;
  tableName: string;
  inviter: SocialUser;
}

// Lobby row — one available/joinable table.
export interface PokerTableSummary {
  id: number;
  name: string;
  type: 'public' | 'private';
  smallBlind: number;
  bigBlind: number;
  maxSeats: number;
  minBuyIn: number;
  maxBuyIn: number;
  seatedHumans: number; // humans currently seated
  botCount: number; // bots filling seats
  handInProgress: boolean;
  iAmSeated: boolean;
  groupId: number | null;
}

export const POKER = {
  MAX_SEATS: 6,
  TURN_MS: 20_000,
  MIN_BUYIN_BB: 40, // min buy-in = 40 big blinds
  MAX_BUYIN_BB: 100, // max buy-in = 100 big blinds
} as const;

// Preset stake levels offered in the lobby.
export const POKER_STAKES = [
  { id: 'micro', label: 'Micro', smallBlind: 5, bigBlind: 10 },
  { id: 'low', label: 'Low', smallBlind: 25, bigBlind: 50 },
  { id: 'high', label: 'High', smallBlind: 100, bigBlind: 200 },
] as const;

export type PokerStakeId = (typeof POKER_STAKES)[number]['id'];
