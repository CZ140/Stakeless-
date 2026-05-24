import { Router, type IRouter } from 'express';
import { db } from '../db/index.js';
import { users, gameLogs } from '../db/schema.js';
import { eq, and, sql, desc, count } from 'drizzle-orm';
import { computeStreak } from '../services/streak.js';

export const profileRouter: IRouter = Router();

// GET /api/profile/:username/activity?limit=N
// Recent bets for a user, newest first. Public (consistent with the public
// profile balance history). Each row exposes the actual net balance change
// (net = profit - betAmount, since the stake was deducted separately) and the
// gross return multiple (profit / betAmount) — both derived uniformly across
// all four games, which all credit a gross payout via settleBet.
profileRouter.get('/:username/activity', async (req, res) => {
  const { username } = req.params;
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50) : 8;

  try {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const logs = await db
      .select({
        id: gameLogs.id,
        gameType: gameLogs.gameType,
        betAmount: gameLogs.betAmount,
        outcome: gameLogs.outcome,
        profit: gameLogs.profit,
        balanceAfter: gameLogs.balanceAfter,
        createdAt: gameLogs.createdAt,
      })
      .from(gameLogs)
      .where(eq(gameLogs.userId, user.id))
      .orderBy(desc(gameLogs.createdAt))
      .limit(limit);

    res.json({
      activity: logs.map((l) => ({
        id: l.id,
        gameType: l.gameType,
        betAmount: l.betAmount,
        outcome: l.outcome,
        profit: l.profit,
        net: l.profit - l.betAmount,
        multiplier: l.betAmount > 0 ? l.profit / l.betAmount : 0,
        balanceAfter: l.balanceAfter,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error('[profile] activity query error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

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
        role: users.role,
        isVerified: users.isEmailVerified,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // net = profit - betAmount is the real per-round balance change (stake was
    // deducted separately and `profit` is the gross credit). Every aggregate
    // below derives from real game_logs rows.
    const net = sql<number>`${gameLogs.profit} - ${gameLogs.betAmount}`;

    const [rankRow, totalsRow, daily, gameMix, biggestRows, activeDays] = await Promise.all([
      // Balance rank = (number of users with a strictly higher balance) + 1.
      // Computed against the whole users table — a window function filtered to a
      // single row would always return 1. Uses the already-fetched user.balance.
      db
        .select({ rank: sql<number>`count(*) + 1`.mapWith(Number) })
        .from(users)
        .where(sql`${users.balance} > ${user.balance}`),

      // Totals: games played, wins (net > 0), games today, net today
      db
        .select({
          total: count(),
          wins: sql<number>`coalesce(sum(case when ${gameLogs.profit} > ${gameLogs.betAmount} then 1 else 0 end), 0)`.mapWith(Number),
          gamesToday: sql<number>`coalesce(sum(case when ${gameLogs.createdAt} >= date_trunc('day', now()) then 1 else 0 end), 0)`.mapWith(Number),
          todayNet: sql<number>`coalesce(sum(case when ${gameLogs.createdAt} >= date_trunc('day', now()) then ${gameLogs.profit} - ${gameLogs.betAmount} else 0 end), 0)`.mapWith(Number),
        })
        .from(gameLogs)
        .where(eq(gameLogs.userId, user.id)),

      // Daily aggregates for the last 30 days: net P/L, wagered, games
      db
        .select({
          date: sql<string>`date_trunc('day', ${gameLogs.createdAt})::date::text`,
          pnl: sql<number>`coalesce(sum(${net}), 0)`.mapWith(Number),
          wagered: sql<number>`coalesce(sum(${gameLogs.betAmount}), 0)`.mapWith(Number),
          games: sql<number>`count(*)`.mapWith(Number),
        })
        .from(gameLogs)
        .where(and(eq(gameLogs.userId, user.id), sql`${gameLogs.createdAt} >= now() - interval '30 days'`))
        .groupBy(sql`date_trunc('day', ${gameLogs.createdAt})`)
        .orderBy(sql`date_trunc('day', ${gameLogs.createdAt})`),

      // Game mix: rounds per game type
      db
        .select({ gameType: gameLogs.gameType, games: sql<number>`count(*)`.mapWith(Number) })
        .from(gameLogs)
        .where(eq(gameLogs.userId, user.id))
        .groupBy(gameLogs.gameType),

      // Biggest single-round win (by net)
      db
        .select({
          net: net.mapWith(Number),
          gameType: gameLogs.gameType,
          multiplier: sql<number>`case when ${gameLogs.betAmount} > 0 then ${gameLogs.profit}::float / ${gameLogs.betAmount} else 0 end`.mapWith(Number),
          createdAt: gameLogs.createdAt,
        })
        .from(gameLogs)
        .where(eq(gameLogs.userId, user.id))
        .orderBy(desc(net))
        .limit(1),

      // Distinct active days (last 90) for the streak calculation
      db
        .select({ day: sql<string>`date_trunc('day', ${gameLogs.createdAt})::date::text` })
        .from(gameLogs)
        .where(and(eq(gameLogs.userId, user.id), sql`${gameLogs.createdAt} >= now() - interval '90 days'`))
        .groupBy(sql`date_trunc('day', ${gameLogs.createdAt})`)
        .orderBy(sql`date_trunc('day', ${gameLogs.createdAt}) desc`),
    ]);

    const totals = totalsRow[0];
    const gamesPlayed = Number(totals?.total ?? 0);
    const wins = totals?.wins ?? 0;
    const winRate = gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0;

    // Current consecutive active-day streak (run length ending at the most recent
    // active day, counted only if that day is today or yesterday).
    const streak = computeStreak(activeDays.map((d) => d.day));

    const biggest = biggestRows[0] && biggestRows[0].net > 0
      ? {
          net: biggestRows[0].net,
          gameType: biggestRows[0].gameType,
          multiplier: biggestRows[0].multiplier,
          at: biggestRows[0].createdAt.toISOString(),
        }
      : null;

    res.json({
      username: user.username,
      balance: user.balance,
      balanceRank: rankRow[0]?.rank ?? 1,
      totalWagered: user.totalWagered,
      totalProfit: user.totalProfit,
      gamesPlayed,
      gamesToday: totals?.gamesToday ?? 0,
      todayNet: totals?.todayNet ?? 0,
      winRate,
      streak,
      role: user.role,
      isVerified: user.isVerified,
      joinedAt: user.createdAt.toISOString(),
      daily,
      gameMix,
      biggestWin: biggest,
    });
  } catch (err) {
    console.error('[profile] query error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});
