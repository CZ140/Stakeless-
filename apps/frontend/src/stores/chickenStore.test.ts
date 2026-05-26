import { describe, it, expect, beforeEach } from 'vitest';
import { useChickenStore } from './chickenStore';

// The Chicken ladder store is a representative session store (start → advance →
// cash-out / death → reset, plus the session "recent rounds" strip). Testing its
// transitions guards the round lifecycle the page UI depends on.
describe('chickenStore', () => {
  beforeEach(() => {
    useChickenStore.getState().reset();
    useChickenStore.setState({ recent: [] }); // reset() intentionally keeps the session strip
  });

  it('setBetAmount floors fractional input and clamps to >= 1', () => {
    const { setBetAmount } = useChickenStore.getState();
    setBetAmount(12.9);
    expect(useChickenStore.getState().betAmount).toBe(12);
    setBetAmount(0);
    expect(useChickenStore.getState().betAmount).toBe(1);
    setBetAmount(-5);
    expect(useChickenStore.getState().betAmount).toBe(1);
  });

  it('drives a winning round: start → advance → cash-out', () => {
    const s = useChickenStore.getState();
    s.startRound({ sessionId: 7, maxLanes: 9 });
    expect(useChickenStore.getState()).toMatchObject({ phase: 'active', sessionId: 7, lane: 0, multiplier: 1 });

    s.applyAdvance({ lane: 1, multiplier: 1.21, crossed: false });
    expect(useChickenStore.getState().lane).toBe(1);
    expect(useChickenStore.getState().multiplier).toBeCloseTo(1.21);

    s.applyCashout({ payout: 121, multiplier: 1.21, lane: 1 });
    const st = useChickenStore.getState();
    expect(st.phase).toBe('result');
    expect(st.result).toMatchObject({ won: true, payout: 121, lane: 1, dead: false });
    expect(st.recent[0]).toMatchObject({ won: true, multiplier: 1.21, lanes: 1 });
  });

  it('ends a round as a loss on death and records it', () => {
    const s = useChickenStore.getState();
    s.startRound({ sessionId: 8, maxLanes: 12 });
    s.applyAdvance({ lane: 3, multiplier: 2, crossed: false });
    s.applyDeath({ lane: 4, multiplier: 2 });
    const st = useChickenStore.getState();
    expect(st.phase).toBe('result');
    expect(st.deadLane).toBe(4);
    expect(st.result).toMatchObject({ won: false, dead: true, payout: 0 });
    expect(st.recent[0]).toMatchObject({ won: false, lanes: 4 });
  });

  it('caps the recent strip at 12 rounds, newest first', () => {
    const s = useChickenStore.getState();
    for (let i = 0; i < 15; i++) {
      s.startRound({ sessionId: i, maxLanes: 9 });
      s.applyCashout({ payout: 10, multiplier: 1 + i / 10, lane: i });
    }
    const recent = useChickenStore.getState().recent;
    expect(recent).toHaveLength(12);
    expect(recent[0]!.lanes).toBe(14); // most recent round
  });

  it('reset returns to the betting phase and clears the session', () => {
    const s = useChickenStore.getState();
    s.startRound({ sessionId: 1, maxLanes: 9 });
    s.reset();
    expect(useChickenStore.getState().phase).toBe('betting');
    expect(useChickenStore.getState().sessionId).toBeNull();
  });
});
