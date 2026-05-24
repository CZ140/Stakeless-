import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { resolveSlots, type SlotGrid } from '@gambling/shared';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { gameLogs } from '../src/db/schema.js';
import { resetDb, createUser, getBalance } from './helpers.js';

const app = createApp();

function bearer(path: string, token: string) {
  return request(app).post(path).set('Authorization', `Bearer ${token}`);
}

describe('POST /api/games/slots/bet — money path', () => {
  beforeEach(resetDb);

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/api/games/slots/bet').send({ betAmount: 10 });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid bet shape with 400', async () => {
    const { token } = await createUser();
    const res = await bearer('/api/games/slots/bet', token).send({ betAmount: 0 });
    expect(res.status).toBe(400);
  });

  it('rejects a bet larger than the balance with 402', async () => {
    const { token } = await createUser({ balance: 50 });
    const res = await bearer('/api/games/slots/bet', token).send({ betAmount: 100 });
    expect(res.status).toBe(402);
  });

  it('settles to a balance consistent with the reported grid', async () => {
    const { user, token } = await createUser({ balance: 10_000 });
    const betAmount = 100;

    const res = await bearer('/api/games/slots/bet', token).send({ betAmount });
    expect(res.status).toBe(200);

    const body = res.body as {
      grid: SlotGrid;
      lines: { line: number; payout: number }[];
      totalPayout: number;
      win: boolean;
      profit: number;
      newBalance: number;
    };

    // The reported lines/payout must be exactly what the shared resolver derives
    // from the reported grid — the client can recompute and trust the result.
    const recomputed = resolveSlots(body.grid, betAmount);
    expect(body.totalPayout).toBe(recomputed.totalPayout);
    expect(body.win).toBe(recomputed.win);
    expect(body.lines).toHaveLength(recomputed.lines.length);

    // Net profit is the gross payout minus the staked amount.
    const expectedProfit = body.totalPayout - betAmount;
    expect(body.profit).toBe(expectedProfit);
    expect(body.newBalance).toBe(10_000 + expectedProfit);

    // The DB is the source of truth and agrees with the response.
    expect(await getBalance(user.id)).toBe(body.newBalance);

    // The round was logged under the 'slots' game type.
    const logs = await db.select().from(gameLogs).where(eq(gameLogs.userId, user.id));
    expect(logs).toHaveLength(1);
    expect(logs[0]!.gameType).toBe('slots');
  });

  it('keeps the balance invariant across many spins', async () => {
    const { user, token } = await createUser({ balance: 100_000 });
    let expectedBalance = 100_000;
    let sawWin = false;
    for (let i = 0; i < 25; i++) {
      const res = await bearer('/api/games/slots/bet', token).send({ betAmount: 100 });
      expect(res.status).toBe(200);
      expectedBalance += res.body.profit as number;
      if (res.body.win) sawWin = true;
      expect(await getBalance(user.id)).toBe(expectedBalance);
    }
    // ~65% of spins win something — at least one in 25 is all but certain.
    expect(sawWin).toBe(true);
  });
});
