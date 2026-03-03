import { describe, it, expect } from 'vitest';
import { resolveRouletteBets } from './rouletteService.js';

describe('resolveRouletteBets', () => {
  // ─── Zero (green pocket) edge cases ─────────────────────────────────────────

  it('returns 360 for straight-up number_0 when pocket is 0 (35:1 + stake)', () => {
    expect(resolveRouletteBets(0, [{ zone: 'number_0', amount: 10 }])).toBe(360);
  });

  it('returns 0 for red when pocket is 0 (zero is not red)', () => {
    expect(resolveRouletteBets(0, [{ zone: 'red', amount: 10 }])).toBe(0);
  });

  it('returns 0 for odd when pocket is 0 (zero is not odd)', () => {
    expect(resolveRouletteBets(0, [{ zone: 'odd', amount: 10 }])).toBe(0);
  });

  it('returns 0 for even when pocket is 0 (zero is not even for outside bets)', () => {
    expect(resolveRouletteBets(0, [{ zone: 'even', amount: 10 }])).toBe(0);
  });

  it('returns 0 for col_1 when pocket is 0 (zero not in any column)', () => {
    expect(resolveRouletteBets(0, [{ zone: 'col_1', amount: 10 }])).toBe(0);
  });

  // ─── Red / Black (1:1) ───────────────────────────────────────────────────────

  it('returns 20 for red when pocket is 1 (1 is red, 1:1 + stake)', () => {
    expect(resolveRouletteBets(1, [{ zone: 'red', amount: 10 }])).toBe(20);
  });

  it('returns 20 for black when pocket is 2 (2 is black, 1:1 + stake)', () => {
    expect(resolveRouletteBets(2, [{ zone: 'black', amount: 10 }])).toBe(20);
  });

  // ─── Odd / Even (1:1) ────────────────────────────────────────────────────────

  it('returns 20 for odd when pocket is 1 (1 is odd, 1:1 + stake)', () => {
    expect(resolveRouletteBets(1, [{ zone: 'odd', amount: 10 }])).toBe(20);
  });

  it('returns 20 for even when pocket is 2 (2 is even, 1:1 + stake)', () => {
    expect(resolveRouletteBets(2, [{ zone: 'even', amount: 10 }])).toBe(20);
  });

  // ─── Dozens (2:1) ────────────────────────────────────────────────────────────

  it('returns 30 for dozen_1 when pocket is 5 (5 in 1-12, 2:1 + stake)', () => {
    expect(resolveRouletteBets(5, [{ zone: 'dozen_1', amount: 10 }])).toBe(30);
  });

  it('returns 30 for dozen_2 when pocket is 15 (15 in 13-24, 2:1 + stake)', () => {
    expect(resolveRouletteBets(15, [{ zone: 'dozen_2', amount: 10 }])).toBe(30);
  });

  it('returns 30 for dozen_3 when pocket is 30 (30 in 25-36, 2:1 + stake)', () => {
    expect(resolveRouletteBets(30, [{ zone: 'dozen_3', amount: 10 }])).toBe(30);
  });

  // ─── Columns (2:1) ───────────────────────────────────────────────────────────

  it('returns 30 for col_1 when pocket is 1 (1 % 3 === 1, 2:1 + stake)', () => {
    expect(resolveRouletteBets(1, [{ zone: 'col_1', amount: 10 }])).toBe(30);
  });

  it('returns 30 for col_2 when pocket is 2 (2 % 3 === 2, 2:1 + stake)', () => {
    expect(resolveRouletteBets(2, [{ zone: 'col_2', amount: 10 }])).toBe(30);
  });

  it('returns 30 for col_3 when pocket is 3 (3 % 3 === 0, not zero, 2:1 + stake)', () => {
    expect(resolveRouletteBets(3, [{ zone: 'col_3', amount: 10 }])).toBe(30);
  });

  // ─── Straight-up numbers (35:1) ──────────────────────────────────────────────

  it('returns 360 for number_17 when pocket is 17 (35:1 + stake)', () => {
    expect(resolveRouletteBets(17, [{ zone: 'number_17', amount: 10 }])).toBe(360);
  });

  it('returns 0 for number_18 when pocket is 17 (wrong number)', () => {
    expect(resolveRouletteBets(17, [{ zone: 'number_18', amount: 10 }])).toBe(0);
  });

  // ─── Multi-bet scenarios ─────────────────────────────────────────────────────

  it('returns 40 for multi-bet red+odd when pocket is 1 (both win 1:1 + stake each)', () => {
    expect(
      resolveRouletteBets(1, [
        { zone: 'red', amount: 10 },
        { zone: 'odd', amount: 10 },
      ])
    ).toBe(40);
  });

  it('returns 20 for partial-win red+black when pocket is 1 (only red wins, 1:1 + stake)', () => {
    expect(
      resolveRouletteBets(1, [
        { zone: 'red', amount: 10 },
        { zone: 'black', amount: 10 },
      ])
    ).toBe(20);
  });
});
