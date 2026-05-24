import { Router, type IRouter } from 'express';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { desc, asc, eq, sql } from 'drizzle-orm';
import { verifyAccessToken } from '../services/tokenService.js';

export const leaderboardRouter: IRouter = Router();

leaderboardRouter.get('/', async (req, res) => {
  // Optional auth — derive userId if Authorization header is present and valid
  let userId: number | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = await verifyAccessToken(authHeader.slice(7));
      userId = Number(payload.sub);
    } catch {
      // Invalid/expired token — treat as guest
    }
  }

  try {
    const [byBalance, byWagered, byProfit] = await Promise.all([
      db
        .select({ id: users.id, username: users.username, value: users.balance, tierLevel: users.tierLevel })
        .from(users)
        .orderBy(desc(users.balance), asc(users.id))
        .limit(25),
      db
        .select({ id: users.id, username: users.username, value: users.totalWagered, tierLevel: users.tierLevel })
        .from(users)
        .orderBy(desc(users.totalWagered), asc(users.id))
        .limit(25),
      db
        .select({ id: users.id, username: users.username, value: users.totalProfit, tierLevel: users.tierLevel })
        .from(users)
        .orderBy(desc(users.totalProfit), asc(users.id))
        .limit(25),
    ]);

    let ownRanks: {
      balance: { rank: number; value: number } | null;
      wagered: { rank: number; value: number } | null;
      profit: { rank: number; value: number } | null;
    } | null = null;

    if (userId !== null) {
      const [balRank, wagRank, profRank] = await Promise.all([
        db
          .select({
            rank: sql<number>`rank() over (order by ${users.balance} desc)`.mapWith(Number),
            value: users.balance,
          })
          .from(users)
          .where(eq(users.id, userId)),
        db
          .select({
            rank: sql<number>`rank() over (order by ${users.totalWagered} desc)`.mapWith(Number),
            value: users.totalWagered,
          })
          .from(users)
          .where(eq(users.id, userId)),
        db
          .select({
            rank: sql<number>`rank() over (order by ${users.totalProfit} desc)`.mapWith(Number),
            value: users.totalProfit,
          })
          .from(users)
          .where(eq(users.id, userId)),
      ]);
      ownRanks = {
        balance: balRank[0] ? { rank: balRank[0].rank, value: balRank[0].value } : null,
        wagered: wagRank[0] ? { rank: wagRank[0].rank, value: wagRank[0].value } : null,
        profit: profRank[0] ? { rank: profRank[0].rank, value: profRank[0].value } : null,
      };
    }

    res.json({ byBalance, byWagered, byProfit, ownRanks });
  } catch (err) {
    console.error('[leaderboard] query error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});
