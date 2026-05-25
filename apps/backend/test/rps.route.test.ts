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

const CHOICES = ['rock', 'paper', 'scissors'];
const OUTCOMES = ['win', 'tie', 'loss'];

describe('RPS routes — money path', () => {
  beforeEach(resetDb);

  it('rejects unauthenticated bets', async () => {
    const res = await request(app).post('/api/games/rps/bet').send({ betAmount: 10, choice: 'rock' });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid bet shape with 400', async () => {
    const { token } = await createUser();
    const res = await auth('post', '/api/games/rps/bet', token).send({ betAmount: 0, choice: 'rock' });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown choice with 400', async () => {
    const { token } = await createUser({ balance: 1000 });
    const res = await auth('post', '/api/games/rps/bet', token).send({ betAmount: 10, choice: 'lizard' });
    expect(res.status).toBe(400);
  });

  it('rejects a bet larger than the balance with 402', async () => {
    const { token } = await createUser({ balance: 5 });
    const res = await auth('post', '/api/games/rps/bet', token).send({ betAmount: 100, choice: 'rock' });
    expect(res.status).toBe(402);
  });

  it('settles every bet consistently with its outcome (win 1.91× / tie push / loss)', async () => {
    // Outcomes are random; loop enough rounds to exercise win, tie and loss, and
    // assert the balance invariant holds for each.
    const { user, token } = await createUser({ balance: 1_000_000 });
    const seen = new Set<string>();

    for (let i = 0; i < 60; i++) {
      const before = await getBalance(user.id);
      const res = await auth('post', '/api/games/rps/bet', token).send({ betAmount: 100, choice: 'rock' });
      expect(res.status).toBe(200);
      const { choice, house, outcome, multiplier, profit, newBalance } = res.body as {
        choice: string; house: string; outcome: string; multiplier: number; profit: number; newBalance: number;
      };
      expect(choice).toBe('rock');
      expect(CHOICES).toContain(house);
      expect(OUTCOMES).toContain(outcome);
      seen.add(outcome);

      const expectedGross = outcome === 'win' ? Math.floor(100 * multiplier) : outcome === 'tie' ? 100 : 0;
      if (outcome === 'win') expect(multiplier).toBe(1.91);
      if (outcome === 'tie') { expect(multiplier).toBe(1); expect(profit).toBe(0); }
      if (outcome === 'loss') { expect(multiplier).toBe(0); expect(profit).toBe(-100); }
      expect(profit).toBe(expectedGross - 100);
      expect(newBalance).toBe(before - 100 + expectedGross);
      expect(await getBalance(user.id)).toBe(newBalance);
    }

    // Over 60 uniform rounds all three outcomes are virtually certain to appear.
    expect(seen.has('win')).toBe(true);
    expect(seen.has('tie')).toBe(true);
    expect(seen.has('loss')).toBe(true);

    const logs = await db.select().from(gameLogs).where(eq(gameLogs.userId, user.id));
    expect(logs.every((l) => l.gameType === 'rps')).toBe(true);
    expect(logs.length).toBe(60);
  });
});
