import type { Server } from 'socket.io';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { desc, asc } from 'drizzle-orm';

const BROADCAST_INTERVAL_MS = 7000;
let broadcastInterval: ReturnType<typeof setInterval> | null = null;

async function fetchLeaderboardSnapshot() {
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
  return { byBalance, byWagered, byProfit };
}

export function startLeaderboardBroadcast(io: Server): void {
  // Guard against duplicate timers on hot reload
  if (broadcastInterval !== null) {
    clearInterval(broadcastInterval);
  }
  broadcastInterval = setInterval(async () => {
    try {
      const snapshot = await fetchLeaderboardSnapshot();
      io.emit('leaderboard:update', snapshot);
    } catch (err) {
      console.error('[leaderboard broadcast] query failed:', err);
    }
  }, BROADCAST_INTERVAL_MS);
}
