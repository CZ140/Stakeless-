import { randomInt } from 'node:crypto';
import { CHICKEN, chickenConfig, chickenMultiplier, chickenMaxLanes, type ChickenDifficulty } from '@gambling/shared';

export interface ChickenSessionState {
  difficulty: ChickenDifficulty;
  // Hidden car layout (true = car/death), one entry per tile. NEVER serialized to
  // the client — it would reveal which lanes are safe.
  road: boolean[];
  lane: number; // lanes safely crossed so far
  multiplier: number; // cumulative payout multiplier (house edge applied)
  status: 'active' | 'dead' | 'cashout';
}

// Build the hidden car layout: `deadly` cars among CHICKEN.TILES (25) tiles, placed
// by a Fisher-Yates shuffle seeded with crypto.randomInt (matches Mines/Pump). The
// chicken reveals tiles in order; without replacement the per-lane risk rises.
export function generateRoad(difficulty: ChickenDifficulty): boolean[] {
  const { deadly } = chickenConfig(difficulty);
  const road: boolean[] = Array(CHICKEN.TILES).fill(false);
  for (let i = 0; i < deadly; i++) road[i] = true;
  for (let i = CHICKEN.TILES - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [road[i], road[j]] = [road[j]!, road[i]!];
  }
  return road;
}

export function initialChickenState(difficulty: ChickenDifficulty): ChickenSessionState {
  return { difficulty, road: generateRoad(difficulty), lane: 0, multiplier: 1, status: 'active' };
}

export interface ChickenResult {
  dead: boolean;
  lane: number; // lanes crossed after this step (unchanged on death)
  multiplier: number; // cumulative after this step (unchanged on death)
  crossed: boolean; // reached the far side (no lanes remain)
}

// Apply one step to the (mutated) state. Reveals the next lane: a car kills the
// chicken (round over), otherwise the step compounds the multiplier. Caller must
// ensure the round is active and the chicken hasn't already crossed the road.
export function applyStep(state: ChickenSessionState): ChickenResult {
  const car = state.road[state.lane]; // the next lane to step into
  if (car === true) {
    state.status = 'dead';
    return { dead: true, lane: state.lane, multiplier: state.multiplier, crossed: false };
  }
  state.lane += 1;
  state.multiplier = chickenMultiplier(state.difficulty, state.lane);
  // Crossed the whole road once every safe tile is revealed (lane === TILES − deadly).
  return { dead: false, lane: state.lane, multiplier: state.multiplier, crossed: state.lane >= chickenMaxLanes(state.difficulty) };
}
