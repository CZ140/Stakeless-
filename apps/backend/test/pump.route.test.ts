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

describe('Pump routes — money path', () => {
  beforeEach(resetDb);

  it('rejects unauthenticated start', async () => {
    const res = await request(app).post('/api/games/pump/start').send({ betAmount: 10, difficulty: 'easy' });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid bet shape with 400', async () => {
    const { token } = await createUser();
    const res = await auth('post', '/api/games/pump/start', token).send({ betAmount: 0, difficulty: 'easy' });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown difficulty with 400', async () => {
    const { token } = await createUser({ balance: 1000 });
    const res = await auth('post', '/api/games/pump/start', token).send({ betAmount: 10, difficulty: 'insane' });
    expect(res.status).toBe(400);
  });

  it('rejects a bet larger than the balance with 402', async () => {
    const { token } = await createUser({ balance: 50 });
    const res = await auth('post', '/api/games/pump/start', token).send({ betAmount: 100, difficulty: 'easy' });
    expect(res.status).toBe(402);
  });

  it('starts a round, deducting the bet and reporting maxPumps', async () => {
    const { user, token } = await createUser({ balance: 1000 });
    const res = await auth('post', '/api/games/pump/start', token).send({ betAmount: 100, difficulty: 'hard' });
    expect(res.status).toBe(200);
    const body = res.body as { sessionId: number; difficulty: string; pumps: number; multiplier: number; maxPumps: number };
    expect(body.sessionId).toBeGreaterThan(0);
    expect(body.difficulty).toBe('hard');
    expect(body.pumps).toBe(0);
    expect(body.multiplier).toBe(1);
    expect(body.maxPumps).toBe(8); // 12 segments − 4 pops
    expect(await getBalance(user.id)).toBe(900); // stake deducted up front
  });

  it('rejects a second concurrent round with 409', async () => {
    const { token } = await createUser({ balance: 1000 });
    await auth('post', '/api/games/pump/start', token).send({ betAmount: 100, difficulty: 'easy' });
    const dup = await auth('post', '/api/games/pump/start', token).send({ betAmount: 100, difficulty: 'easy' });
    expect(dup.status).toBe(409);
  });

  it('refuses to cash out before any pump', async () => {
    const { token } = await createUser({ balance: 1000 });
    const start = await auth('post', '/api/games/pump/start', token).send({ betAmount: 100, difficulty: 'easy' });
    const res = await auth('post', '/api/games/pump/cashout', token).send({ sessionId: start.body.sessionId });
    expect(res.status).toBe(400);
  });

  it('settles a cash-out consistent with the cumulative multiplier', async () => {
    // Easy difficulty rarely pops on the first pump (~8%); retry until one survives.
    const { user, token } = await createUser({ balance: 1_000_000 });
    let cashedOut = false;

    for (let attempt = 0; attempt < 60 && !cashedOut; attempt++) {
      const before = await getBalance(user.id);
      const start = await auth('post', '/api/games/pump/start', token).send({ betAmount: 100, difficulty: 'easy' });
      expect(start.status).toBe(200);
      const sessionId = start.body.sessionId as number;
      expect(await getBalance(user.id)).toBe(before - 100);

      const pump = await auth('post', '/api/games/pump/inflate', token).send({ sessionId });
      expect(pump.status).toBe(200);

      if (pump.body.popped) {
        expect(await getBalance(user.id)).toBe(before - 100); // lost the stake
        continue;
      }

      expect(pump.body.pumps).toBe(1);
      const cash = await auth('post', '/api/games/pump/cashout', token).send({ sessionId });
      expect(cash.status).toBe(200);
      const { payout, newBalance, multiplier, pumps } = cash.body as {
        payout: number; newBalance: number; multiplier: number; pumps: number;
      };
      expect(pumps).toBe(1);
      expect(payout).toBe(Math.floor(100 * multiplier));
      expect(newBalance).toBe(before - 100 + payout);
      expect(await getBalance(user.id)).toBe(newBalance);

      const logs = await db.select().from(gameLogs).where(eq(gameLogs.userId, user.id));
      expect(logs.some((l) => l.gameType === 'pump')).toBe(true);
      cashedOut = true;
    }

    expect(cashedOut).toBe(true);
  });

  it('pops a round, settling a loss and closing the session', async () => {
    // Expert pops 50% per pump — a run pops quickly. Keep pumping until it does.
    const { user, token } = await createUser({ balance: 1_000_000 });
    const before = await getBalance(user.id);
    const start = await auth('post', '/api/games/pump/start', token).send({ betAmount: 100, difficulty: 'expert' });
    const sessionId = start.body.sessionId as number;

    let popped = false;
    for (let i = 0; i < 50 && !popped; i++) {
      const pump = await auth('post', '/api/games/pump/inflate', token).send({ sessionId });
      // Either a survive (200) or a pop (200, popped:true); a maxed balloon would 400.
      expect(pump.status).toBe(200);
      if (pump.body.popped) popped = true;
    }
    expect(popped).toBe(true);

    // No credit on a pop; balance stays at the post-deduct amount.
    expect(await getBalance(user.id)).toBe(before - 100);

    // The session is closed — resume returns nothing.
    const active = await auth('get', '/api/games/pump/active-session', token).send();
    expect(active.body.session).toBeNull();

    const logs = await db.select().from(gameLogs).where(eq(gameLogs.userId, user.id));
    expect(logs.some((l) => l.gameType === 'pump')).toBe(true);
  });

  it('resumes an open round via active-session', async () => {
    const { token } = await createUser({ balance: 1000 });
    const start = await auth('post', '/api/games/pump/start', token).send({ betAmount: 100, difficulty: 'medium' });
    const sessionId = start.body.sessionId as number;

    const active = await auth('get', '/api/games/pump/active-session', token).send();
    expect(active.status).toBe(200);
    expect(active.body.session.sessionId).toBe(sessionId);
    expect(active.body.session.difficulty).toBe('medium');
    expect(active.body.session.betAmount).toBe(100);
    expect(active.body.session.pumps).toBe(0);
    expect(active.body.session.maxPumps).toBe(10);
    // The hidden hazard layout must never be exposed to the client.
    expect(active.body.session.strip).toBeUndefined();
  });
});
