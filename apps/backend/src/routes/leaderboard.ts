import { Router, type IRouter } from 'express';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { desc, asc, eq, gt, sql, type AnyColumn } from 'drizzle-orm';
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
        .select({ id: users.id, username: users.username, value: users.balance, tierLevel: users.tierLevel, avatarColor: users.avatarColor })
        .from(users)
        .orderBy(desc(users.balance), asc(users.id))
        .limit(25),
      db
        .select({ id: users.id, username: users.username, value: users.totalWagered, tierLevel: users.tierLevel, avatarColor: users.avatarColor })
        .from(users)
        .orderBy(desc(users.totalWagered), asc(users.id))
        .limit(25),
      db
        .select({ id: users.id, username: users.username, value: users.totalProfit, tierLevel: users.tierLevel, avatarColor: users.avatarColor })
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
      // Fetch the user's own values, then derive each rank as the standard
      // competition rank = 1 + (users with a strictly greater value). NOTE: a
      // `rank() over (...)` window with a `where id = userId` filter would always
      // return 1, since the window is evaluated over the post-filter single row.
      const [me] = await db
        .select({ balance: users.balance, wagered: users.totalWagered, profit: users.totalProfit })
        .from(users)
        .where(eq(users.id, userId));
      if (me) {
        const rankOf = async (column: AnyColumn, value: number): Promise<number> => {
          const [row] = await db
            .select({ ahead: sql<number>`count(*)`.mapWith(Number) })
            .from(users)
            .where(gt(column, value));
          return (row?.ahead ?? 0) + 1;
        };
        const [balanceRank, wageredRank, profitRank] = await Promise.all([
          rankOf(users.balance, me.balance),
          rankOf(users.totalWagered, me.wagered),
          rankOf(users.totalProfit, me.profit),
        ]);
        ownRanks = {
          balance: { rank: balanceRank, value: me.balance },
          wagered: { rank: wageredRank, value: me.wagered },
          profit: { rank: profitRank, value: me.profit },
        };
      }
    }

    res.json({ byBalance, byWagered, byProfit, ownRanks });
  } catch (err) {
    console.error('[leaderboard] query error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});
