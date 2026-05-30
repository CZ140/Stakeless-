import { describe, it, expect } from 'vitest';
import { resolvePlinko, PLINKO_MULTIPLIERS, rollPlinkoBucket } from './plinkoService.js';

describe('rollPlinkoBucket (binomial distribution)', () => {
  it('always returns an integer bucket in 0..rows', () => {
    for (const rows of [8, 12, 16]) {
      for (let i = 0; i < 2000; i++) {
        const b = rollPlinkoBucket(rows);
        expect(Number.isInteger(b)).toBe(true);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(rows);
      }
    }
  });

  it('center buckets are vastly more likely than the edges (not uniform)', () => {
    const rows = 16;
    const counts = new Array(rows + 1).fill(0);
    const N = 100_000;
    for (let i = 0; i < N; i++) counts[rollPlinkoBucket(rows)]++;
    const center = counts[rows / 2]!; // bucket 8
    const edge = counts[0]! + counts[rows]!; // both 5000× edges combined
    // Binomial: P(center) ≈ 19.6%, P(both edges) ≈ 2·(1/65536) ≈ 0.003%.
    // Center must dominate by orders of magnitude — a uniform pick would make
    // these roughly equal (~1/17 each).
    expect(center).toBeGreaterThan(edge * 100);
    // Edge frequency must be far below the uniform 1/17 (~5.9%) per side.
    expect(counts[0]! / N).toBeLessThan(0.005);
  });
});

describe('PLINKO_MULTIPLIERS table', () => {
  const riskLevels = ['low', 'medium', 'high', 'expert'] as const;

  it('contains all four risk levels', () => {
    for (const risk of riskLevels) {
      expect(PLINKO_MULTIPLIERS).toHaveProperty(risk);
    }
  });

  it('contains all row counts 8–16 for every risk level', () => {
    for (const risk of riskLevels) {
      for (let rows = 8; rows <= 16; rows++) {
        expect(PLINKO_MULTIPLIERS[risk]).toHaveProperty(String(rows));
      }
    }
  });

  it('each row entry has exactly (rows+1) buckets', () => {
    for (const risk of riskLevels) {
      for (let rows = 8; rows <= 16; rows++) {
        const buckets = PLINKO_MULTIPLIERS[risk][rows];
        expect(Array.isArray(buckets)).toBe(true);
        expect(buckets!.length).toBe(rows + 1);
      }
    }
  });

  it('all multiplier values are positive numbers', () => {
    for (const risk of riskLevels) {
      for (let rows = 8; rows <= 16; rows++) {
        const buckets = PLINKO_MULTIPLIERS[risk][rows] ?? [];
        for (const val of buckets) {
          expect(typeof val).toBe('number');
          expect(val).toBeGreaterThan(0);
        }
      }
    }
  });

  // Guards against the calibration bug where hand-typed multiplier tables were
  // never checked against the actual Binomial(rows, 0.5) landing distribution.
  // Some tables (notably every `expert` table) paid out 180–264% RTP — wildly
  // +EV for the player. Each bucket k is reached with probability C(rows,k)/2^rows,
  // so the true RTP is the binomial-weighted sum of multipliers.
  describe('binomial-weighted RTP is ~99% for every table (no +EV)', () => {
    // log of C(n,k) via log-factorials, then P = exp(logC - n*ln2) for numeric stability.
    function binomProb(n: number, k: number): number {
      let logC = 0;
      for (let i = 0; i < k; i++) logC += Math.log(n - i) - Math.log(i + 1);
      return Math.exp(logC - n * Math.log(2));
    }

    for (const risk of riskLevels) {
      for (let rows = 8; rows <= 16; rows++) {
        it(`${risk} / ${rows} rows lands in [98.5%, 99.5%] and is never +EV`, () => {
          const buckets = PLINKO_MULTIPLIERS[risk][rows]!;
          let rtp = 0;
          let psum = 0;
          for (let k = 0; k <= rows; k++) {
            const p = binomProb(rows, k);
            psum += p;
            rtp += p * buckets[k]!;
          }
          expect(psum).toBeCloseTo(1, 6); // probabilities sum to 1
          expect(rtp).toBeGreaterThanOrEqual(0.985);
          expect(rtp).toBeLessThanOrEqual(0.995); // house edge always ≥ 0.5% → never player-favourable
        });
      }
    }
  });

  it('Low 8-row table matches reference values', () => {
    expect(PLINKO_MULTIPLIERS.low[8]).toEqual([5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6]);
  });

  it('High 8-row table matches reference values', () => {
    expect(PLINKO_MULTIPLIERS.high[8]).toEqual([29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29]);
  });
});

describe('resolvePlinko', () => {
  it('returns correct multiplier for Low 8-row bucket 0 (edge)', () => {
    expect(resolvePlinko(8, 'low', 0)).toBe(5.6);
  });

  it('returns correct multiplier for Low 8-row bucket 4 (center)', () => {
    expect(resolvePlinko(8, 'low', 4)).toBe(0.5);
  });

  it('returns correct multiplier for Low 8-row bucket 8 (other edge)', () => {
    expect(resolvePlinko(8, 'low', 8)).toBe(5.6);
  });

  it('returns correct multiplier for High 8-row bucket 0 (extreme edge)', () => {
    expect(resolvePlinko(8, 'high', 0)).toBe(29);
  });

  it('returns correct multiplier for High 8-row bucket 4 (center)', () => {
    expect(resolvePlinko(8, 'high', 4)).toBe(0.2);
  });

  it('returns valid multiplier for all rows 8–16, all risk levels, all bucket indices', () => {
    const riskLevels = ['low', 'medium', 'high', 'expert'] as const;
    for (const risk of riskLevels) {
      for (let rows = 8; rows <= 16; rows++) {
        for (let bucket = 0; bucket <= rows; bucket++) {
          const result = resolvePlinko(rows, risk, bucket);
          expect(typeof result).toBe('number');
          expect(result).toBeGreaterThan(0);
        }
      }
    }
  });

  it('returns 0 for out-of-range bucket index (negative)', () => {
    expect(resolvePlinko(8, 'low', -1)).toBe(0);
  });

  it('returns 0 for out-of-range bucket index (too high)', () => {
    expect(resolvePlinko(8, 'low', 9)).toBe(0);
  });

  it('returns 0 for invalid rows', () => {
    expect(resolvePlinko(7, 'low', 0)).toBe(0);
    expect(resolvePlinko(17, 'low', 0)).toBe(0);
  });

  it('returns 0 for invalid risk level', () => {
    expect(resolvePlinko(8, 'invalid', 0)).toBe(0);
  });
});
