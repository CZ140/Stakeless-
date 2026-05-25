import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { coinflipMultiplier } from '@gambling/shared';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { gameLogs } from '../src/db/schema.js';
import { resetDb, createUser, getBalance } from './helpers.js';

const app = createApp();

function bearer(path: string, token: string) {
  return request(app).post(path).set('Authorization', `Bearer ${token}`);
}

describe('POST /api/games/flip/bet — money path', () => {
  beforeEach(resetDb);

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/api/games/flip/bet').send({ betAmount: 10, call: 'heads' });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid bet shape with 400', async () => {
    const { token } = await createUser();
    // missing call
    const noCall = await bearer('/api/games/flip/bet', token).send({ betAmount: 10 });
    expect(noCall.status).toBe(400);
    // invalid call value
    const badCall = await bearer('/api/games/flip/bet', token).send({ betAmount: 10, call: 'edge' });
    expect(badCall.status).toBe(400);
  });

  it('rejects a bet larger than the balance with 402', async () => {
    const { token } = await createUser({ balance: 50 });
    const res = await bearer('/api/games/flip/bet', token).send({ betAmount: 100, call: 'heads' });
    expect(res.status).toBe(402);
  });

  it('settles to a balance consistent with the reported outcome', async () => {
    const { user, token } = await createUser({ balance: 1000 });
    const betAmount = 100;

    const res = await bearer('/api/games/flip/bet', token).send({ betAmount, call: 'heads' });
    expect(res.status).toBe(200);

    const body = res.body as {
      result: 'heads' | 'tails'; call: 'heads' | 'tails'; win: boolean; multiplier: number; profit: number; newBalance: number;
    };

    // Multiplier matches the shared math; a win iff the flip matched the call.
    expect(body.multiplier).toBe(coinflipMultiplier());
    expect(body.win).toBe(body.result === body.call);

    // Net profit is exactly the win payout or the lost stake.
    const expectedProfit = body.win ? Math.floor(betAmount * body.multiplier) - betAmount : -betAmount;
    expect(body.profit).toBe(expectedProfit);
    expect(body.newBalance).toBe(1000 + expectedProfit);

    // The DB is the source of truth and agrees with the response.
    expect(await getBalance(user.id)).toBe(body.newBalance);

    // The round was logged under the 'flip' game type.
    const logs = await db.select().from(gameLogs).where(eq(gameLogs.userId, user.id));
    expect(logs).toHaveLength(1);
    expect(logs[0]!.gameType).toBe('flip');
  });

  it('credits a win when the flip lands on the call', async () => {
    // ~50% per flip — over a handful of calls at least one win proves the credit
    // path; each bet independently keeps the balance invariant.
    const { user, token } = await createUser({ balance: 100_000 });
    let sawWin = false;
    let expectedBalance = 100_000;
    for (let i = 0; i < 20 && !sawWin; i++) {
      const res = await bearer('/api/games/flip/bet', token).send({ betAmount: 100, call: 'heads' });
      expect(res.status).toBe(200);
      expectedBalance += res.body.profit as number;
      if (res.body.win) sawWin = true;
      expect(await getBalance(user.id)).toBe(expectedBalance);
    }
    expect(sawWin).toBe(true);
  });
});
