// Chicken ("Chicken Road") — a lane-crossing cash-out ladder. The chicken crosses
// a busy road one lane at a time; each safe lane compounds the payout multiplier
// and the player cashes out any time. Stepping into a lane with a car ends the
// round and loses the whole stake. Shared by the backend (settlement) and the
// frontend (live multiplier + the per-lane preview). The crypto RNG (the hidden
// car layout) lives backend-only in chickenService.ts.
//
// Model: the canonical Chicken Road math — a HYPERGEOMETRIC (Mines-style) ladder,
// the same family as Pump/Mines. The road is modelled as TILES (25) crossings of
// which `deadly` hide a car, laid out by a crypto shuffle (without replacement).
// Surviving n lanes therefore has probability
//   P(survive n) = Π_{i=0}^{n-1} (safe - i) / (TILES - i),   safe = TILES - deadly
// and the payout multiplier applies the house edge ONCE to the fair odds:
//   mult(n) = RTP / P(survive n).
// So the expected return when cashing out after ANY n ≥ 1 lanes is exactly the
// RTP (0.97), each further lane is a fair (EV-neutral) gamble, and — because draws
// are without replacement — the per-lane death chance RISES as you go while the
// multiplier ACCELERATES. This reproduces the real game's numbers: Easy (1 deadly)
// tops out at ×24.25 over 24 lanes, Daredevil (10 deadly) at ~×3.17M over 15.
// Difficulty (number of deadly tiles) sets volatility, not RTP.

export type ChickenDifficulty = 'easy' | 'medium' | 'hard' | 'daredevil';

export interface ChickenDifficultyConfig {
  id: ChickenDifficulty;
  label: string;
  deadly: number; // hidden cars among the TILES tiles (1 ≤ deadly < TILES)
}

export const CHICKEN = {
  RTP: 0.97, // 97% return-to-player (3% house edge) — matches the rest of the lineup
  TILES: 25, // the road is modelled as 25 crossings (matches the real Chicken Road)
  MAX_MULTIPLIER: 5_000_000, // safety cap (above Daredevil's ~3.17M ceiling)
} as const;

// Deadly-tile counts mirror the real Chicken Road: 1 / 3 / 5 / 10 cars in 25, i.e.
// first-lane death 4% / 12% / 20% / 40%, ceilings ≈ ×24.25 / ×2231 / ×51,536 / ×3.17M.
export const CHICKEN_DIFFICULTIES: Record<ChickenDifficulty, ChickenDifficultyConfig> = {
  easy:      { id: 'easy',      label: 'Easy',      deadly: 1 },
  medium:    { id: 'medium',    label: 'Medium',    deadly: 3 },
  hard:      { id: 'hard',      label: 'Hard',      deadly: 5 },
  daredevil: { id: 'daredevil', label: 'Daredevil', deadly: 10 },
};

export const CHICKEN_DIFFICULTY_IDS: ChickenDifficulty[] = ['easy', 'medium', 'hard', 'daredevil'];

export function isChickenDifficulty(v: unknown): v is ChickenDifficulty {
  return typeof v === 'string' && v in CHICKEN_DIFFICULTIES;
}

export function chickenConfig(d: ChickenDifficulty): ChickenDifficultyConfig {
  return CHICKEN_DIFFICULTIES[d];
}

// Road length — the most lanes the chicken can cross (all the safe tiles).
export function chickenMaxLanes(d: ChickenDifficulty): number {
  return CHICKEN.TILES - chickenConfig(d).deadly;
}

// Headline / first-lane hazard rate (deadly / TILES): 0.04 / 0.12 / 0.20 / 0.40.
export function chickenHazardRate(d: ChickenDifficulty): number {
  return chickenConfig(d).deadly / CHICKEN.TILES;
}

// Conditional death chance of the NEXT lane after `crossed` safe crossings. Rises
// as the road depletes (without replacement): deadly / (TILES − crossed).
export function chickenNextDeathChance(d: ChickenDifficulty, crossed: number): number {
  const left = CHICKEN.TILES - crossed;
  if (left <= 0) return 1;
  return Math.min(1, chickenConfig(d).deadly / left);
}

// Probability of surviving `lanes` consecutive crossings from the start.
export function chickenSurvivalChance(d: ChickenDifficulty, lanes: number): number {
  if (lanes <= 0) return 1;
  const safe = chickenMaxLanes(d);
  if (lanes > safe) return 0;
  let p = 1;
  for (let i = 0; i < lanes; i++) p *= (safe - i) / (CHICKEN.TILES - i);
  return p;
}

// Cumulative payout multiplier after `lanes` safely crossed (house edge applied
// once). lanes = 0 → 1×. Full precision — round only for display.
export function chickenMultiplier(d: ChickenDifficulty, lanes: number): number {
  if (lanes <= 0) return 1;
  const p = chickenSurvivalChance(d, lanes);
  if (p <= 0) return CHICKEN.MAX_MULTIPLIER;
  return Math.min(CHICKEN.MAX_MULTIPLIER, CHICKEN.RTP / p);
}
