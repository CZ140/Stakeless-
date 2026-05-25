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

  it('grades pairs by texture — top/over pair beats bottom pair, kicker matters', () => {
    const board = cards('Kc 8d 3h'); // dry, rainbow
    const topTop = handStrength(cards('Ks Qd'), board, fixed(0.5)); // top pair, big kicker
    const topWeak = handStrength(cards('Kh 4c'), board, fixed(0.5)); // top pair, weak kicker
    const bottom = handStrength(cards('3d 5c'), board, fixed(0.5)); // bottom pair
    const overpair = handStrength(cards('As Ad'), board, fixed(0.5)); // overpair
    expect(topTop).toBeGreaterThan(topWeak);
    expect(topWeak).toBeGreaterThan(bottom);
    expect(overpair).toBeGreaterThan(topTop);
    expect(bottom).toBeLessThan(0.42); // a flat per-category model would have rated this 0.42
  });

  it('credits live draws far above the same cards with no draw', () => {
    const drawBoard = cards('2s 7s Kd'); // two spades out
    const flushDraw = handStrength(cards('Qs Js'), drawBoard, fixed(0.5)); // 4 to a flush
    const noDraw = handStrength(cards('Qc Jh'), drawBoard, fixed(0.5)); // same ranks, offsuit, no draw
    expect(flushDraw).toBeGreaterThan(noDraw);
    expect(flushDraw).toBeGreaterThan(0.3); // a real drawing hand, not junk
    expect(flushDraw).toBeLessThan(0.6); // but not as good as a made strong hand
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

  const drawView = (over: Partial<BotView>): BotView => ({
    holeCards: cards('Qs Js'),
    board: cards('2s 7s Kd'), // flush draw, 9 outs (~0.36 equity on the flop)
    legal: legal({ canCheck: false }),
    pot: 100,
    toCall: 30,
    currentBet: 30,
    committedThisStreet: 0,
    bigBlind: 10,
    stack: 1000,
    ...over,
  });

  it('calls with a flush draw getting the right price but folds it at a bad price', () => {
    // Priced in: 30 to win 130 → ~23% needed, ~36% equity.
    expect(decideBotAction(drawView({}), fixed(0.9)).type).toBe('call');
    // Overpriced: 300 to win 400 → 60% needed, far above the draw's equity.
    expect(decideBotAction(drawView({ pot: 100, toCall: 300, currentBet: 300 }), fixed(0.9)).type).toBe('fold');
  });

  it('semi-bluff raises a monster combo draw some of the time', () => {
    const view: BotView = {
      holeCards: cards('Ts 9s'),
      board: cards('Js 8s 2d'), // flush draw + open-ended straight draw (~0.47 equity)
      legal: legal({ canCheck: false }),
      pot: 100,
      toCall: 50,
      currentBet: 50,
      committedThisStreet: 0,
      bigBlind: 10,
      stack: 1000,
    };
    expect(decideBotAction(view, fixed(0.1)).type).toBe('raise'); // r below the semi-bluff gate
  });

  it('tightens up multiway — a marginal pair that calls heads-up folds 5-way', () => {
    const base = (players: number): BotView => ({
      holeCards: cards('8d 2c'),
      board: cards('Ks 8h 3c'), // second pair, weak kicker (~0.40)
      legal: legal({ canCheck: false, callAmount: 30, minRaiseTo: 90 }),
      pot: 70,
      toCall: 30, // pot odds 0.30
      currentBet: 30,
      committedThisStreet: 0,
      bigBlind: 10,
      stack: 1000,
      activePlayers: players,
    });
    expect(decideBotAction(base(2), fixed(0.5)).type).toBe('call'); // heads-up
    expect(decideBotAction(base(5), fixed(0.5)).type).toBe('fold'); // 5-way → discounted below the price
  });
});
