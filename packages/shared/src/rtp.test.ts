// Property-based + exhaustive RTP invariants for the shared game math. These pin
// the house edge of every money game to the platform's 97% RTP directly at the
// pure-function level (the backend's Monte-Carlo service tests check the same
// thing end-to-end; these are deterministic and exact). If a paytable or
// multiplier formula ever drifts, one of these fails immediately.
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  DICE,
  diceWinChance,
  diceMultiplier,
  COINFLIP,
  coinflipMultiplier,
  RPS,
  rpsWinMultiplier,
  HILO,
  hiloWinChance,
  hiloStepMultiplier,
  hiloDirectionAvailable,
  PUMP,
  PUMP_DIFFICULTY_IDS,
  pumpMaxPumps,
  pumpSurvivalChance,
  pumpMultiplier,
  CHICKEN,
  CHICKEN_DIFFICULTY_IDS,
  chickenMaxLanes,
  chickenSurvivalChance,
  chickenMultiplier,
  CRASH,
  crashPointFromUniform,
  crashMultiplierAt,
  crashTimeToReachMs,
  crashCashoutWins,
  slotsRtp,
  SLOTS,
} from './index.js';

const RTP = 0.97;

describe('RTP invariants (shared game math)', () => {
  describe('dice', () => {
    it('winChance × multiplier ≈ RTP for every target/direction', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 500, max: 9500 }), // target×100, valid win-chance band
          fc.constantFrom<'under' | 'over'>('under', 'over'),
          (tt, dir) => {
            const target = tt / 100;
            const wc = diceWinChance(target, dir);
            const mult = diceMultiplier(target, dir);
            // multiplier is rounded to 2dp ⇒ allow up to one cent of slack on the product.
            expect(Math.abs(wc * mult - RTP)).toBeLessThan(0.01);
          },
        ),
      );
    });

    it('under and over are exactly complementary (no dead push outcome)', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 9999 }), (tt) => {
          const t = tt / 100;
          expect(diceWinChance(t, 'under') + diceWinChance(t, 'over')).toBeCloseTo(1, 10);
        }),
      );
    });
  });

  it('coinflip: winChance × multiplier = RTP', () => {
    expect(COINFLIP.WIN_CHANCE * coinflipMultiplier()).toBeCloseTo(COINFLIP.RTP, 6);
  });

  it('rps: (win + push + loss) / 3 = RTP (tie pushes 1×, loss 0×)', () => {
    expect((rpsWinMultiplier() + 1 + 0) / 3).toBeCloseTo(RPS.RTP, 6);
  });

  it('hilo: winChance × stepMultiplier = RTP for every playable card/direction', () => {
    for (let rank = 2; rank <= 14; rank++) {
      for (const dir of ['hi', 'lo'] as const) {
        if (!hiloDirectionAvailable(rank, dir)) continue;
        expect(hiloWinChance(rank, dir) * hiloStepMultiplier(rank, dir)).toBeCloseTo(HILO.RTP, 9);
      }
    }
  });

  // Pump/Chicken front-load the entire edge: mult(n) = RTP / P(survive n), so the
  // expected value is exactly the RTP at EVERY cash-out level (each further step is
  // EV-neutral). Check the whole ladder for every difficulty.
  it('pump: survival(n) × multiplier(n) = RTP at every cash-out, every difficulty', () => {
    for (const d of PUMP_DIFFICULTY_IDS) {
      for (let n = 1; n <= pumpMaxPumps(d); n++) {
        expect(pumpSurvivalChance(d, n) * pumpMultiplier(d, n)).toBeCloseTo(PUMP.RTP, 9);
      }
    }
  });

  it('chicken: survival(n) × multiplier(n) = RTP at every lane, every difficulty', () => {
    for (const d of CHICKEN_DIFFICULTY_IDS) {
      for (let n = 1; n <= chickenMaxLanes(d); n++) {
        expect(chickenSurvivalChance(d, n) * chickenMultiplier(d, n)).toBeCloseTo(CHICKEN.RTP, 9);
      }
    }
  });

  describe('crash', () => {
    it('crash point is ≥ 1 and non-decreasing in the uniform draw', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 0.999999, noNaN: true }),
          fc.double({ min: 0, max: 0.999999, noNaN: true }),
          (a, b) => {
            const lo = Math.min(a, b);
            const hi = Math.max(a, b);
            expect(crashPointFromUniform(lo)).toBeGreaterThanOrEqual(1);
            expect(crashPointFromUniform(hi)).toBeGreaterThanOrEqual(crashPointFromUniform(lo) - 1e-9);
          },
        ),
      );
    });

    it('time ↔ multiplier round-trips up to the 2dp display flooring', () => {
      // crashMultiplierAt floors to 2dp, so the round-trip agrees with the input
      // to within one cent (absolute) across the whole range — not exactly.
      fc.assert(
        fc.property(fc.double({ min: 1.01, max: 1000, noNaN: true }), (m) => {
          const rt = crashMultiplierAt(crashTimeToReachMs(m));
          expect(Math.abs(rt - m)).toBeLessThanOrEqual(0.011);
        }),
      );
    });

    it('expected payout never exceeds RTP and stays close to it, for any cash-out target', () => {
      // Deterministic midpoint integration over the uniform. The crash point is
      // floored to 2dp, which only ever shortens the curve, so the true EV sits
      // just below the nominal RTP (the rounding adds a sliver of house edge).
      const N = 200_000;
      for (const c of [1.5, 2, 5, 10, 50]) {
        let sum = 0;
        for (let i = 0; i < N; i++) {
          const u = (i + 0.5) / N;
          if (crashCashoutWins(c, crashPointFromUniform(u))) sum += c;
        }
        const ev = sum / N;
        expect(ev).toBeLessThanOrEqual(RTP + 1e-6); // house never gives away edge
        expect(ev).toBeGreaterThan(RTP - 0.02); // …and stays within ~2% of nominal
      }
    });
  });

  it('slots: theoretical RTP is ~97% (matches the documented target)', () => {
    expect(slotsRtp()).toBeGreaterThan(0.95);
    expect(slotsRtp()).toBeLessThanOrEqual(0.98);
    expect(slotsRtp()).toBeCloseTo(SLOTS.RTP, 2);
  });
});
