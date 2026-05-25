import { randomInt } from 'node:crypto';
import { coinflipMultiplier, type CoinSide } from '@gambling/shared';

// Flip a fair coin with a crypto-secure RNG, matching the rest of the platform
// (Roulette/Plinko/Mines/Dice all use crypto.randomInt).
export function flipCoin(): CoinSide {
  return randomInt(0, 2) === 0 ? 'heads' : 'tails';
}

export interface CoinflipOutcome {
  win: boolean;
  multiplier: number; // payout multiplier (2-dp), house edge already applied
}

// Resolve a flip against the player's call. The multiplier is the shared one
// (single source of truth), so a win pays floor(bet * multiplier).
export function resolveCoinflip(result: CoinSide, call: CoinSide): CoinflipOutcome {
  return { win: result === call, multiplier: coinflipMultiplier() };
}
