import { describe, it, expect } from 'vitest';
import {
  CRASH,
  crashMultiplierAt,
  crashTimeToReachMs,
  crashPointFromUniform,
  crashCashoutWins,
  isValidAutoCashout,
} from '@gambling/shared';
import { generateCrashPoint } from './crashService.js';

describe('crashMultiplierAt', () => {
  it('starts at 1.00× and never drops below it', () => {
    expect(crashMultiplierAt(0)).toBe(1.0);
    expect(crashMultiplierAt(-50)).toBe(1.0);
    expect(crashMultiplierAt(1)).toBeGreaterThanOrEqual(1.0);
  });

  it('rises monotonically with elapsed time', () => {
    let prev = 0;
    for (let ms = 0; ms <= 20_000; ms += 500) {
      const m = crashMultiplierAt(ms);
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
  });

  it('follows e^(GROWTH·t) (floored to 2dp)', () => {
    for (const sec of [1, 3, 5, 10]) {
      const expected = Math.floor(Math.exp(CRASH.GROWTH * sec) * 100) / 100;
      expect(crashMultiplierAt(sec * 1000)).toBe(expected);
    }
  });
});

describe('crashTimeToReachMs', () => {
  it('is 0 at or below 1× and inverts crashMultiplierAt', () => {
    expect(crashTimeToReachMs(1)).toBe(0);
    expect(crashTimeToReachMs(0.5)).toBe(0);
    // round-trip: the multiplier at the time we reach m should be ≈ m (within the 2dp floor)
    for (const m of [1.5, 2, 3.33, 10, 100]) {
      const t = crashTimeToReachMs(m);
      expect(crashMultiplierAt(t)).toBeGreaterThanOrEqual(m - 0.02);
      expect(crashMultiplierAt(t)).toBeLessThanOrEqual(m + 0.02);
    }
  });
});

describe('crashPointFromUniform', () => {
  it('instabusts at 1.00× for the bottom HOUSE_EDGE of the range', () => {
    expect(crashPointFromUniform(0)).toBe(1.0);
    expect(crashPointFromUniform(CRASH.HOUSE_EDGE - 1e-6)).toBe(1.0);
  });

  it('produces a crash point ≥ 1 that rises with the uniform', () => {
    expect(crashPointFromUniform(CRASH.HOUSE_EDGE)).toBeGreaterThanOrEqual(1.0);
    expect(crashPointFromUniform(0.9)).toBeGreaterThan(crashPointFromUniform(0.5));
    expect(crashPointFromUniform(0.999)).toBeLessThanOrEqual(CRASH.MAX_CRASH);
  });

  it('matches the tail law P(M > m) = (1−E)/m at the median', () => {
    // P(M > 2) should be ≈ (1 − 0.03)/2 = 0.485 → u-threshold ≈ 0.515. The 2dp
    // floor smears the exact boundary, so probe just outside it on each side.
    expect(crashPointFromUniform(0.514)).toBeLessThanOrEqual(2.0);
    expect(crashPointFromUniform(0.52)).toBeGreaterThan(2.0);
  });
});

describe('crashCashoutWins', () => {
  it('wins strictly below the crash point; the house wins ties', () => {
    expect(crashCashoutWins(1.99, 2.0)).toBe(true);
    expect(crashCashoutWins(2.0, 2.0)).toBe(false);
    expect(crashCashoutWins(2.01, 2.0)).toBe(false);
  });
});

describe('isValidAutoCashout', () => {
  it('accepts ≥ 1.01× up to the cap', () => {
    expect(isValidAutoCashout(1.01)).toBe(true);
    expect(isValidAutoCashout(2)).toBe(true);
    expect(isValidAutoCashout(1.0)).toBe(false);
    expect(isValidAutoCashout(0)).toBe(false);
    expect(isValidAutoCashout(CRASH.MAX_CRASH + 1)).toBe(false);
  });
});

describe('generateCrashPoint', () => {
  it('always returns a value ≥ 1.00 within the cap', () => {
    for (let i = 0; i < 5000; i++) {
      const cp = generateCrashPoint();
      expect(cp).toBeGreaterThanOrEqual(1.0);
      expect(cp).toBeLessThanOrEqual(CRASH.MAX_CRASH);
    }
  });

  it('instabusts (1.00×) at roughly the house-edge rate', () => {
    const N = 40_000;
    let busts = 0;
    for (let i = 0; i < N; i++) if (generateCrashPoint() === 1.0) busts++;
    const rate = busts / N;
    expect(rate).toBeGreaterThan(CRASH.HOUSE_EDGE - 0.01);
    expect(rate).toBeLessThan(CRASH.HOUSE_EDGE + 0.01);
  });
});

describe('house edge (Monte Carlo)', () => {
  it('every fixed cash-out target returns ≈ the RTP', () => {
    const N = 300_000;
    for (const target of [1.5, 2, 5]) {
      let returned = 0;
      for (let i = 0; i < N; i++) {
        if (crashCashoutWins(target, generateCrashPoint())) returned += target;
      }
      const rtp = returned / N;
      expect(rtp).toBeGreaterThan(0.95);
      expect(rtp).toBeLessThan(0.99); // centred on RTP ≈ 0.97
    }
  });
});
