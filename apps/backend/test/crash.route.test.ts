import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { gameLogs } from '../src/db/schema.js';
import { resetDb, createUser, getBalance } from './helpers.js';

const app = createApp();

function bearer(path: string, token: string) {
  return request(app).post(path).set('Authorization', `Bearer ${token}`);
}

describe('Crash routes — money path', () => {
  beforeEach(resetDb);

  it('rejects unauthenticated start', async () => {
    const res = await request(app).post('/api/games/crash/start').send({ betAmount: 10 });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid bet shape and an out-of-range auto cash-out', async () => {
    const { token } = await createUser();
    expect((await bearer('/api/games/crash/start', token).send({ betAmount: 0 })).status).toBe(400);
    expect((await bearer('/api/games/crash/start', token).send({ betAmount: 10, autoCashout: 1.0 })).status).toBe(400);
  });

  it('rejects a bet larger than the balance with 402', async () => {
    const { token } = await createUser({ balance: 50 });
    const res = await bearer('/api/games/crash/start', token).send({ betAmount: 100 });
    expect(res.status).toBe(402);
  });

  it('deducts the stake on start and never reveals the crash point', async () => {
    const { user, token } = await createUser({ balance: 1000 });
    const res = await bearer('/api/games/crash/start', token).send({ betAmount: 100 });
    expect(res.status).toBe(200);
    expect(typeof res.body.sessionId).toBe('number');
    expect(typeof res.body.startedAt).toBe('number');
    expect(res.body.newBalance).toBe(900);
    expect(res.body.crashPoint).toBeUndefined(); // hidden — the whole point of Crash
    expect(await getBalance(user.id)).toBe(900);

    // clean up the round's timers
    await bearer('/api/games/crash/cashout', token).send({ sessionId: res.body.sessionId });
  });

  it('rejects a second start while a round is in progress (409)', async () => {
    const { token } = await createUser({ balance: 1000 });
    const first = await bearer('/api/games/crash/start', token).send({ betAmount: 100, autoCashout: 100 });
    expect(first.status).toBe(200);

    const second = await bearer('/api/games/crash/start', token).send({ betAmount: 100 });
    expect(second.status).toBe(409);
    expect(second.body.session.sessionId).toBe(first.body.sessionId);

    await bearer('/api/games/crash/cashout', token).send({ sessionId: first.body.sessionId });
  });

  it('cashes out at the live multiplier, keeping the balance consistent', async () => {
    const { user, token } = await createUser({ balance: 100_000 });
    let expectedBalance = 100_000;
    let sawWin = false;

    for (let i = 0; i < 15 && !sawWin; i++) {
      const start = await bearer('/api/games/crash/start', token).send({ betAmount: 100 });
      expect(start.status).toBe(200);
      expectedBalance -= 100; // stake deducted immediately
      expect(await getBalance(user.id)).toBe(expectedBalance);

      const cash = await bearer('/api/games/crash/cashout', token).send({ sessionId: start.body.sessionId });
      expect(cash.status).toBe(200);
      if (cash.body.win) {
        // An immediate cash-out lands at ~1.00× (payout = floor(bet × multiplier)).
        expect(cash.body.multiplier).toBeGreaterThanOrEqual(1.0);
        expect(cash.body.payout).toBe(Math.floor(100 * cash.body.multiplier));
        expectedBalance += cash.body.payout;
        sawWin = true;
      }
      // On a (rare) instabust the round was already lost; stake stays gone.
      expect(await getBalance(user.id)).toBe(expectedBalance);
    }
    expect(sawWin).toBe(true);

    // Every settled round is logged as 'crash'.
    const logs = await db.select().from(gameLogs).where(eq(gameLogs.userId, user.id));
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.gameType === 'crash')).toBe(true);
  });

  it('reports alreadySettled on a second cash-out of the same round', async () => {
    const { token } = await createUser({ balance: 1000 });
    const start = await bearer('/api/games/crash/start', token).send({ betAmount: 100 });
    const first = await bearer('/api/games/crash/cashout', token).send({ sessionId: start.body.sessionId });
    expect(first.status).toBe(200);
    const second = await bearer('/api/games/crash/cashout', token).send({ sessionId: start.body.sessionId });
    expect(second.status).toBe(200);
    expect(second.body.alreadySettled).toBe(true);
  });

  it('resumes an in-progress round via active-session, then nulls once settled', async () => {
    const { token } = await createUser({ balance: 1000 });
    const start = await bearer('/api/games/crash/start', token).send({ betAmount: 100, autoCashout: 100 });

    const resume = await request(app)
      .get('/api/games/crash/active-session')
      .set('Authorization', `Bearer ${token}`);
    expect(resume.status).toBe(200);
    expect(resume.body.session.sessionId).toBe(start.body.sessionId);
    expect(typeof resume.body.session.startedAt).toBe('number');

    await bearer('/api/games/crash/cashout', token).send({ sessionId: start.body.sessionId });

    const after = await request(app)
      .get('/api/games/crash/active-session')
      .set('Authorization', `Bearer ${token}`);
    expect(after.body.session).toBeNull();
  });
});
