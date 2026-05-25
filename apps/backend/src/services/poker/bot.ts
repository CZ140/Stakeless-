// Bot decision policy for No-Limit Hold'em. A single pure function so it is
// testable and swappable: given a bot's hole cards, the board, its legal actions
// and a little context, return an action. v1 is a tight-aggressive heuristic —
// hand-strength estimate vs pot odds, with bounded randomness. Not a pro, but it
// folds junk, calls reasonable hands, and raises strong ones.
import { evaluateHand, HAND_CATEGORY, type Card, type PokerAction, type LegalActions } from '@gambling/shared';

export interface BotView {
  holeCards: Card[];
  board: Card[];
  legal: LegalActions;
  pot: number; // total pot before this action
  toCall: number; // chips to call (0 if can check)
  currentBet: number; // highest committed this street
  committedThisStreet: number;
  bigBlind: number;
  stack: number;
}

// 0..1 estimate of how good the bot's hand is right now.
export function handStrength(holeCards: Card[], board: Card[], rng: () => number = Math.random): number {
  const noise = (rng() - 0.5) * 0.08; // ±0.04 jitter so bots aren't identical
  if (board.length === 0) return clamp(preflopStrength(holeCards) + noise);

  const made = evaluateHand([...holeCards, ...board]).category;
  const base = [
    0.16, // high card
    0.42, // pair
    0.62, // two pair
    0.74, // trips
    0.82, // straight
    0.88, // flush
    0.94, // full house
    0.98, // quads
    1.0, // straight flush
  ][made] ?? 0.2;
  return clamp(base + noise);
}

// Rough preflop value from two hole cards (Chen-ish, normalized to ~0..1).
function preflopStrength(hole: Card[]): number {
  if (hole.length < 2) return 0.2;
  const [a, b] = [hole[0]!, hole[1]!];
  const hi = Math.max(a.rank, b.rank);
  const lo = Math.min(a.rank, b.rank);
  const pair = a.rank === b.rank;
  const suited = a.suit === b.suit;
  const gap = hi - lo;

  if (pair) return clamp(0.5 + (a.rank - 2) / 24); // 22≈0.5 … AA≈1.0
  let s = (hi + lo) / 40; // high-card weight
  if (suited) s += 0.08;
  if (gap === 1) s += 0.06; // connectors
  else if (gap === 2) s += 0.03;
  if (hi === 14) s += 0.06; // ace
  return clamp(s);
}

function clamp(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function decideBotAction(view: BotView, rng: () => number = Math.random): PokerAction {
  const { legal, holeCards, board, pot, toCall, currentBet, bigBlind } = view;
  const s = handStrength(holeCards, board, rng);
  const r = rng();

  // Helper: a legal "raise to" total sized to a fraction of the pot.
  const raiseTo = (fracOfPot: number): number => {
    const target = currentBet + Math.max(bigBlind, Math.round((pot + toCall) * fracOfPot));
    return Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, target));
  };

  if (toCall === 0) {
    // Nobody has bet — check or take the initiative.
    if (legal.canRaise && s > 0.72 && r < 0.75) return { type: 'raise', amount: raiseTo(0.6) };
    if (legal.canRaise && s > 0.5 && r < 0.3) return { type: 'raise', amount: raiseTo(0.45) };
    return { type: 'check' };
  }

  // Facing a bet.
  const potOdds = toCall / (pot + toCall);
  if (legal.canRaise && s > 0.86 && r < 0.65) return { type: 'raise', amount: raiseTo(0.8) };
  if (s > potOdds + 0.12) return { type: 'call' };
  if (s > 0.5 && r < 0.25 && legal.canCall) return { type: 'call' }; // occasional float
  if (legal.canCheck) return { type: 'check' };
  return { type: 'fold' };
}

// A small pool of bot display names.
export const BOT_NAMES = [
  'Ada', 'Rex', 'Nova', 'Cosmo', 'Jinx', 'Echo', 'Vega', 'Pixel', 'Zara', 'Bolt',
];
