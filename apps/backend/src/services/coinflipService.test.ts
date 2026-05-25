import { describe, it, expect } from 'vitest';
import { COINFLIP, coinflipMultiplier } from '@gambling/shared';
import { flipCoin, resolveCoinflip } from './coinflipService.js';

describe('flipCoin', () => {
  it('always returns heads or tails', () => {
    for (let i = 0; i < 5000; i++) {
      expect(['heads', 'tails']).toContain(flipCoin());
    }
  });

  it('is roughly fair over many flips', () => {
    const N = 200_000;
    let heads = 0;
    for (let i = 0; i < N; i++) {
      if (flipCoin() === 'heads') heads++;
    }
    expect(heads / N).toBeGreaterThan(0.49);
    expect(heads / N).toBeLessThan(0.51);
  });
});

describe('coinflipMultiplier', () => {
  it('is the RTP over the fair win chance, rounded to 2dp', () => {
    expect(coinflipMultiplier()).toBe(1.94); // 0.97 / 0.5
  });

  it('always pays more than 1× on a win', () => {
    expect(coinflipMultiplier()).toBeGreaterThan(1);
  });
});

describe('resolveCoinflip', () => {
  it('wins when the result matches the call', () => {
    expect(resolveCoinflip('heads', 'heads').win).toBe(true);
    expect(resolveCoinflip('tails', 'tails').win).toBe(true);
  });

  it('loses when the result does not match the call', () => {
    expect(resolveCoinflip('heads', 'tails').win).toBe(false);
    expect(resolveCoinflip('tails', 'heads').win).toBe(false);
  });

  it('returns the shared multiplier regardless of outcome', () => {
    expect(resolveCoinflip('heads', 'heads').multiplier).toBe(coinflipMultiplier());
    expect(resolveCoinflip('heads', 'tails').multiplier).toBe(coinflipMultiplier());
  });
});

describe('house edge (Monte Carlo)', () => {
  it('average return per unit staked converges to the RTP', () => {
    const call: 'heads' = 'heads';
    const mult = coinflipMultiplier(); // 1.94
    const N = 300_000;
    let wins = 0;
    for (let i = 0; i < N; i++) {
      if (resolveCoinflip(flipCoin(), call).win) wins++;
    }
    const ev = (wins / N) * mult; // expected return per unit staked
    expect(ev).toBeGreaterThan(0.95);
    expect(ev).toBeLessThan(0.99); // centred on RTP 0.97
    expect(COINFLIP.RTP).toBe(0.97);
  });
});
