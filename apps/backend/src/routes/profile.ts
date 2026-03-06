import { Router, type IRouter } from 'express';
import { db } from '../db/index.js';
import { users, gameLogs } from '../db/schema.js';
import { eq, sql, asc, count } from 'drizzle-orm';

export const profileRouter: IRouter = Router();

profileRouter.get('/:username', async (req, res) => {
  const { username } = req.params;

  try {
    // 1. Look up user by username — never return email, passwordHash, tokenVersion, isBanned
    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        balance: users.balance,
        totalWagered: users.totalWagered,
        totalProfit: users.totalProfit,
      })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // 2. Run four sub-queries in parallel
    const [rankRow, gamesRow, balanceHistory, wageredPerDay] = await Promise.all([
      // Balance rank via window function
      db
        .select({
          rank: sql<number>`rank() over (order by ${users.balance} desc)`.mapWith(Number),
        })
        .from(users)
        .where(eq(users.id, user.id)),

      // Total games played
      db
        .select({ total: count() })
        .from(gameLogs)
        .where(eq(gameLogs.userId, user.id)),

      // Balance history: one point per game round, ordered by createdAt ASC
      db
        .select({
          x: gameLogs.createdAt,
          y: gameLogs.balanceAfter,
        })
        .from(gameLogs)
        .where(eq(gameLogs.userId, user.id))
        .orderBy(asc(gameLogs.createdAt)),

      // Wagered per day: aggregated by calendar day
      db
        .select({
          date: sql<string>`date_trunc('day', ${gameLogs.createdAt})::date::text`,
          wagered: sql<number>`sum(${gameLogs.betAmount})`.mapWith(Number),
        })
        .from(gameLogs)
        .where(eq(gameLogs.userId, user.id))
        .groupBy(sql`date_trunc('day', ${gameLogs.createdAt})`)
        .orderBy(sql`date_trunc('day', ${gameLogs.createdAt})`),
    ]);

    res.json({
      username: user.username,
      balance: user.balance,
      balanceRank: rankRow[0]?.rank ?? 1,
      totalWagered: user.totalWagered,
      totalProfit: user.totalProfit,
      gamesPlayed: Number(gamesRow[0]?.total ?? 0),
      balanceHistory: balanceHistory.map(r => ({ x: r.x.toISOString(), y: r.y })),
      wageredPerDay,
    });
  } catch (err) {
    console.error('[profile] query error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});
