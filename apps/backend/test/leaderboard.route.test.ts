import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { resetDb, createUser } from './helpers.js';

const app = createApp();

function get(token?: string) {
  const r = request(app).get('/api/leaderboard');
  return token ? r.set('Authorization', `Bearer ${token}`) : r;
}

describe('Leaderboard route — own rank', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('reports each user their TRUE balance rank, not always 1', async () => {
    // Regression: a `rank() over (...)` with a `where id = userId` filter evaluates
    // the window over the single post-filter row → always 1. Build a clear order.
    const top = await createUser({ username: 'top', balance: 5000 });
    const mid = await createUser({ username: 'mid', balance: 3000 });
    const low = await createUser({ username: 'low', balance: 1000 });

    expect((await get(top.token)).body.ownRanks.balance.rank).toBe(1);
    const midRes = await get(mid.token);
    expect(midRes.body.ownRanks.balance.rank).toBe(2);
    expect(midRes.body.ownRanks.balance.value).toBe(3000);
    expect((await get(low.token)).body.ownRanks.balance.rank).toBe(3);
  });

  it('gives tied values the same (competition) rank', async () => {
    await createUser({ username: 'a', balance: 2000 });
    const tieB = await createUser({ username: 'b', balance: 1000 });
    const tieC = await createUser({ username: 'c', balance: 1000 });
    // Both 1000-balance users sit at rank 2 (one user is strictly ahead).
    expect((await get(tieB.token)).body.ownRanks.balance.rank).toBe(2);
    expect((await get(tieC.token)).body.ownRanks.balance.rank).toBe(2);
  });

  it('returns null ownRanks for a guest (no token)', async () => {
    await createUser({ username: 'solo', balance: 100 });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.ownRanks).toBeNull();
  });
});
