import { sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { users, gameLogs } from '../src/db/schema.js';
import { signAccessToken } from '../src/services/tokenService.js';

// Wipe every table and reset identity sequences. Called in beforeEach so each
// test starts from an empty, deterministic database. (Integration tests run
// with fileParallelism disabled so this never races another suite.)
export async function resetDb(): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE users, game_logs, game_sessions, refresh_tokens, email_verification_tokens, daily_bonus_claims, admin_logs RESTART IDENTITY CASCADE`,
  );
}

type UserRow = typeof users.$inferSelect;

let seq = 0;

// Insert a verified player (or admin) and mint a valid access token for it, so
// tests can hit authenticated routes via `Authorization: Bearer <token>`.
export async function createUser(
  overrides: Partial<typeof users.$inferInsert> = {},
): Promise<{ user: UserRow; token: string }> {
  seq += 1;
  const tag = `${seq}_${Date.now()}`;
  const [user] = await db
    .insert(users)
    .values({
      email: `user_${tag}@test.local`,
      username: `user_${tag}`,
      passwordHash: 'x', // never used — tests mint tokens directly
      balance: 1000,
      isEmailVerified: true,
      ...overrides,
    })
    .returning();
  const token = await signAccessToken(user!.id);
  return { user: user!, token };
}

// Read the live balance straight from the DB (source of truth for money paths).
export async function getBalance(userId: number): Promise<number> {
  const [row] = await db
    .select({ balance: users.balance })
    .from(users)
    .where(sql`${users.id} = ${userId}`);
  return row!.balance;
}

export interface SeedLog {
  gameType?: string;
  betAmount: number;
  profit: number; // gross credited (stake + winnings); net = profit - betAmount
  outcome?: string;
  balanceAfter?: number;
  createdAt?: Date;
}

// Insert a game_logs row with full control over createdAt — lets profile-aggregate
// tests place rounds on specific days (today / streaks / 30-day window).
export async function seedGameLog(userId: number, log: SeedLog): Promise<void> {
  await db.insert(gameLogs).values({
    userId,
    gameType: log.gameType ?? 'roulette',
    betAmount: log.betAmount,
    profit: log.profit,
    outcome: log.outcome ?? 'settled',
    balanceAfter: log.balanceAfter ?? 1000,
    ...(log.createdAt ? { createdAt: log.createdAt } : {}),
  });
}
