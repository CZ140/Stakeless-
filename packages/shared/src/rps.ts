// Rock-Paper-Scissors — a single instant-settle round against the house. The
// player picks rock/paper/scissors; the house throws UNIFORMLY at random. Shared
// by the backend (settlement) and frontend (payout readout). The crypto RNG
// (throwRps) lives backend-only in services/rpsService.ts.
//
// Fairness note: because the house throws uniformly (⅓ each), the player's pick
// has NO effect on the odds — win / tie / loss are each exactly ⅓ regardless of
// what they choose (like betting red/black in roulette). The pick is for
// engagement, not edge; any non-uniform house would be exploitable.
//
// Payout: a tie is a PUSH (stake returned, 1.0×) and a win pays W×, so the
// expected return is EV = (W + 1 + 0) / 3. Setting EV = RTP (0.97) gives
//   W = 3·RTP − 1 = 1.91×
// i.e. the platform's standard 97% RTP (3% house edge), matching Coinflip/Dice.

export type RpsChoice = 'rock' | 'paper' | 'scissors';
export type RpsOutcome = 'win' | 'tie' | 'loss';

export const RPS = {
  RTP: 0.97, // 97% return-to-player (3% house edge)
  WIN_CHANCE: 1 / 3,
  TIE_CHANCE: 1 / 3,
} as const;

export const RPS_CHOICES: RpsChoice[] = ['rock', 'paper', 'scissors'];

// What each throw beats (rock→scissors, paper→rock, scissors→paper).
const BEATS: Record<RpsChoice, RpsChoice> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

export function isRpsChoice(v: unknown): v is RpsChoice {
  return v === 'rock' || v === 'paper' || v === 'scissors';
}

// Does throw `a` beat throw `b`?
export function rpsBeats(a: RpsChoice, b: RpsChoice): boolean {
  return BEATS[a] === b;
}

// Resolve a round from the player's perspective.
export function rpsOutcome(player: RpsChoice, house: RpsChoice): RpsOutcome {
  if (player === house) return 'tie';
  return rpsBeats(player, house) ? 'win' : 'loss';
}

// Payout multiplier for a winning throw (house edge applied): W = 3·RTP − 1.
export function rpsWinMultiplier(): number {
  return Math.round((3 * RPS.RTP - 1) * 100) / 100; // 1.91
}

// Gross return per unit staked for an outcome: win → 1.91×, tie → 1× (push,
// stake returned), loss → 0×.
export function rpsPayoutMultiplier(outcome: RpsOutcome): number {
  if (outcome === 'win') return rpsWinMultiplier();
  if (outcome === 'tie') return 1;
  return 0;
}
