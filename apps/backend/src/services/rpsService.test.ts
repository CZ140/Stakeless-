import { describe, it, expect } from 'vitest';
import {
  RPS,
  RPS_CHOICES,
  rpsBeats,
  rpsOutcome,
  rpsWinMultiplier,
  rpsPayoutMultiplier,
  type RpsChoice,
} from '@gambling/shared';
import { throwRps, resolveRps } from './rpsService.js';

describe('throwRps', () => {
  it('always returns a valid choice', () => {
    const valid = new Set(RPS_CHOICES);
    for (let i = 0; i < 5000; i++) expect(valid.has(throwRps())).toBe(true);
  });

  it('is roughly uniform over the three throws', () => {
    const N = 300_000;
    const counts: Record<RpsChoice, number> = { rock: 0, paper: 0, scissors: 0 };
    for (let i = 0; i < N; i++) counts[throwRps()]++;
    const expected = N / 3;
    for (const c of RPS_CHOICES) {
      expect(counts[c]).toBeGreaterThan(expected * 0.95);
      expect(counts[c]).toBeLessThan(expected * 1.05);
    }
  });
});

describe('rpsBeats / rpsOutcome', () => {
  it('encodes the classic rules', () => {
    expect(rpsBeats('rock', 'scissors')).toBe(true);
    expect(rpsBeats('paper', 'rock')).toBe(true);
    expect(rpsBeats('scissors', 'paper')).toBe(true);
    expect(rpsBeats('rock', 'paper')).toBe(false);
    expect(rpsBeats('rock', 'rock')).toBe(false);
  });

  it('resolves all nine matchups from the player view', () => {
    for (const p of RPS_CHOICES) {
      for (const h of RPS_CHOICES) {
        const o = rpsOutcome(p, h);
        if (p === h) expect(o).toBe('tie');
        else if (rpsBeats(p, h)) expect(o).toBe('win');
        else expect(o).toBe('loss');
      }
    }
  });
});

describe('payout multipliers', () => {
  it('win pays 1.91× (3·RTP − 1)', () => {
    expect(rpsWinMultiplier()).toBe(1.91);
    expect(rpsPayoutMultiplier('win')).toBe(1.91);
  });

  it('tie pushes (1×) and loss pays 0×', () => {
    expect(rpsPayoutMultiplier('tie')).toBe(1);
    expect(rpsPayoutMultiplier('loss')).toBe(0);
  });
});

describe('resolveRps', () => {
  it('pairs the outcome with the matching payout multiplier', () => {
    expect(resolveRps('scissors', 'rock')).toEqual({ outcome: 'win', multiplier: 1.91 });
    expect(resolveRps('rock', 'rock')).toEqual({ outcome: 'tie', multiplier: 1 });
    expect(resolveRps('paper', 'rock')).toEqual({ outcome: 'loss', multiplier: 0 });
  });
});

describe('house edge (Monte Carlo)', () => {
  it('average return per unit staked converges to the RTP', () => {
    // Fix the player's throw; the (uniform) house decides the outcome. A tie
    // returns the stake (1×), a win pays 1.91×, a loss 0×.
    const choice: RpsChoice = 'rock';
    const N = 600_000;
    let total = 0;
    for (let i = 0; i < N; i++) {
      const { multiplier } = resolveRps(throwRps(), choice);
      total += multiplier; // multiplier already encodes push (1×) / win / loss
    }
    const ev = total / N;
    expect(ev).toBeGreaterThan(0.95);
    expect(ev).toBeLessThan(0.99); // centred on RTP 0.97
    expect(RPS.RTP).toBe(0.97);
  });
});
