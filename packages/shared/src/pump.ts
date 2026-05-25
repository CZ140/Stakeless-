// Pump — a balloon cash-out ladder. Each "pump" inflates the balloon one step,
// compounding the payout multiplier; the player cashes out any time. A hidden
// pop hazard ends the round and loses the whole stake. Shared by the backend
// (settlement) and the frontend (live multiplier + pop odds). The crypto RNG
// (the hidden hazard layout) lives backend-only in services/pumpService.ts.
//
// Model (identical in spirit to Mines): the balloon has `segments` cells, `pops`
// of which are hazards, laid out by a crypto shuffle. Each pump reveals the next
// cell; a hazard pops the balloon. Surviving n pumps therefore has probability
//   P(survive n) = Π_{i=0}^{n-1} (safe - i) / (segments - i),   safe = segments - pops
// and the payout multiplier applies the house edge ONCE to the fair odds:
//   mult(n) = RTP / P(survive n).
// So the expected return when cashing out after ANY n ≥ 1 pumps is exactly the
// RTP (0.97) — the edge is fully front-loaded and each further pump is a fair
// (EV-neutral) gamble, matching the Mines/Towers-style ladder. Difficulty trades
// a steeper per-pump pop chance for faster multiplier growth and a higher ceiling.

export type PumpDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface PumpDifficultyConfig {
  id: PumpDifficulty;
  label: string;
  segments: number; // total cells in the balloon
  pops: number;     // hidden pop hazards among them (1 ≤ pops < segments)
}

export const PUMP = {
  RTP: 0.97, // 97% return-to-player (3% house edge) — matches the rest of the lineup
  MAX_MULTIPLIER: 1_000_000, // safety cap (no realistic difficulty approaches it)
} as const;

// Difficulties chosen so pop chance and ceiling both rise monotonically. With 12
// segments the first-pump pop chance is ≈ 8% / 17% / 33% / 50% and the ceiling
// (= C(segments, pops) × RTP) is ≈ 11.6× / 64× / 480× / 896×.
export const PUMP_DIFFICULTIES: Record<PumpDifficulty, PumpDifficultyConfig> = {
  easy:   { id: 'easy',   label: 'Easy',   segments: 12, pops: 1 },
  medium: { id: 'medium', label: 'Medium', segments: 12, pops: 2 },
  hard:   { id: 'hard',   label: 'Hard',   segments: 12, pops: 4 },
  expert: { id: 'expert', label: 'Expert', segments: 12, pops: 6 },
};

export const PUMP_DIFFICULTY_IDS: PumpDifficulty[] = ['easy', 'medium', 'hard', 'expert'];

export function isPumpDifficulty(v: unknown): v is PumpDifficulty {
  return typeof v === 'string' && v in PUMP_DIFFICULTIES;
}

export function pumpConfig(d: PumpDifficulty): PumpDifficultyConfig {
  return PUMP_DIFFICULTIES[d];
}

// Greatest number of successful pumps possible — once this many cells are safely
// revealed, only hazards remain, so the next pump is a guaranteed pop.
export function pumpMaxPumps(d: PumpDifficulty): number {
  const c = pumpConfig(d);
  return c.segments - c.pops;
}

// Probability the NEXT pump pops, given `pumpsSoFar` successful pumps already.
// Hazards are never revealed safe, so remaining hazards = pops and remaining
// cells = segments − pumpsSoFar. Rises toward 1 as the balloon fills.
export function pumpPopChance(d: PumpDifficulty, pumpsSoFar: number): number {
  const c = pumpConfig(d);
  const cellsLeft = c.segments - pumpsSoFar;
  if (cellsLeft <= 0) return 1;
  return Math.min(1, c.pops / cellsLeft);
}

// Probability of surviving `pumps` consecutive pumps from the start. 0 when more
// pumps than safe cells are requested (impossible).
export function pumpSurvivalChance(d: PumpDifficulty, pumps: number): number {
  if (pumps <= 0) return 1;
  const c = pumpConfig(d);
  const safe = c.segments - c.pops;
  if (pumps > safe) return 0;
  let p = 1;
  for (let i = 0; i < pumps; i++) p *= (safe - i) / (c.segments - i);
  return p;
}

// Cumulative payout multiplier after `pumps` successful pumps (house edge applied
// once). pumps = 0 → 1×. Full precision — round only for display.
export function pumpMultiplier(d: PumpDifficulty, pumps: number): number {
  if (pumps <= 0) return 1;
  const p = pumpSurvivalChance(d, pumps);
  if (p <= 0) return 0;
  return Math.min(PUMP.MAX_MULTIPLIER, PUMP.RTP / p);
}
