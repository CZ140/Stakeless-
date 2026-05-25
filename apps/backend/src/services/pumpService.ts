import { randomInt } from 'node:crypto';
import { pumpConfig, pumpMultiplier, type PumpDifficulty } from '@gambling/shared';

export interface PumpSessionState {
  difficulty: PumpDifficulty;
  // Hidden hazard layout (true = pop), length = segments. NEVER serialized to the
  // client — it would reveal where the balloon pops.
  strip: boolean[];
  pumps: number; // successful pumps so far
  multiplier: number; // cumulative payout multiplier (house edge applied)
  status: 'active' | 'popped' | 'cashout';
}

// Build the hidden hazard layout: `pops` hazards among `segments` cells, placed
// by a Fisher-Yates shuffle seeded with crypto.randomInt (matches Mines' grid).
export function generateBalloon(difficulty: PumpDifficulty): boolean[] {
  const { segments, pops } = pumpConfig(difficulty);
  const strip: boolean[] = Array(segments).fill(false);
  for (let i = 0; i < pops; i++) strip[i] = true;
  for (let i = segments - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [strip[i], strip[j]] = [strip[j]!, strip[i]!];
  }
  return strip;
}

export function initialPumpState(difficulty: PumpDifficulty): PumpSessionState {
  return { difficulty, strip: generateBalloon(difficulty), pumps: 0, multiplier: 1, status: 'active' };
}

export interface PumpResult {
  popped: boolean;
  pumps: number; // successful pumps after this action (unchanged on a pop)
  multiplier: number; // cumulative after this action (unchanged on a pop)
}

// Apply one pump to the (mutated) state. Reveals the next hidden cell: a hazard
// pops the balloon (round over), otherwise the pump compounds the multiplier.
// Caller must ensure the round is active and not already maxed (pumps < maxPumps).
export function applyPump(state: PumpSessionState): PumpResult {
  const cell = state.strip[state.pumps]; // the next cell to reveal
  if (cell === true) {
    state.status = 'popped';
    return { popped: true, pumps: state.pumps, multiplier: state.multiplier };
  }
  state.pumps += 1;
  state.multiplier = pumpMultiplier(state.difficulty, state.pumps);
  return { popped: false, pumps: state.pumps, multiplier: state.multiplier };
}
