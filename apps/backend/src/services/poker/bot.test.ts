import { describe, it, expect } from 'vitest';
import { cardFromString, type Card, type LegalActions } from '@gambling/shared';
import { handStrength, decideBotAction, type BotView } from './bot.js';

const cards = (s: string): Card[] => s.split(' ').map(cardFromString);
const fixed = (v: number) => () => v; // deterministic rng

describe('handStrength', () => {
  it('rates premium hands high and junk low', () => {
    expect(handStrength(cards('As Ah'), [], fixed(0.5))).toBeGreaterThan(0.9); // AA
    expect(handStrength(cards('7d 2c'), [], fixed(0.5))).toBeLessThan(0.4); // 72o
    expect(handStrength(cards('Ks Qs'), [], fixed(0.5))).toBeGreaterThan(handStrength(cards('Ks Qd'), [], fixed(0.5))); // suited > offsuit
  });

  it('uses the made hand once a board is out', () => {
    // A made flush should rate well above two unconnected high cards on the same board.
    const board = cards('2h 7h Kh 9c 4d');
    expect(handStrength(cards('Ah 5h'), board, fixed(0.5))).toBeGreaterThan(0.8); // nut flush
    expect(handStrength(cards('Ad Kd'), board, fixed(0.5))).toBeLessThan(0.6); // just a pair of kings
  });
});

const legal = (over: Partial<LegalActions>): LegalActions => ({
  canFold: true,
  canCheck: false,
  canCall: true,
  callAmount: 0,
  canRaise: true,
  minRaiseTo: 20,
  maxRaiseTo: 1000,
  ...over,
});

describe('decideBotAction', () => {
  it('bets a monster when checked to', () => {
    const view: BotView = {
      holeCards: cards('As Ah'),
      board: [],
      legal: legal({ canCheck: true, canCall: false, callAmount: 0 }),
      pot: 15,
      toCall: 0,
      currentBet: 0,
      committedThisStreet: 0,
      bigBlind: 10,
      stack: 1000,
    };
    const a = decideBotAction(view, fixed(0.5));
    expect(a.type).toBe('raise');
    expect(a.amount).toBeGreaterThanOrEqual(20);
    expect(a.amount).toBeLessThanOrEqual(1000);
  });

  it('folds junk facing a big bet', () => {
    const view: BotView = {
      holeCards: cards('7d 2c'),
      board: [],
      legal: legal({ canCheck: false, callAmount: 200, minRaiseTo: 400 }),
      pot: 300,
      toCall: 200,
      currentBet: 200,
      committedThisStreet: 0,
      bigBlind: 10,
      stack: 1000,
    };
    expect(decideBotAction(view, fixed(0.9)).type).toBe('fold');
  });

  it('calls a small bet with decent odds', () => {
    const view: BotView = {
      holeCards: cards('Kh Kd'),
      board: cards('2c 7d 9s'), // pair of kings (strength ~0.42, below the raise threshold)
      legal: legal({ canCheck: false, callAmount: 10 }),
      pot: 100,
      toCall: 10,
      currentBet: 10,
      committedThisStreet: 0,
      bigBlind: 10,
      stack: 1000,
    };
    expect(decideBotAction(view, fixed(0.5)).type).toBe('call');
  });
});
