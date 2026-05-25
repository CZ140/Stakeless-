// Integration: a human at a bot-filled table, driven through the table manager
// directly (no sockets/timers — bots are advanced synchronously via runBotAction).
import { describe, it, expect, beforeEach } from 'vitest';
import { tableManager } from '../src/services/poker/manager.js';
import { resetDb, createUser } from './helpers.js';

async function setupTable(botTarget = 2) {
  const a = await createUser({ balance: 1000 });
  const id = await tableManager.createTable(a.user.id, {
    name: 'Bot Table',
    type: 'public',
    smallBlind: 5,
    bigBlind: 10,
    botTarget,
  });
  return { a, id };
}

// Drive the current hand to completion: bots act via runBotAction, the human
// plays passively (check/call) unless told to fold first.
async function driveHand(id: number, humanId: number, humanFolds = false): Promise<void> {
  let foldedOnce = false;
  for (let guard = 0; guard < 300; guard++) {
    const eng = tableManager._engine(id)!;
    if (!eng.isHandInProgress() || eng.actingIndex === null) return;
    const seat = eng.occupiedSeats().find((s) => s.seatIndex === eng.actingIndex)!;
    if (seat.isBot) {
      await tableManager.runBotAction(id);
    } else {
      const la = eng.legalFor(seat.seatIndex);
      if (humanFolds && !foldedOnce) {
        foldedOnce = true;
        await tableManager.act(humanId, id, { type: 'fold' });
      } else {
        await tableManager.act(humanId, id, la.canCheck ? { type: 'check' } : { type: 'call' });
      }
    }
  }
  throw new Error('driveHand did not terminate');
}

describe('Poker — bots', () => {
  beforeEach(async () => {
    await resetDb();
    tableManager._resetAll();
  });

  it('fills empty seats with bots and starts a hand when a human sits', async () => {
    const { a, id } = await setupTable(2);
    await tableManager.sit(a.user.id, id, 0, 1000);
    const { table } = await tableManager.getView(a.user.id, id);
    expect(table.street).toBe('preflop');
    const occupied = table.seats.filter((s) => s.userId !== null);
    expect(occupied).toHaveLength(3); // 1 human + 2 bots
    expect(occupied.filter((s) => s.isBot)).toHaveLength(2);
    expect(table.actingSeat).toBe(0); // human (UTG) acts first 3-handed
  });

  it('plays a full hand to a result with bots acting', async () => {
    const { a, id } = await setupTable(2);
    await tableManager.sit(a.user.id, id, 0, 1000);
    await driveHand(id, a.user.id, true); // human folds; bots finish heads-up
    const eng = tableManager._engine(id)!;
    expect(eng.isHandInProgress()).toBe(false);
    expect(eng.lastResult).toBeTruthy();
    expect(eng.lastResult!.winners.length).toBeGreaterThanOrEqual(1);
    // Table chips are conserved across the hand (1000 human + 2×1000 bots).
    const total = eng.occupiedSeats().reduce((sum, s) => sum + s.stack, 0);
    expect(total).toBe(3000);
  });

  it('auto-acts for a human who runs out of time (timeout folds/checks)', async () => {
    const { a, id } = await setupTable(2);
    await tableManager.sit(a.user.id, id, 0, 1000);
    const eng = tableManager._engine(id)!;
    expect(eng.actingIndex).toBe(0); // the human
    await tableManager.timeoutCurrentActor(id);
    // The human folded (facing the BB they cannot check), so action moved off seat 0.
    expect(eng.actingIndex).not.toBe(0);
    const human = eng.occupiedSeats().find((s) => s.seatIndex === 0)!;
    expect(human.status).toBe('folded');
  });

  it('deals the next hand on demand once a human is present', async () => {
    const { a, id } = await setupTable(2);
    await tableManager.sit(a.user.id, id, 0, 1000);
    await driveHand(id, a.user.id, true);
    expect(tableManager._engine(id)!.isHandInProgress()).toBe(false);
    const started = await tableManager.startNextHandIfReady(id);
    expect(started).toBe(true);
    expect(tableManager._engine(id)!.isHandInProgress()).toBe(true);
  });
});
