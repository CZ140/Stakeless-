import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { resetDb, createUser, seedGameLog } from './helpers.js';

const app = createApp();

// Anchor seeded rounds at noon UTC of a given day offset so they land squarely
// inside the intended calendar day (avoids midnight-boundary flakiness).
function dayAtNoonUTC(offsetDays: number): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + offsetDays, 12, 0, 0));
}

describe('GET /api/profile/:username', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('404s for an unknown user', async () => {
    const res = await request(app).get('/api/profile/ghost');
    expect(res.status).toBe(404);
  });

  it('returns zeroed aggregates for a user with no rounds', async () => {
    await createUser({ username: 'fresh', balance: 1000 });
    const res = await request(app).get('/api/profile/fresh');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      username: 'fresh',
      balance: 1000,
      gamesPlayed: 0,
      gamesToday: 0,
      todayNet: 0,
      winRate: 0,
      streak: 0,
      balanceRank: 1,
      daily: [],
      gameMix: [],
      biggestWin: null,
    });
  });

  it('computes aggregates from seeded game logs', async () => {
    const { user } = await createUser({
      username: 'grinder',
      balance: 1500,
      totalWagered: 400,
      totalProfit: 250,
    });
    // Today: two wins and one loss.
    await seedGameLog(user.id, { gameType: 'roulette', betAmount: 100, profit: 200, createdAt: dayAtNoonUTC(0) }); // net +100 win
    await seedGameLog(user.id, { gameType: 'plinko', betAmount: 100, profit: 0, createdAt: dayAtNoonUTC(0) }); // net -100 loss
    await seedGameLog(user.id, { gameType: 'mines', betAmount: 50, profit: 150, createdAt: dayAtNoonUTC(0) }); // net +100 win
    // Yesterday: one win — also the biggest single-round win.
    await seedGameLog(user.id, { gameType: 'blackjack', betAmount: 100, profit: 250, createdAt: dayAtNoonUTC(-1) }); // net +150

    const res = await request(app).get('/api/profile/grinder');
    expect(res.status).toBe(200);
    const b = res.body;

    // Totals come straight from the users row.
    expect(b.totalWagered).toBe(400);
    expect(b.totalProfit).toBe(250);

    // Derived from game_logs.
    expect(b.gamesPlayed).toBe(4);
    expect(b.winRate).toBeCloseTo(75, 5); // 3 of 4 rounds net-positive
    expect(b.gamesToday).toBe(3);
    expect(b.todayNet).toBe(100); // +100 -100 +100
    expect(b.streak).toBe(2); // today + yesterday, consecutive

    const mix = Object.fromEntries(b.gameMix.map((g: { gameType: string; games: number }) => [g.gameType, g.games]));
    expect(mix).toEqual({ roulette: 1, plinko: 1, mines: 1, blackjack: 1 });

    // daily is ascending by day: [yesterday, today].
    expect(b.daily).toHaveLength(2);
    expect(b.daily[0]).toMatchObject({ pnl: 150, wagered: 100, games: 1 });
    expect(b.daily[1]).toMatchObject({ pnl: 100, wagered: 250, games: 3 });

    expect(b.biggestWin).toMatchObject({ net: 150, gameType: 'blackjack', multiplier: 2.5 });
  });

  it('excludes pushes (net 0) from the win rate', async () => {
    const { user } = await createUser({ username: 'pusher' });
    await seedGameLog(user.id, { betAmount: 100, profit: 100, createdAt: dayAtNoonUTC(0) }); // push, net 0
    await seedGameLog(user.id, { betAmount: 100, profit: 200, createdAt: dayAtNoonUTC(0) }); // win
    const res = await request(app).get('/api/profile/pusher');
    expect(res.body.gamesPlayed).toBe(2);
    expect(res.body.winRate).toBeCloseTo(50, 5); // 1 win of 2, push is not a win
    expect(res.body.biggestWin).toMatchObject({ net: 100 });
  });

  it('ranks users by balance (whole-table, not just the queried row)', async () => {
    await createUser({ username: 'rich', balance: 5000 });
    await createUser({ username: 'mid', balance: 1000 });
    await createUser({ username: 'poor', balance: 100 });
    const rich = await request(app).get('/api/profile/rich');
    const mid = await request(app).get('/api/profile/mid');
    const poor = await request(app).get('/api/profile/poor');
    expect(rich.body.balanceRank).toBe(1);
    expect(mid.body.balanceRank).toBe(2);
    expect(poor.body.balanceRank).toBe(3);
  });

  it('gives tied balances the same (competition) rank', async () => {
    await createUser({ username: 'tieA', balance: 5000 });
    await createUser({ username: 'tieB', balance: 5000 });
    await createUser({ username: 'below', balance: 100 });
    const a = await request(app).get('/api/profile/tieA');
    const b = await request(app).get('/api/profile/tieB');
    const below = await request(app).get('/api/profile/below');
    expect(a.body.balanceRank).toBe(1);
    expect(b.body.balanceRank).toBe(1); // tie → same rank
    expect(below.body.balanceRank).toBe(3); // two ahead → rank 3
  });
});
