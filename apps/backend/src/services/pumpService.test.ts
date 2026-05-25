import { describe, it, expect } from 'vitest';
import {
  PUMP,
  PUMP_DIFFICULTIES,
  PUMP_DIFFICULTY_IDS,
  pumpConfig,
  pumpMaxPumps,
  pumpPopChance,
  pumpSurvivalChance,
  pumpMultiplier,
  type PumpDifficulty,
} from '@gambling/shared';
import { generateBalloon, initialPumpState, applyPump, type PumpSessionState } from './pumpService.js';

// n-choose-k for the closed-form ceiling check (ceiling = C(segments, pops) × RTP).
function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
}

describe('generateBalloon', () => {
  it('lays out exactly `pops` hazards among `segments` cells for each difficulty', () => {
    for (const id of PUMP_DIFFICULTY_IDS) {
      const { segments, pops } = pumpConfig(id);
      for (let trial = 0; trial < 200; trial++) {
        const strip = generateBalloon(id);
        expect(strip).toHaveLength(segments);
        expect(strip.filter(Boolean)).toHaveLength(pops);
      }
    }
  });

  it('shuffles the hazard positions (not always at the front)', () => {
    const positions = new Set<number>();
    for (let i = 0; i < 500; i++) positions.add(generateBalloon('easy').indexOf(true));
    // The single Easy hazard should land in many distinct positions over 500 draws.
    expect(positions.size).toBeGreaterThan(8);
  });
});

describe('pumpMaxPumps / pumpPopChance', () => {
  it('max pumps = segments − pops', () => {
    expect(pumpMaxPumps('easy')).toBe(11);
    expect(pumpMaxPumps('medium')).toBe(10);
    expect(pumpMaxPumps('hard')).toBe(8);
    expect(pumpMaxPumps('expert')).toBe(6);
  });

  it('first-pump pop chance rises with difficulty and reaches 1 when maxed', () => {
    expect(pumpPopChance('easy', 0)).toBeCloseTo(1 / 12, 10);
    expect(pumpPopChance('medium', 0)).toBeCloseTo(2 / 12, 10);
    expect(pumpPopChance('hard', 0)).toBeCloseTo(4 / 12, 10);
    expect(pumpPopChance('expert', 0)).toBeCloseTo(6 / 12, 10);
    for (const id of PUMP_DIFFICULTY_IDS) {
      // At the ceiling only hazards remain → guaranteed pop.
      expect(pumpPopChance(id, pumpMaxPumps(id))).toBe(1);
    }
  });
});

describe('pumpMultiplier', () => {
  it('is 1× before any pump and grows monotonically', () => {
    for (const id of PUMP_DIFFICULTY_IDS) {
      expect(pumpMultiplier(id, 0)).toBe(1);
      let prev = 1;
      for (let n = 1; n <= pumpMaxPumps(id); n++) {
        const m = pumpMultiplier(id, n);
        expect(m).toBeGreaterThan(prev);
        prev = m;
      }
    }
  });

  it('ceiling equals C(segments, pops) × RTP', () => {
    for (const id of PUMP_DIFFICULTY_IDS) {
      const { segments, pops } = pumpConfig(id);
      const top = pumpMultiplier(id, pumpMaxPumps(id));
      expect(top).toBeCloseTo(choose(segments, pops) * PUMP.RTP, 6);
    }
  });

  it('expected return when cashing out after ANY number of pumps is exactly the RTP', () => {
    // survival(n) × mult(n) = RTP for every reachable n ≥ 1 (edge applied once).
    for (const id of PUMP_DIFFICULTY_IDS) {
      for (let n = 1; n <= pumpMaxPumps(id); n++) {
        const ev = pumpSurvivalChance(id, n) * pumpMultiplier(id, n);
        expect(ev).toBeCloseTo(PUMP.RTP, 9);
      }
    }
  });
});

describe('applyPump', () => {
  function activeState(difficulty: PumpDifficulty, strip: boolean[]): PumpSessionState {
    return { difficulty, strip, pumps: 0, multiplier: 1, status: 'active' };
  }

  it('survives a safe cell: increments pumps and compounds the multiplier', () => {
    // All-safe strip → every pump survives.
    const s = activeState('hard', Array(12).fill(false));
    const r = applyPump(s);
    expect(r.popped).toBe(false);
    expect(s.pumps).toBe(1);
    expect(s.status).toBe('active');
    expect(s.multiplier).toBeCloseTo(pumpMultiplier('hard', 1), 9);
    expect(r.multiplier).toBe(s.multiplier);
  });

  it('pops on a hazard cell: ends the round, leaving pumps/multiplier unchanged', () => {
    // Hazard at index 0 → the very first pump pops.
    const strip = Array(12).fill(false);
    strip[0] = true;
    const s = activeState('easy', strip);
    const r = applyPump(s);
    expect(r.popped).toBe(true);
    expect(s.status).toBe('popped');
    expect(s.pumps).toBe(0);
    expect(s.multiplier).toBe(1);
  });

  it('walks a known strip: survives then pops at the hazard', () => {
    const strip = Array(12).fill(false);
    strip[3] = true; // safe, safe, safe, POP
    const s = activeState('medium', strip);
    expect(applyPump(s).popped).toBe(false);
    expect(applyPump(s).popped).toBe(false);
    expect(applyPump(s).popped).toBe(false);
    expect(s.pumps).toBe(3);
    const pop = applyPump(s);
    expect(pop.popped).toBe(true);
    expect(s.pumps).toBe(3); // unchanged by the pop
    expect(s.status).toBe('popped');
  });

  it('initialPumpState opens an active round with a full hidden strip', () => {
    const s = initialPumpState('expert');
    expect(s.status).toBe('active');
    expect(s.pumps).toBe(0);
    expect(s.multiplier).toBe(1);
    expect(s.strip).toHaveLength(PUMP_DIFFICULTIES.expert.segments);
    expect(s.strip.filter(Boolean)).toHaveLength(PUMP_DIFFICULTIES.expert.pops);
  });
});

describe('house edge (Monte Carlo)', () => {
  it('average return of a single pump-then-cash-out converges to the RTP', () => {
    const id: PumpDifficulty = 'hard';
    const N = 300_000;
    const payout = pumpMultiplier(id, 1); // staked 1 unit, paid this on a survived pump
    let total = 0;
    for (let i = 0; i < N; i++) {
      const s = initialPumpState(id);
      if (!applyPump(s).popped) total += payout;
    }
    const ev = total / N;
    expect(ev).toBeGreaterThan(0.95);
    expect(ev).toBeLessThan(0.99); // centred on RTP 0.97
    expect(PUMP.RTP).toBe(0.97);
  });
});
