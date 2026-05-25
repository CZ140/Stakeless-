// Coin Flip — a single fair 50/50 toss. The player calls heads or tails; a win
// pays the fair multiplier reduced by the house edge. Shared by the backend
// (settlement) and frontend (live multiplier readout) so the payout is computed
// identically on both sides. The crypto RNG (flipCoin) lives backend-only in
// services/coinflipService.ts.
//
// With a fair coin the win chance is exactly 1/2, so the house-edge-adjusted
// payout is RTP / 0.5 = 1.94×, giving RTP = 0.5 × 1.94 = 0.97 — the platform's
// standard 97% (3% house edge), matching Dice/Mines/Plinko.

export type CoinSide = 'heads' | 'tails';

export const COINFLIP = {
  RTP: 0.97, // 97% return-to-player (3% house edge)
  WIN_CHANCE: 0.5, // fair coin
} as const;

// Payout multiplier (2-dp) for a winning call, house edge already applied. A win
// pays floor(bet * multiplier); the same for heads or tails (the coin is fair).
export function coinflipMultiplier(): number {
  return Math.round((COINFLIP.RTP / COINFLIP.WIN_CHANCE) * 100) / 100; // 1.94
}
