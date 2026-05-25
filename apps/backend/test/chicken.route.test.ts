import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { gameLogs } from '../src/db/schema.js';
import { resetDb, createUser, getBalance } from './helpers.js';

const app = createApp();

function auth(method: 'post' | 'get', path: string, token: string) {
  return request(app)[method](path).set('Authorization', `Bearer ${token}`);
}

describe('Chicken routes — money path', () => {
  beforeEach(resetDb);

  it('rejects unauthenticated start', async () => {
    const res = await request(app).post('/api/games/chicken/start').send({ betAmount: 10, difficulty: 'easy' });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid bet shape with 400', async () => {
    const { token } = await createUser();
    const res = await auth('post', '/api/games/chicken/start', token).send({ betAmount: 0, difficulty: 'easy' });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown difficulty with 400', async () => {
    const { token } = await createUser({ balance: 1000 });
    const res = await auth('post', '/api/games/chicken/start', token).send({ betAmount: 10, difficulty: 'nightmare' });
    expect(res.status).toBe(400);
  });

  it('rejects a bet larger than the balance with 402', async () => {
    const { token } = await createUser({ balance: 50 });
    const res = await auth('post', '/api/games/chicken/start', token).send({ betAmount: 100, difficulty: 'easy' });
    expect(res.status).toBe(402);
  });

  it('starts a round, deducting the bet and reporting maxLanes', async () => {
    const { user, token } = await createUser({ balance: 1000 });
    const res = await auth('post', '/api/games/chicken/start', token).send({ betAmount: 100, difficulty: 'medium' });
    expect(res.status).toBe(200);
    const body = res.body as { sessionId: number; difficulty: string; lane: number; multiplier: number; maxLanes: number };
    expect(body.sessionId).toBeGreaterThan(0);
    expect(body.difficulty).toBe('medium');
    expect(body.lane).toBe(0);
    expect(body.multiplier).toBe(1);
    expect(body.maxLanes).toBe(22); // medium: 25 tiles − 3 deadly
    expect(await getBalance(user.id)).toBe(900); // stake deducted up front
  });

  it('rejects a second concurrent round with 409', async () => {
    const { token } = await createUser({ balance: 1000 });
    await auth('post', '/api/games/chicken/start', token).send({ betAmount: 100, difficulty: 'easy' });
    const dup = await auth('post', '/api/games/chicken/start', token).send({ betAmount: 100, difficulty: 'easy' });
    expect(dup.status).toBe(409);
  });

  it('refuses to cash out before any lane', async () => {
    const { token } = await createUser({ balance: 1000 });
    const start = await auth('post', '/api/games/chicken/start', token).send({ betAmount: 100, difficulty: 'easy' });
    const res = await auth('post', '/api/games/chicken/cashout', token).send({ sessionId: start.body.sessionId });
    expect(res.status).toBe(400);
  });

  it('settles a cash-out consistent with the cumulative multiplier', async () => {
    // Easy clears the first lane ~90% of the time; retry until one survives.
    const { user, token } = await createUser({ balance: 1_000_000 });
    let cashedOut = false;

    for (let attempt = 0; attempt < 60 && !cashedOut; attempt++) {
      const before = await getBalance(user.id);
      const start = await auth('post', '/api/games/chicken/start', token).send({ betAmount: 100, difficulty: 'easy' });
      expect(start.status).toBe(200);
      const sessionId = start.body.sessionId as number;
      expect(await getBalance(user.id)).toBe(before - 100);

      const step = await auth('post', '/api/games/chicken/step', token).send({ sessionId });
      expect(step.status).toBe(200);

      if (step.body.dead) {
        expect(await getBalance(user.id)).toBe(before - 100); // lost the stake
        continue;
      }

      expect(step.body.lane).toBe(1);
      const cash = await auth('post', '/api/games/chicken/cashout', token).send({ sessionId });
      expect(cash.status).toBe(200);
      const { payout, newBalance, multiplier, lane } = cash.body as {
        payout: number; newBalance: number; multiplier: number; lane: number;
      };
      expect(lane).toBe(1);
      expect(payout).toBe(Math.floor(100 * multiplier));
      expect(newBalance).toBe(before - 100 + payout);
      expect(await getBalance(user.id)).toBe(newBalance);

      const logs = await db.select().from(gameLogs).where(eq(gameLogs.userId, user.id));
      expect(logs.some((l) => l.gameType === 'chicken')).toBe(true);
      cashedOut = true;
    }

    expect(cashedOut).toBe(true);
  });

  it('dies on the road, settling a loss and closing the session', async () => {
    // Daredevil kills 55% per lane — a run dies quickly. Keep stepping until it does.
    const { user, token } = await createUser({ balance: 1_000_000 });
    const before = await getBalance(user.id);
    const start = await auth('post', '/api/games/chicken/start', token).send({ betAmount: 100, difficulty: 'daredevil' });
    const sessionId = start.body.sessionId as number;

    let dead = false;
    for (let i = 0; i < 60 && !dead; i++) {
      const step = await auth('post', '/api/games/chicken/step', token).send({ sessionId });
      if (step.status === 400) break; // crossed the whole road (improbable) — stop
      expect(step.status).toBe(200);
      if (step.body.dead) dead = true;
      else if (step.body.crossed) break;
    }
    expect(dead).toBe(true);

    // No credit on a death; balance stays at the post-deduct amount.
    expect(await getBalance(user.id)).toBe(before - 100);

    // The session is closed — resume returns nothing.
    const active = await auth('get', '/api/games/chicken/active-session', token).send();
    expect(active.body.session).toBeNull();

    const logs = await db.select().from(gameLogs).where(eq(gameLogs.userId, user.id));
    expect(logs.some((l) => l.gameType === 'chicken')).toBe(true);
  });

  it('resumes an open round via active-session without leaking the road', async () => {
    const { token } = await createUser({ balance: 1000 });
    const start = await auth('post', '/api/games/chicken/start', token).send({ betAmount: 100, difficulty: 'hard' });
    const sessionId = start.body.sessionId as number;

    const active = await auth('get', '/api/games/chicken/active-session', token).send();
    expect(active.status).toBe(200);
    expect(active.body.session.sessionId).toBe(sessionId);
    expect(active.body.session.difficulty).toBe('hard');
    expect(active.body.session.betAmount).toBe(100);
    expect(active.body.session.lane).toBe(0);
    expect(active.body.session.maxLanes).toBe(20); // hard: 25 tiles − 5 deadly
    // The hidden car layout must never be exposed to the client.
    expect(active.body.session.road).toBeUndefined();
  });
});
