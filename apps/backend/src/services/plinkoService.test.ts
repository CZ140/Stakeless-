import { describe, it, expect } from 'vitest';
import { resolvePlinko, PLINKO_MULTIPLIERS } from './plinkoService.js';

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
