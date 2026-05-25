// Integration: bots are optional and added on demand by a seated player. Driven
// through the table manager directly (no sockets/timers — bots advance via
// runBotAction synchronously).
import { describe, it, expect, beforeEach } from 'vitest';
import { tableManager } from '../src/services/poker/manager.js';
import { resetDb, createUser } from './helpers.js';

// Create a table, seat the human at 0, and add bots at the given seats.
async function seatWithBots(botSeats: number[]) {
  const a = await createUser({ balance: 1000 });
  const id = await tableManager.createTable(a.user.id, {
    name: 'Bot Table',
    type: 'public',
    smallBlind: 5,
    bigBlind: 10,
  });
  await tableManager.sit(a.user.id, id, 0, 1000);
  for (const s of botSeats) await tableManager.addBot(a.user.id, id, s);
  return { a, id };
}

// Drive the current hand to completion: bots act via runBotAction; the human
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

describe('Poker — optional bots', () => {
  beforeEach(async () => {
    await resetDb();
    tableManager._resetAll();
  });

  it('does NOT auto-fill bots when a human sits (table waits)', async () => {
    const a = await createUser({ balance: 1000 });
    const id = await tableManager.createTable(a.user.id, { name: 'T', type: 'public', smallBlind: 5, bigBlind: 10 });
    await tableManager.sit(a.user.id, id, 0, 1000);
    const { table } = await tableManager.getView(a.user.id, id);
    expect(table.seats.filter((s) => s.userId !== null)).toHaveLength(1); // just the human
    expect(table.street).toBe('idle'); // no opponents → no hand
  });

  it('adds a bot on demand and starts a hand', async () => {
    const { a, id } = await seatWithBots([1]);
    const { table } = await tableManager.getView(a.user.id, id);
    expect(table.street).toBe('preflop');
    const occupied = table.seats.filter((s) => s.userId !== null);
    expect(occupied).toHaveLength(2);
    expect(occupied.filter((s) => s.isBot)).toHaveLength(1);
  });

  it('refuses to add a bot unless you are seated at the table', async () => {
    const a = await createUser({ balance: 1000 });
    const b = await createUser({ balance: 1000 });
    const id = await tableManager.createTable(a.user.id, { name: 'T', type: 'public', smallBlind: 5, bigBlind: 10 });
    await expect(tableManager.addBot(b.user.id, id, 0)).rejects.toMatchObject({ code: 'NOT_SEATED' });
  });

  it('plays a hand to a result with the bot acting (passive showdown)', async () => {
    const { a, id } = await seatWithBots([1]);
    await driveHand(id, a.user.id, false); // human checks/calls; bot acts each street
    const eng = tableManager._engine(id)!;
    expect(eng.isHandInProgress()).toBe(false);
    expect(eng.lastResult).toBeTruthy();
    expect(eng.lastResult!.winners.length).toBeGreaterThanOrEqual(1);
  });

  it('auto-acts for a human who runs out of time', async () => {
    const { a, id } = await seatWithBots([1]);
    const eng = tableManager._engine(id)!;
    expect(eng.actingIndex).toBe(0); // human (heads-up SB) acts first
    await tableManager.timeoutCurrentActor(id);
    const human = eng.occupiedSeats().find((s) => s.seatIndex === 0)!;
    expect(human.status).toBe('folded'); // facing the BB, the timeout folds
  });

  it('removes a bot mid-hand and ends the hand if it was heads-up', async () => {
    const { a, id } = await seatWithBots([1]);
    await tableManager.removeBot(a.user.id, id, 1);
    const { table } = await tableManager.getView(a.user.id, id);
    expect(table.seats.filter((s) => s.userId !== null)).toHaveLength(1); // bot gone
    expect(tableManager._engine(id)!.isHandInProgress()).toBe(false);
  });

  it('deals the next hand on demand', async () => {
    const { a, id } = await seatWithBots([1]);
    await driveHand(id, a.user.id, false);
    expect(await tableManager.startNextHandIfReady(id)).toBe(true);
    expect(tableManager._engine(id)!.isHandInProgress()).toBe(true);
  });
});
