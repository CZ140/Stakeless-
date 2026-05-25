// Shared TypeScript types for @gambling/shared

// Tier progression — table + helpers shared by backend (persistence, rewards,
// daily bonus) and frontend (badges, profile ladder). Named re-exports document
// the public API. NOTE: this package needs "type": "module" in package.json —
// without it Node treats these files as CommonJS and `import { TIERS }` fails to
// bind statically (only dynamic import would see the names).
export {
  TIERS,
  tierLevelForWagered,
  tierForWagered,
  tierByLevel,
  nextTier,
} from './tiers.js';
export type { Tier } from './tiers.js';

// Slots — 3×3 grid, 5 paylines. Paytable, RNG-to-symbol mapping, and line
// evaluation shared by backend (settlement) and frontend (paytable + win
// highlighting). See slots.ts for the model and the exact-RTP derivation.
export {
  SLOTS,
  SLOT_SYMBOLS,
  SLOT_TOTAL_WEIGHT,
  PAYLINES,
  slotSymbolById,
  symbolForRoll,
  evaluateLine,
  resolveSlots,
  slotsRtp,
} from './slots.js';
export type { SlotSymbolId, SlotSymbol, SlotGrid, SlotCell, SlotLineWin, SlotResult } from './slots.js';

// Crash — rising-multiplier game. Curve math (time↔multiplier), the crash-point
// distribution, and cash-out rules shared by backend (settlement + scheduling)
// and frontend (live curve). See crash.ts for the model and the RTP derivation.
export {
  CRASH,
  crashMultiplierAt,
  crashTimeToReachMs,
  crashPointFromUniform,
  crashCashoutWins,
  isValidAutoCashout,
} from './crash.js';

// Coin Flip — a single fair 50/50 toss. Multiplier math shared by the backend
// (settlement) and frontend (live readout). The crypto RNG (flipCoin) lives
// backend-only in services/coinflipService.ts. See coinflip.ts for the RTP math.
export { COINFLIP, coinflipMultiplier } from './coinflip.js';
export type { CoinSide } from './coinflip.js';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

// Game types (stubs for future phases)
export type GameType = 'roulette' | 'plinko' | 'mines' | 'blackjack' | 'dice' | 'slots' | 'crash' | 'flip';

// ─── Dice ─────────────────────────────────────────────────────────────────────
// Pure dice math shared by the backend (settlement) and frontend (live readout)
// so multiplier/odds are computed identically on both sides. The crypto RNG
// (rollDice) lives backend-only in services/diceService.ts.
//
// A roll is a value 0.00–99.99 at two-decimal precision (RESOLUTION = 10000
// discrete outcomes). The player picks a `target` and a direction:
//   • 'under' wins when roll <  target   → winning outcomes = round(target*100)
//   • 'over'  wins when roll >= target   → winning outcomes = RESOLUTION − that
// The two directions are exactly complementary (no dead "push" outcome), so the
// house edge comes solely from the RTP factor on the payout, not the comparison.
export type DiceDirection = 'under' | 'over';

export const DICE = {
  RTP: 0.97, // 97% return-to-player (3% house edge) — matches Mines/Plinko
  RESOLUTION: 10_000,
  MIN_WIN_CHANCE: 0.02, // 2%  → ~48.5× max payout
  MAX_WIN_CHANCE: 0.95, // 95% → ~1.02× min payout (a win always pays > 1×)
} as const;

// Fraction (0..1) of outcomes that win for a given target + direction.
export function diceWinChance(target: number, direction: DiceDirection): number {
  const tt = Math.round(target * 100);
  const wins = direction === 'under' ? tt : DICE.RESOLUTION - tt;
  return wins / DICE.RESOLUTION;
}

// Payout multiplier (2-dp) for a target + direction, including the house edge.
export function diceMultiplier(target: number, direction: DiceDirection): number {
  const wc = diceWinChance(target, direction);
  if (wc <= 0) return 0;
  return Math.round((DICE.RTP / wc) * 100) / 100;
}

export function diceWinChanceValid(winChance: number): boolean {
  return winChance >= DICE.MIN_WIN_CHANCE - 1e-9 && winChance <= DICE.MAX_WIN_CHANCE + 1e-9;
}

// Target slider bounds (2-dp values) that keep the win chance within range for
// the given direction — used to clamp the UI slider.
export function diceTargetBounds(direction: DiceDirection): { min: number; max: number } {
  // under: winChance = target/100 ; over: winChance = 1 − target/100
  return direction === 'under'
    ? { min: DICE.MIN_WIN_CHANCE * 100, max: DICE.MAX_WIN_CHANCE * 100 } // 2 … 95
    : { min: (1 - DICE.MAX_WIN_CHANCE) * 100, max: (1 - DICE.MIN_WIN_CHANCE) * 100 }; // 5 … 98
}

// Wallet / Game types (Phase 3+)
export interface BetRequest {
  betAmount: number;
  gameType?: string;
}

export interface BetResponse {
  outcome: 'win' | 'loss';
  profit: number;
  newBalance: number;
}
