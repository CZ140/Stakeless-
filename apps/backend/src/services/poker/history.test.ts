import { describe, it, expect, beforeEach } from 'vitest';
import type { PokerHandResult } from '@gambling/shared';
import { recordHand, handHistory, clearHistory } from './history.js';

const hand = (handNumber: number): PokerHandResult => ({
  handNumber,
  board: [],
  potTotal: 100,
  showdown: false,
  seats: [],
  winners: [],
});

describe('poker hand history', () => {
  beforeEach(() => clearHistory());

  it('returns recent hands most-recent-first, per table', () => {
    recordHand(1, hand(1));
    recordHand(1, hand(2));
    recordHand(2, hand(9)); // a different table
    expect(handHistory(1).map((h) => h.handNumber)).toEqual([2, 1]);
    expect(handHistory(2).map((h) => h.handNumber)).toEqual([9]);
    expect(handHistory(99)).toEqual([]); // unknown table is empty
  });

  it('caps history to the most recent 30 hands (ring buffer)', () => {
    for (let i = 1; i <= 40; i++) recordHand(1, hand(i));
    const hist = handHistory(1);
    expect(hist).toHaveLength(30);
    expect(hist[0]!.handNumber).toBe(40); // newest first
    expect(hist[29]!.handNumber).toBe(11); // oldest retained (1..10 dropped)
  });

  it('clears a single table or everything', () => {
    recordHand(1, hand(1));
    recordHand(2, hand(1));
    clearHistory(1);
    expect(handHistory(1)).toEqual([]);
    expect(handHistory(2)).toHaveLength(1);
    clearHistory();
    expect(handHistory(2)).toEqual([]);
  });
});
