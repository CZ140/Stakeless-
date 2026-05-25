import { randomInt } from 'node:crypto';
import { RPS_CHOICES, rpsOutcome, rpsPayoutMultiplier, type RpsChoice, type RpsOutcome } from '@gambling/shared';

// The house throws uniformly at random with a crypto-secure RNG, matching the
// rest of the platform (Roulette/Plinko/Mines/Dice/Coinflip all use randomInt).
export function throwRps(): RpsChoice {
  return RPS_CHOICES[randomInt(0, 3)]!;
}

export interface RpsResolved {
  outcome: RpsOutcome;
  multiplier: number; // gross return per unit staked: win 1.91×, tie 1×, loss 0×
}

// Resolve a round from the player's perspective against the house throw. The
// multiplier comes from the shared payout table (single source of truth).
export function resolveRps(house: RpsChoice, choice: RpsChoice): RpsResolved {
  const outcome = rpsOutcome(choice, house);
  return { outcome, multiplier: rpsPayoutMultiplier(outcome) };
}
