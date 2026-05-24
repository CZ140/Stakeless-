import { describe, it, expect } from 'vitest';
import {
  SLOTS,
  SLOT_SYMBOLS,
  SLOT_TOTAL_WEIGHT,
  symbolForRoll,
  evaluateLine,
  resolveSlots,
  slotsRtp,
  type SlotSymbolId,
  type SlotGrid,
} from '@gambling/shared';
import { spinGrid } from './slotsService.js';

const IDS = SLOT_SYMBOLS.map((s) => s.id);

// Author grids as rows[row][reel] (how you'd read the board), transpose to the
// column-major grid[reel][row] the engine uses.
function gridFromRows(rows: SlotSymbolId[][]): SlotGrid {
  const grid: SlotGrid = [[], [], []];
  for (let row = 0; row < 3; row++) {
    for (let reel = 0; reel < 3; reel++) {
      grid[reel]![row] = rows[row]![reel]!;
    }
  }
  return grid;
}

describe('symbolForRoll', () => {
  it('maps the weight bands to symbols (boundaries are exclusive on the right)', () => {
    expect(symbolForRoll(0)).toBe('cherry'); // 0..29
    expect(symbolForRoll(29)).toBe('cherry');
    expect(symbolForRoll(30)).toBe('lemon'); // 30..53
    expect(symbolForRoll(53)).toBe('lemon');
    expect(symbolForRoll(54)).toBe('bell'); // 54..73
    expect(symbolForRoll(SLOT_TOTAL_WEIGHT - 1)).toBe('diamond'); // top band
  });
});

describe('spinGrid', () => {
  it('returns a 3×3 grid of valid symbol ids', () => {
    for (let i = 0; i < 200; i++) {
      const grid = spinGrid();
      expect(grid).toHaveLength(SLOTS.REELS);
      for (const reel of grid) {
        expect(reel).toHaveLength(SLOTS.ROWS);
        for (const cell of reel) expect(IDS).toContain(cell);
      }
    }
  });

  it('produces symbols at roughly their configured weights', () => {
    const counts: Record<string, number> = {};
    const N = 20_000; // cells
    let drawn = 0;
    while (drawn < N) {
      for (const reel of spinGrid()) {
        for (const cell of reel) {
          counts[cell] = (counts[cell] ?? 0) + 1;
          drawn++;
        }
      }
    }
    for (const s of SLOT_SYMBOLS) {
      const observed = (counts[s.id] ?? 0) / drawn;
      const expected = s.weight / SLOT_TOTAL_WEIGHT;
      expect(observed).toBeGreaterThan(expected - 0.03);
      expect(observed).toBeLessThan(expected + 0.03);
    }
  });
});

describe('evaluateLine', () => {
  it('pays three-of-a-kind with the symbol pay3', () => {
    expect(evaluateLine('diamond', 'diamond', 'diamond')).toEqual({ symbol: 'diamond', count: 3, multiplier: 500 });
    expect(evaluateLine('cherry', 'cherry', 'cherry')).toEqual({ symbol: 'cherry', count: 3, multiplier: 6 });
  });

  it('pays a leftmost pair only for symbols with pay2 > 0', () => {
    expect(evaluateLine('cherry', 'cherry', 'lemon')).toEqual({ symbol: 'cherry', count: 2, multiplier: 1.5 });
    expect(evaluateLine('bell', 'bell', 'star')).toEqual({ symbol: 'bell', count: 2, multiplier: 4.5 });
    // star/seven/diamond have pay2 = 0 → a pair does not pay
    expect(evaluateLine('seven', 'seven', 'cherry')).toBeNull();
    expect(evaluateLine('diamond', 'diamond', 'cherry')).toBeNull();
  });

  it('does not pay a pair that is not leftmost, or a no-match line', () => {
    expect(evaluateLine('lemon', 'cherry', 'cherry')).toBeNull(); // pair on reels 2-3
    expect(evaluateLine('cherry', 'lemon', 'bell')).toBeNull();
  });
});

describe('resolveSlots', () => {
  it('scores a single winning row and splits the bet across 5 lines', () => {
    const grid = gridFromRows([
      ['cherry', 'lemon', 'bell'],
      ['diamond', 'diamond', 'diamond'], // middle row — 3 diamonds
      ['seven', 'star', 'lemon'],
    ]);
    const res = resolveSlots(grid, 100);
    expect(res.win).toBe(true);
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0]).toMatchObject({ line: 1, symbol: 'diamond', count: 3, multiplier: 500 });
    expect(res.lines[0]!.payout).toBe(Math.floor((100 * 500) / 5)); // 10000
    expect(res.totalPayout).toBe(10000);
  });

  it('scores both diagonals through a shared center symbol', () => {
    const grid = gridFromRows([
      ['seven', 'lemon', 'seven'],
      ['cherry', 'seven', 'cherry'],
      ['seven', 'bell', 'seven'],
    ]);
    // ↘ = seven,seven,seven ; ↗ = seven,seven,seven
    const res = resolveSlots(grid, 1000);
    const diagWins = res.lines.filter((l) => l.line === 3 || l.line === 4);
    expect(diagWins).toHaveLength(2);
    for (const w of diagWins) {
      expect(w).toMatchObject({ symbol: 'seven', count: 3, multiplier: 120 });
      expect(w.payout).toBe(Math.floor((1000 * 120) / 5)); // 24000 each
    }
  });

  it('returns no win for a dead grid', () => {
    const grid = gridFromRows([
      ['cherry', 'lemon', 'bell'],
      ['star', 'seven', 'diamond'],
      ['bell', 'cherry', 'lemon'],
    ]);
    const res = resolveSlots(grid, 100);
    expect(res.win).toBe(false);
    expect(res.totalPayout).toBe(0);
    expect(res.lines).toHaveLength(0);
  });

  it('drops sub-coin line wins on tiny bets (floor to 0)', () => {
    // A leftmost cherry pair pays floor(1/5 * 1.5) = 0 at a 1-coin bet.
    const grid = gridFromRows([
      ['cherry', 'cherry', 'lemon'],
      ['star', 'seven', 'bell'],
      ['bell', 'star', 'diamond'],
    ]);
    expect(resolveSlots(grid, 1).win).toBe(false);
  });
});

describe('slotsRtp (exact)', () => {
  it('lands inside the platform house-edge band (≈ 0.97)', () => {
    const rtp = slotsRtp();
    expect(rtp).toBeGreaterThan(0.96);
    expect(rtp).toBeLessThan(0.98);
  });
});

describe('house edge (Monte Carlo)', () => {
  it('average return per unit staked converges to the RTP', () => {
    const bet = 1000; // large enough that per-line flooring is negligible
    const N = 200_000;
    let staked = 0;
    let returned = 0;
    for (let i = 0; i < N; i++) {
      staked += bet;
      returned += resolveSlots(spinGrid(), bet).totalPayout;
    }
    const ev = returned / staked;
    expect(ev).toBeGreaterThan(0.95);
    expect(ev).toBeLessThan(0.99); // centred on RTP ≈ 0.97
  });
});
