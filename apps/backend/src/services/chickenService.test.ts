import { describe, it, expect } from 'vitest';
import {
  CHICKEN,
  CHICKEN_DIFFICULTIES,
  CHICKEN_DIFFICULTY_IDS,
  chickenConfig,
  chickenMaxLanes,
  chickenHazardRate,
  chickenSurvivalChance,
  chickenMultiplier,
  type ChickenDifficulty,
} from '@gambling/shared';
import { generateRoad, initialChickenState, applyStep, type ChickenSessionState } from './chickenService.js';

// n-choose-k for the closed-form ceiling check (ceiling = C(25, deadly) × RTP).
function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
}

describe('generateRoad', () => {
  it('lays out exactly `deadly` cars among CHICKEN.TILES tiles for each difficulty', () => {
    for (const id of CHICKEN_DIFFICULTY_IDS) {
      const { deadly } = chickenConfig(id);
      for (let trial = 0; trial < 300; trial++) {
        const road = generateRoad(id);
        expect(road).toHaveLength(CHICKEN.TILES);
        expect(road.filter(Boolean)).toHaveLength(deadly);
      }
    }
  });

  it('shuffles the car positions (not always at the front)', () => {
    const positions = new Set<number>();
    for (let i = 0; i < 600; i++) positions.add(generateRoad('easy').indexOf(true));
    expect(positions.size).toBeGreaterThan(10);
  });
});

describe('chickenMaxLanes / hazard rate', () => {
  it('max lanes = TILES − deadly (24 / 22 / 20 / 15)', () => {
    expect(chickenMaxLanes('easy')).toBe(24);
    expect(chickenMaxLanes('medium')).toBe(22);
    expect(chickenMaxLanes('hard')).toBe(20);
    expect(chickenMaxLanes('daredevil')).toBe(15);
  });

  it('first-lane hazard rate = deadly / 25 (4% / 12% / 20% / 40%)', () => {
    expect(chickenHazardRate('easy')).toBeCloseTo(0.04, 10);
    expect(chickenHazardRate('medium')).toBeCloseTo(0.12, 10);
    expect(chickenHazardRate('hard')).toBeCloseTo(0.20, 10);
    expect(chickenHazardRate('daredevil')).toBeCloseTo(0.40, 10);
  });
});

describe('chickenMultiplier', () => {
  it('is 1× before any lane and grows monotonically', () => {
    for (const id of CHICKEN_DIFFICULTY_IDS) {
      expect(chickenMultiplier(id, 0)).toBe(1);
      let prev = 1;
      for (let n = 1; n <= chickenMaxLanes(id); n++) {
        const m = chickenMultiplier(id, n);
        expect(m).toBeGreaterThan(prev);
        prev = m;
      }
    }
  });

  it('matches the real Chicken Road ceilings (C(25, deadly) × RTP)', () => {
    for (const id of CHICKEN_DIFFICULTY_IDS) {
      const { deadly } = chickenConfig(id);
      const top = chickenMultiplier(id, chickenMaxLanes(id));
      expect(top).toBeCloseTo(choose(25, deadly) * CHICKEN.RTP, 2);
    }
    // Sanity: the iconic Easy ×24.25 and Daredevil ~×3.17M.
    expect(chickenMultiplier('easy', 24)).toBeCloseTo(24.25, 2);
    expect(chickenMultiplier('daredevil', 15)).toBeGreaterThan(3_000_000);
  });

  it('expected return when cashing out after ANY number of lanes is exactly the RTP', () => {
    for (const id of CHICKEN_DIFFICULTY_IDS) {
      for (let n = 1; n <= chickenMaxLanes(id); n++) {
        const ev = chickenSurvivalChance(id, n) * chickenMultiplier(id, n);
        expect(ev).toBeCloseTo(CHICKEN.RTP, 9);
      }
    }
  });
});

describe('applyStep', () => {
  function activeState(difficulty: ChickenDifficulty, road: boolean[]): ChickenSessionState {
    return { difficulty, road, lane: 0, multiplier: 1, status: 'active' };
  }

  it('survives a clear lane: advances and compounds', () => {
    const s = activeState('hard', Array(CHICKEN.TILES).fill(false));
    const r = applyStep(s);
    expect(r.dead).toBe(false);
    expect(s.lane).toBe(1);
    expect(s.status).toBe('active');
    expect(s.multiplier).toBeCloseTo(chickenMultiplier('hard', 1), 9);
  });

  it('dies on a car lane: ends the round, leaving lane/multiplier unchanged', () => {
    const road = Array(CHICKEN.TILES).fill(false);
    road[0] = true; // car in the first lane
    const s = activeState('medium', road);
    const r = applyStep(s);
    expect(r.dead).toBe(true);
    expect(s.status).toBe('dead');
    expect(s.lane).toBe(0);
    expect(s.multiplier).toBe(1);
  });

  it('flags crossing the far side on the final safe lane', () => {
    const s = activeState('daredevil', Array(CHICKEN.TILES).fill(false));
    let last: ReturnType<typeof applyStep> | null = null;
    for (let i = 0; i < chickenMaxLanes('daredevil'); i++) last = applyStep(s);
    expect(last!.crossed).toBe(true);
    expect(s.lane).toBe(chickenMaxLanes('daredevil'));
  });

  it('walks a known road: survives then dies at the car', () => {
    const road = Array(CHICKEN.TILES).fill(false);
    road[2] = true; // clear, clear, CAR
    const s = activeState('medium', road);
    expect(applyStep(s).dead).toBe(false);
    expect(applyStep(s).dead).toBe(false);
    expect(s.lane).toBe(2);
    expect(applyStep(s).dead).toBe(true);
    expect(s.lane).toBe(2); // unchanged by the death
    expect(s.status).toBe('dead');
  });

  it('initialChickenState opens an active round with a full 25-tile hidden road', () => {
    const s = initialChickenState('easy');
    expect(s.status).toBe('active');
    expect(s.lane).toBe(0);
    expect(s.multiplier).toBe(1);
    expect(s.road).toHaveLength(CHICKEN.TILES);
    expect(s.road.filter(Boolean)).toHaveLength(CHICKEN_DIFFICULTIES.easy.deadly);
  });
});

describe('house edge (Monte Carlo)', () => {
  it('average return of a single step-then-cash-out converges to the RTP', () => {
    const id: ChickenDifficulty = 'hard';
    const N = 300_000;
    const payout = chickenMultiplier(id, 1);
    let total = 0;
    for (let i = 0; i < N; i++) {
      const s = initialChickenState(id);
      if (!applyStep(s).dead) total += payout;
    }
    const ev = total / N;
    expect(ev).toBeGreaterThan(0.95);
    expect(ev).toBeLessThan(0.99); // centred on RTP 0.97
    expect(CHICKEN.RTP).toBe(0.97);
  });
});
