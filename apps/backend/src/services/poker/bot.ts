// Bot decision policy for No-Limit Hold'em. A single pure function so it is
// testable and swappable. Tight-aggressive: it estimates hand strength (made-hand
// quality blended with draw equity), tightens up multiway, value-raises strong
// holdings, semi-bluffs strong draws, and otherwise calls/folds on pot odds.
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
  activePlayers?: number; // players still in the hand incl. this bot (default 2)
}

// 0..1 estimate of how good the bot's hand is right now. Postflop it blends the
// made-hand quality with draw equity so the bot can call and semi-bluff with the
// right odds rather than treating every draw as junk.
export function handStrength(holeCards: Card[], board: Card[], rng: () => number = Math.random): number {
  const noise = (rng() - 0.5) * 0.08; // ±0.04 jitter so bots aren't identical
  if (board.length === 0) return clamp(preflopStrength(holeCards) + noise);

  const made = madeStrength(holeCards, board);
  const draw = drawStrength(holeCards, board);
  // A made hand and a live draw reinforce each other; take the better plus a touch.
  const combo = made > 0.2 && draw > 0.2 ? 0.05 : 0;
  return clamp(Math.max(made, draw) + combo + noise);
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

// ── Made-hand quality ─────────────────────────────────────────────────────────
// Per-category baselines, but pairs (by far the most common holding) are graded by
// texture — a flat 0.42 would play bottom pair like top-pair-top-kicker.
function madeStrength(holeCards: Card[], board: Card[]): number {
  const { category } = evaluateHand([...holeCards, ...board]);
  if (category === HAND_CATEGORY.PAIR) return pairStrength(holeCards, board);
  if (category === HAND_CATEGORY.HIGH_CARD) return highCardStrength(holeCards, board);
  return (
    [
      0.16, // high card  (handled above)
      0.0, //  pair        (handled above)
      0.62, // two pair
      0.75, // trips
      0.82, // straight
      0.88, // flush
      0.94, // full house
      0.98, // quads
      1.0, //  straight flush
    ][category] ?? 0.2
  );
}

// Grade a one-pair hand by where the pair sits relative to the board + its kicker.
function pairStrength(holeCards: Card[], board: Card[]): number {
  const counts = new Map<number, number>();
  for (const c of [...holeCards, ...board]) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  let pairRank = 0;
  for (const [r, n] of counts) if (n === 2 && r > pairRank) pairRank = r;

  const boardRanks = board.map((c) => c.rank);
  const maxBoard = Math.max(...boardRanks);
  const higher = boardRanks.filter((r) => r > pairRank).length; // board cards beating our pair
  const holeRanks = holeCards.map((c) => c.rank);
  const pocket = holeRanks.length === 2 && holeRanks[0] === holeRanks[1];

  if (pocket && holeRanks[0] === pairRank) {
    if (pairRank > maxBoard) return 0.6; // overpair
    return clamp(0.46 - 0.04 * higher); // underpair — weaker the more overcards
  }
  if (holeRanks.includes(pairRank)) {
    const kicker = holeRanks.find((r) => r !== pairRank) ?? 0;
    if (higher === 0) {
      const kbon = kicker === 14 ? 0.08 : kicker === 13 ? 0.05 : kicker === 12 ? 0.03 : 0;
      return clamp(0.5 + kbon); // top pair, kicker-adjusted
    }
    if (higher === 1) return 0.4; // second pair
    return 0.32; // third or lower pair
  }
  // Board is paired and we missed it — we're really just playing our overcards.
  const over = holeRanks.filter((r) => r > maxBoard).length;
  return clamp(0.26 + 0.03 * over);
}

// No pair: value is essentially how many overcards we hold (backdoor/showdown value).
function highCardStrength(holeCards: Card[], board: Card[]): number {
  const maxBoard = Math.max(...board.map((c) => c.rank));
  const over = holeCards.filter((c) => c.rank > maxBoard).length;
  return clamp(0.16 + 0.04 * over);
}

// ── Draw equity ───────────────────────────────────────────────────────────────
// Flush + straight outs → rough equity via the rule of 2-and-4. Only counts draws
// our hole cards actually participate in (not a draw that lives entirely on board).
function drawStrength(holeCards: Card[], board: Card[]): number {
  const cardsToCome = board.length === 3 ? 2 : board.length === 4 ? 1 : 0;
  if (cardsToCome === 0) return 0;
  const all = [...holeCards, ...board];

  // Flush draw: exactly 4 of a suit with at least one in our hand (5+ is a made flush).
  const suitCounts = [0, 0, 0, 0];
  for (const c of all) suitCounts[c.suit]!++;
  let flushOuts = 0;
  for (let su = 0; su < 4; su++) {
    if (suitCounts[su] === 4 && holeCards.some((c) => c.suit === su)) flushOuts = 9;
  }

  const straightOuts = straightCompleters(all.map((c) => c.rank), holeCards.map((c) => c.rank)) * 4;
  const outs = Math.min(12, flushOuts + straightOuts); // cap so combo draws stay bounded
  if (outs === 0) return 0;
  return cardsToCome === 2 ? Math.min(0.47, outs * 0.04) : Math.min(0.3, outs * 0.02);
}

// Count distinct ranks that complete a 5-card straight (1 = gutshot, 2 = open-ended),
// requiring a hole card to take part so a fully-board-based draw isn't credited to us.
function straightCompleters(allRanks: number[], holeRanks: number[]): number {
  const present = new Set(allRanks);
  const hole = new Set(holeRanks);
  const has = (r: number) => present.has(r) || (r === 1 && present.has(14)); // ace plays low
  const holeHas = (r: number) => hole.has(r) || (r === 1 && hole.has(14));
  const completers = new Set<number>();
  for (let start = 1; start <= 10; start++) {
    const window = [start, start + 1, start + 2, start + 3, start + 4];
    if (window.filter(has).length !== 4) continue; // need exactly 4 of 5 for a draw
    const missing = window.find((r) => !has(r))!;
    const holeInWindow = window.some((r) => has(r) && holeHas(r));
    if (holeInWindow) completers.add(missing === 1 ? 14 : missing);
  }
  return Math.min(2, completers.size);
}

function clamp(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function decideBotAction(view: BotView, rng: () => number = Math.random): PokerAction {
  const { legal, holeCards, board, pot, toCall, currentBet, bigBlind, stack } = view;
  const players = Math.max(2, view.activePlayers ?? 2);
  // Multiway: hands play worse against more opponents — discount the raw strength.
  const s = clamp(handStrength(holeCards, board, rng) - 0.04 * (players - 2));
  const draw = board.length ? drawStrength(holeCards, board) : 0;
  const r = rng();

  // A legal "raise to" total sized to a fraction of the pot.
  const raiseTo = (fracOfPot: number): number => {
    const target = currentBet + Math.max(bigBlind, Math.round((pot + toCall) * fracOfPot));
    return Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, target));
  };

  if (toCall === 0) {
    // Nobody has bet — bet for value, semi-bluff a strong draw, or check.
    if (legal.canRaise) {
      if (s > 0.72 && r < 0.8) return { type: 'raise', amount: raiseTo(0.6) };
      if (s > 0.5 && r < 0.3) return { type: 'raise', amount: raiseTo(0.45) };
      if (draw > 0.33 && r < 0.4) return { type: 'raise', amount: raiseTo(0.5) }; // semi-bluff
    }
    return { type: 'check' };
  }

  // Facing a bet.
  const potOdds = toCall / (pot + toCall);
  if (legal.canRaise) {
    if (s > 0.86 && r < 0.7) return { type: 'raise', amount: raiseTo(0.85) }; // value
    if (s > 0.78 && r < 0.35) return { type: 'raise', amount: raiseTo(0.7) }; // thinner value
    if (draw > 0.38 && toCall < stack * 0.5 && r < 0.3) return { type: 'raise', amount: raiseTo(0.8) }; // semi-bluff
  }
  if (s > potOdds + 0.05) return { type: 'call' }; // equity beats the price
  if (draw > potOdds + 0.02 && legal.canCall) return { type: 'call' }; // drawing with odds
  if (s > 0.5 && r < 0.2 && legal.canCall) return { type: 'call' }; // occasional float
  if (legal.canCheck) return { type: 'check' };
  return { type: 'fold' };
}

// A small pool of bot display names.
export const BOT_NAMES = [
  'Ada', 'Rex', 'Nova', 'Cosmo', 'Jinx', 'Echo', 'Vega', 'Pixel', 'Zara', 'Bolt',
];
