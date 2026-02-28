import {
  pgTable,
  serial,
  varchar,
  bigint,
  timestamp,
  integer,
  text,
  boolean,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  balance: bigint('balance', { mode: 'number' }).notNull().default(0),
  totalWagered: bigint('total_wagered', { mode: 'number' }).notNull().default(0),
  totalProfit: bigint('total_profit', { mode: 'number' }).notNull().default(0),
  totalLoss: bigint('total_loss', { mode: 'number' }).notNull().default(0),
  role: varchar('role', { length: 20 }).notNull().default('player'),
  lastBonusClaimedAt: timestamp('last_bonus_claimed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at'),
  tokenVersion: integer('token_version').notNull().default(0),
  isBanned: boolean('is_banned').notNull().default(false),
});

export const gameLogs = pgTable('game_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  gameType: varchar('game_type', { length: 50 }).notNull(),
  betAmount: bigint('bet_amount', { mode: 'number' }).notNull(),
  outcome: varchar('outcome', { length: 50 }).notNull(),
  profit: bigint('profit', { mode: 'number' }).notNull(),
  balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const gameSessions = pgTable('game_sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  gameType: varchar('game_type', { length: 50 }).notNull(),
  state: text('state').notNull(), // JSON-encoded game state
  betAmount: bigint('bet_amount', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
});

export const dailyBonusClaims = pgTable('daily_bonus_claims', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  claimedAt: timestamp('claimed_at').notNull().defaultNow(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
});

export const adminLogs = pgTable('admin_logs', {
  id: serial('id').primaryKey(),
  adminId: integer('admin_id')
    .notNull()
    .references(() => users.id),
  action: varchar('action', { length: 100 }).notNull(),
  targetUserId: integer('target_user_id').references(() => users.id),
  details: text('details'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
