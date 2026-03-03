import { describe, it, expect } from 'vitest';
import {
  createDeck,
  calculateHandValue,
  isBlackjack,
  dealerPlay,
  getOutcome,
  computeProfit,
  type Card,
  type BlackjackSessionState,
} from './blackjackService.js';

// ─── createDeck ──────────────────────────────────────────────────────────────

describe('createDeck', () => {
  it('returns 52 cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
  });

  it('contains no duplicate cards', () => {
    const deck = createDeck();
    const keys = deck.map((c) => `${c.suit}-${c.rank}`);
    const unique = new Set(keys);
    expect(unique.size).toBe(52);
  });

  it('contains all 4 suits', () => {
    const deck = createDeck();
    const suits = new Set(deck.map((c) => c.suit));
    expect(suits).toEqual(new Set(['spades', 'hearts', 'diamonds', 'clubs']));
  });

  it('contains all 13 ranks', () => {
    const deck = createDeck();
    const ranks = new Set(deck.map((c) => c.rank));
    expect(ranks).toEqual(
      new Set(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']),
    );
  });

  it('produces different orderings on repeated calls (shuffle is random)', () => {
    const deck1 = createDeck();
    const deck2 = createDeck();
    const keys1 = deck1.map((c) => `${c.suit}-${c.rank}`).join(',');
    const keys2 = deck2.map((c) => `${c.suit}-${c.rank}`).join(',');
    // Astronomically unlikely to be equal — if this flakes, something is wrong
    expect(keys1).not.toBe(keys2);
  });
});

// ─── calculateHandValue ───────────────────────────────────────────────────────

describe('calculateHandValue', () => {
  const card = (rank: Card['rank']): Card => ({ suit: 'spades', rank });

  it('A + K → { value: 21, isSoft: true } (ace counts as 11)', () => {
    expect(calculateHandValue([card('A'), card('K')])).toEqual({ value: 21, isSoft: true });
  });

  it('A + A → { value: 12, isSoft: true } (first ace 11, second forced to 1)', () => {
    expect(calculateHandValue([card('A'), card('A')])).toEqual({ value: 12, isSoft: true });
  });

  it('A + K + 5 → { value: 16, isSoft: false } (ace reduced to 1 to avoid bust)', () => {
    expect(calculateHandValue([card('A'), card('K'), card('5')])).toEqual({
      value: 16,
      isSoft: false,
    });
  });

  it('10 + J → { value: 20, isSoft: false }', () => {
    expect(calculateHandValue([card('10'), card('J')])).toEqual({ value: 20, isSoft: false });
  });

  it('2 + 3 + 4 → { value: 9, isSoft: false }', () => {
    expect(calculateHandValue([card('2'), card('3'), card('4')])).toEqual({
      value: 9,
      isSoft: false,
    });
  });

  it('A + 6 → { value: 17, isSoft: true } (soft 17)', () => {
    expect(calculateHandValue([card('A'), card('6')])).toEqual({ value: 17, isSoft: true });
  });

  it('A + 7 → { value: 18, isSoft: true } (soft 18)', () => {
    expect(calculateHandValue([card('A'), card('7')])).toEqual({ value: 18, isSoft: true });
  });

  it('Q + K → { value: 20, isSoft: false } (face cards are 10)', () => {
    expect(calculateHandValue([card('Q'), card('K')])).toEqual({ value: 20, isSoft: false });
  });

  it('A + 2 + 3 + 4 + 5 → { value: 15, isSoft: false } (5-card hand, ace reduced)', () => {
    expect(
      calculateHandValue([card('A'), card('2'), card('3'), card('4'), card('5')]),
    ).toEqual({ value: 15, isSoft: false });
  });
});

// ─── isBlackjack ──────────────────────────────────────────────────────────────

describe('isBlackjack', () => {
  const card = (rank: Card['rank']): Card => ({ suit: 'hearts', rank });

  it('A + K → true', () => {
    expect(isBlackjack([card('A'), card('K')])).toBe(true);
  });

  it('A + Q → true', () => {
    expect(isBlackjack([card('A'), card('Q')])).toBe(true);
  });

  it('A + J → true', () => {
    expect(isBlackjack([card('A'), card('J')])).toBe(true);
  });

  it('A + 10 → true', () => {
    expect(isBlackjack([card('A'), card('10')])).toBe(true);
  });

  it('K + A → true (order does not matter)', () => {
    expect(isBlackjack([card('K'), card('A')])).toBe(true);
  });

  it('A + K + extra card → false (3 cards is not a natural)', () => {
    expect(isBlackjack([card('A'), card('K'), card('2')])).toBe(false);
  });

  it('10 + J → false (no ace)', () => {
    expect(isBlackjack([card('10'), card('J')])).toBe(false);
  });

  it('A + 9 → false (only 20)', () => {
    expect(isBlackjack([card('A'), card('9')])).toBe(false);
  });
});

// ─── dealerPlay ───────────────────────────────────────────────────────────────

describe('dealerPlay', () => {
  const card = (rank: Card['rank']): Card => ({ suit: 'clubs', rank });

  function makeState(dealerHand: Card[], deckCards: Card[]): BlackjackSessionState {
    return {
      deck: deckCards,
      playerHand: [card('8'), card('9')], // irrelevant for dealer logic
      dealerHand,
      phase: 'dealer_turn',
      outcome: null,
      isDoubled: false,
    };
  }

  it('stands on hard 17 (10 + 7) — no cards drawn', () => {
    const state = makeState([card('10'), card('7')], [card('5'), card('6')]);
    const result = dealerPlay(state);
    expect(result.dealerHand).toHaveLength(2);
    expect(calculateHandValue(result.dealerHand).value).toBe(17);
  });

  it('hits on soft 17 (A + 6) — dealer must draw', () => {
    const state = makeState([card('A'), card('6')], [card('2'), card('K')]);
    const result = dealerPlay(state);
    // Dealer had soft 17, must draw at least once
    expect(result.dealerHand.length).toBeGreaterThan(2);
  });

  it('stands on soft 18 (A + 7) — no cards drawn', () => {
    const state = makeState([card('A'), card('7')], [card('2'), card('K')]);
    const result = dealerPlay(state);
    expect(result.dealerHand).toHaveLength(2);
    expect(calculateHandValue(result.dealerHand).value).toBe(18);
  });

  it('stands on hard 18 — no cards drawn', () => {
    const state = makeState([card('10'), card('8')], [card('2'), card('K')]);
    const result = dealerPlay(state);
    expect(result.dealerHand).toHaveLength(2);
  });

  it('hits on hard 16 (10 + 6) — dealer must draw', () => {
    const state = makeState([card('10'), card('6')], [card('5'), card('K')]);
    const result = dealerPlay(state);
    expect(result.dealerHand.length).toBeGreaterThan(2);
  });

  it('dealer can bust (10 + 6 + K = 26)', () => {
    const state = makeState([card('10'), card('6')], [card('K')]);
    const result = dealerPlay(state);
    expect(calculateHandValue(result.dealerHand).value).toBe(26);
    expect(result.dealerHand).toHaveLength(3);
  });

  it('does not mutate the original state object', () => {
    const original = makeState([card('10'), card('6')], [card('5')]);
    const originalDealerLen = original.dealerHand.length;
    dealerPlay(original);
    expect(original.dealerHand).toHaveLength(originalDealerLen);
  });
});

// ─── getOutcome ───────────────────────────────────────────────────────────────

describe('getOutcome', () => {
  const card = (rank: Card['rank']): Card => ({ suit: 'diamonds', rank });

  it('player_blackjack: player has A+K, dealer has 10+8', () => {
    expect(getOutcome([card('A'), card('K')], [card('10'), card('8')])).toBe('player_blackjack');
  });

  it('push: both have blackjack (A+K vs A+Q)', () => {
    // Both have natural 21 with 2 cards → push
    expect(getOutcome([card('A'), card('K')], [card('A'), card('Q')])).toBe('push');
  });

  it('player_bust: player has 10+K+5 (25)', () => {
    expect(getOutcome([card('10'), card('K'), card('5')], [card('10'), card('7')])).toBe(
      'player_bust',
    );
  });

  it('dealer_bust: dealer has 10+K+5 (25), player has 18', () => {
    expect(getOutcome([card('10'), card('8')], [card('10'), card('K'), card('5')])).toBe(
      'dealer_bust',
    );
  });

  it('player_win: player 20 vs dealer 19', () => {
    expect(getOutcome([card('10'), card('K')], [card('10'), card('9')])).toBe('player_win');
  });

  it('dealer_win: dealer 20 vs player 19', () => {
    expect(getOutcome([card('10'), card('9')], [card('10'), card('K')])).toBe('dealer_win');
  });

  it('push: both 20', () => {
    expect(getOutcome([card('10'), card('K')], [card('10'), card('Q')])).toBe('push');
  });

  it('push: both 17', () => {
    expect(getOutcome([card('10'), card('7')], [card('9'), card('8')])).toBe('push');
  });
});

// ─── computeProfit ────────────────────────────────────────────────────────────

describe('computeProfit', () => {
  it('player_blackjack: betAmount=100 → profit=150 (3:2 = 100+50)', () => {
    // deductBet took 100; settle credits 150 → net +50 for player (3:2 payout)
    expect(computeProfit('player_blackjack', 100)).toBe(150);
  });

  it('player_blackjack: betAmount=200 → profit=300', () => {
    expect(computeProfit('player_blackjack', 200)).toBe(300);
  });

  it('player_blackjack: betAmount=101 → profit=151 (floor of 0.5×101=50, +101)', () => {
    // Math.floor(101 * 0.5) = 50; profit = 101 + 50 = 151
    expect(computeProfit('player_blackjack', 101)).toBe(151);
  });

  it('player_win: betAmount=100 → profit=100 (1:1 even money)', () => {
    expect(computeProfit('player_win', 100)).toBe(100);
  });

  it('dealer_win: profit=0 (loss)', () => {
    expect(computeProfit('dealer_win', 100)).toBe(0);
  });

  it('player_bust: profit=0 (loss)', () => {
    expect(computeProfit('player_bust', 100)).toBe(0);
  });

  it('dealer_bust: betAmount=100 → profit=100 (player wins 1:1)', () => {
    expect(computeProfit('dealer_bust', 100)).toBe(100);
  });

  it('push: betAmount=100 → profit=100 (stake returned)', () => {
    expect(computeProfit('push', 100)).toBe(100);
  });
});
