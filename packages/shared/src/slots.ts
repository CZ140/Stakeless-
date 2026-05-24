// ─── Slots (3×3 grid, 5 paylines) ───────────────────────────────────────────────
// Pure slot math shared by the backend (settlement) and the frontend (paytable
// display + win highlighting) so payouts/odds are computed identically on both
// sides. The crypto RNG that fills the grid lives backend-only in
// services/slotsService.ts; this module only maps a roll to a symbol and
// evaluates a finished grid.
//
// MODEL: each of the 9 cells is an INDEPENDENT weighted draw (not a shared reel
// strip). With independent cells, expected return is linear across the paylines,
// so the house edge is an exact closed form (see slotsRtp): a player can't tell
// the difference from a strip machine, but the RTP is trivially tunable. The
// paytable below is tuned to ~97% RTP — matching Dice/Plinko/Mines.
//
// A line wins on the best of: three-of-a-kind, else leftmost-two-of-a-kind (only
// for the low symbols, whose pay2 > 0). The total bet is split evenly across the
// 5 lines, so a winning line pays floor(totalBet / 5 * multiplier).

export type SlotSymbolId = 'cherry' | 'lemon' | 'bell' | 'star' | 'seven' | 'diamond';

export interface SlotSymbol {
  id: SlotSymbolId;
  /** Relative frequency on every cell. Weights sum to SLOT_TOTAL_WEIGHT (100). */
  weight: number;
  /** Per-line multiplier for leftmost two-of-a-kind (0 = this symbol pays only on 3). */
  pay2: number;
  /** Per-line multiplier for three-of-a-kind. */
  pay3: number;
}

export const SLOTS = {
  RTP: 0.97, // 97% return-to-player (documented target; slotsRtp() is the exact figure)
  REELS: 3,
  ROWS: 3,
  LINES: 5,
} as const;

// High weight = common = low value. Tuned so slotsRtp() ≈ 0.9706.
export const SLOT_SYMBOLS: readonly SlotSymbol[] = [
  { id: 'cherry', weight: 30, pay2: 1.5, pay3: 6 },
  { id: 'lemon', weight: 24, pay2: 2, pay3: 9 },
  { id: 'bell', weight: 20, pay2: 4.5, pay3: 18 },
  { id: 'star', weight: 14, pay2: 0, pay3: 44 },
  { id: 'seven', weight: 8, pay2: 0, pay3: 120 },
  { id: 'diamond', weight: 4, pay2: 0, pay3: 500 },
];

export const SLOT_TOTAL_WEIGHT = SLOT_SYMBOLS.reduce((sum, s) => sum + s.weight, 0); // 100

// A grid is column-major: grid[reel][row], reel 0..2 (left→right), row 0..2 (top→bottom).
export type SlotGrid = SlotSymbolId[][];

/** A cell coordinate as [reel, row]. */
export type SlotCell = readonly [number, number];

// The five paying lines over the 3×3 window: three rows + the two diagonals.
export const PAYLINES: readonly { id: number; name: string; cells: readonly SlotCell[] }[] = [
  { id: 0, name: 'Top row', cells: [[0, 0], [1, 0], [2, 0]] },
  { id: 1, name: 'Middle row', cells: [[0, 1], [1, 1], [2, 1]] },
  { id: 2, name: 'Bottom row', cells: [[0, 2], [1, 2], [2, 2]] },
  { id: 3, name: 'Diagonal ↘', cells: [[0, 0], [1, 1], [2, 2]] },
  { id: 4, name: 'Diagonal ↗', cells: [[0, 2], [1, 1], [2, 0]] },
];

export function slotSymbolById(id: SlotSymbolId): SlotSymbol {
  // every id is present in SLOT_SYMBOLS; the assertion documents that invariant
  return SLOT_SYMBOLS.find((s) => s.id === id)!;
}

// Map a roll in [0, SLOT_TOTAL_WEIGHT) to a symbol id by walking the weight bands.
// The backend supplies the roll from crypto.randomInt so the mapping stays shared.
export function symbolForRoll(roll: number): SlotSymbolId {
  let acc = 0;
  for (const s of SLOT_SYMBOLS) {
    acc += s.weight;
    if (roll < acc) return s.id;
  }
  return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1]!.id; // float guard — unreachable for valid rolls
}

export interface SlotLineWin {
  line: number; // payline id
  symbol: SlotSymbolId;
  count: 2 | 3; // matching symbols from the left
  multiplier: number; // per-line multiplier applied
  payout: number; // gross coins paid for this line
}

// Evaluate one payline left-to-right. Returns the matched symbol + per-line
// multiplier, or null when the line doesn't pay. Three-of-a-kind beats a
// leftmost pair; a pair pays only for symbols with pay2 > 0.
export function evaluateLine(
  a: SlotSymbolId,
  b: SlotSymbolId,
  c: SlotSymbolId,
): { symbol: SlotSymbolId; count: 2 | 3; multiplier: number } | null {
  if (a === b && b === c) {
    return { symbol: a, count: 3, multiplier: slotSymbolById(a).pay3 };
  }
  if (a === b) {
    const m = slotSymbolById(a).pay2;
    if (m > 0) return { symbol: a, count: 2, multiplier: m };
  }
  return null;
}

export interface SlotResult {
  lines: SlotLineWin[];
  totalPayout: number; // gross coins (the stake was already deducted by the caller)
  win: boolean;
}

// Resolve a finished grid against a total bet split evenly across the 5 lines.
// Each winning line pays floor(totalBet / LINES * multiplier); lines that floor
// to 0 (only possible on tiny bets) are dropped so a "win" always pays coins.
export function resolveSlots(grid: SlotGrid, totalBet: number): SlotResult {
  const lines: SlotLineWin[] = [];
  let totalPayout = 0;
  for (const pl of PAYLINES) {
    const [a, b, c] = pl.cells.map(([reel, row]) => grid[reel]![row]!) as [
      SlotSymbolId,
      SlotSymbolId,
      SlotSymbolId,
    ];
    const res = evaluateLine(a, b, c);
    if (!res) continue;
    const payout = Math.floor((totalBet * res.multiplier) / SLOTS.LINES);
    if (payout <= 0) continue;
    lines.push({ line: pl.id, symbol: res.symbol, count: res.count, multiplier: res.multiplier, payout });
    totalPayout += payout;
  }
  return { lines, totalPayout, win: totalPayout > 0 };
}

// Exact theoretical RTP from the paytable (independent-cell model). By linearity
// of expectation the five lines contribute equally, so the per-line return is the
// whole RTP. Used by tests/docs; never on a hot path.
export function slotsRtp(): number {
  let rtp = 0;
  for (const s of SLOT_SYMBOLS) {
    const p = s.weight / SLOT_TOTAL_WEIGHT;
    rtp += p * p * p * s.pay3; // three-of-a-kind
    rtp += p * p * (1 - p) * s.pay2; // exactly leftmost-two
  }
  return rtp;
}
