import { Router, type IRouter } from 'express';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { gameLimiter } from '../middleware/rateLimiter.js';
import { clickInterval } from '../middleware/clickInterval.js';
import { deductBet, settleBet } from '../services/walletService.js';
import { resolveRouletteBets } from '../services/rouletteService.js';
import { resolvePlinko, rollPlinkoBucket } from '../services/plinkoService.js';
import {
  generateMineGrid,
  calculateMinesMultiplier,
  type MinesSessionState,
} from '../services/minesService.js';
import {
  calculateHandValue,
  startGame,
  playerHit,
  playerStand,
  playerDouble,
  playerSplit,
  canSplit,
  canDouble,
  settle,
  totalProfit,
  MAX_PREDEAL_HANDS,
  type BlackjackSessionState,
} from '../services/blackjackService.js';
import { db } from '../db/index.js';
import { gameSessions } from '../db/schema.js';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { io } from '../socket/index.js';

export const gamesRouter: IRouter = Router();

// European wheel pocket sequence (clockwise from 12 o'clock, pocket 0 at top)
const WHEEL_SEQUENCE = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20,
  14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const betZoneSchema = z.union([
  z.literal('red'),
  z.literal('black'),
  z.literal('odd'),
  z.literal('even'),
  z.literal('dozen_1'),
  z.literal('dozen_2'),
  z.literal('dozen_3'),
  z.literal('col_1'),
  z.literal('col_2'),
  z.literal('col_3'),
  z.string().regex(/^number_([0-9]|[12][0-9]|3[0-6])$/, 'Invalid number bet zone'),
]);

const rouletteBetSchema = z.object({
  bets: z
    .array(z.object({ zone: betZoneSchema, amount: z.number().int().min(1).max(1_000_000) }))
    .min(1, 'At least one bet required')
    .max(50, 'Too many simultaneous bets'),
});

// POST /api/games/roulette/bet
// Pipeline: validate bets → deduct total → crypto.randomInt(0,37) → resolve → settle → log
// Returns 200 { winningPocket, profit, newBalance }
// Returns 400 on invalid bet shape/zone
// Returns 402 on INSUFFICIENT_FUNDS
// Returns 500 on unexpected error
gamesRouter.post('/roulette/bet', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = rouletteBetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid bets' });
    return;
  }

  const userId = req.user!.id;
  const { bets } = parsed.data;
  const totalBet = bets.reduce((sum, b) => sum + b.amount, 0);

  try {
    // Deduct total bet atomically before resolution (GINF-01)
    await deductBet(userId, totalBet, 'roulette');

    // Resolve outcome — crypto.randomInt(0, 37) selects pocket index (GINF-02, ROUL-01)
    const winningPocketIndex = randomInt(0, 37);
    const winningPocket = WHEEL_SEQUENCE[winningPocketIndex]!;

    // Calculate net profit from all placed bets
    const profit = resolveRouletteBets(winningPocket, bets);

    // Settle and log — outcome is pocket number string only (varchar 50 limit) (GINF-03, GINF-04)
    const { newBalance } = await settleBet(
      userId,
      profit,
      totalBet,
      String(winningPocket),
      'roulette',
    );

    io?.to(`user:${userId}`).emit('balance:update', { balance: newBalance });
    res.json({ winningPocket, profit, newBalance });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'INSUFFICIENT_FUNDS') {
      res.status(402).json({ error: 'Insufficient funds' });
      return;
    }
    if (code === 'BET_TOO_SMALL') {
      res.status(400).json({ error: 'Bet amount too small' });
      return;
    }
    console.error('[games] roulette bet error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// ─── Plinko ───────────────────────────────────────────────────────────────────

const plinkoBetSchema = z.object({
  betAmount: z.number().int().min(1).max(1_000_000),
  rows: z.number().int().min(8).max(16),
  riskLevel: z.enum(['low', 'medium', 'high', 'expert']),
});

// POST /api/games/plinko/bet
// Pipeline: validate → deductBet → crypto.randomInt(0, rows+1) → resolvePlinko → settleBet
// Returns 200 { bucket, multiplier, profit, newBalance }
// Returns 400 on invalid input
// Returns 402 on INSUFFICIENT_FUNDS
// Returns 500 on unexpected error
gamesRouter.post('/plinko/bet', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = plinkoBetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }
  const userId = req.user!.id;
  const { betAmount, rows, riskLevel } = parsed.data;
  try {
    await deductBet(userId, betAmount, 'plinko');
    // Binomial roll — real Plinko odds (edges rare), not a uniform pick.
    const bucket = rollPlinkoBucket(rows);
    const multiplier = resolvePlinko(rows, riskLevel, bucket);
    // settleBet receives gross payout (stake + winnings).
    // profit passed to settleBet = floor(betAmount * multiplier) which is the gross payout.
    const grossPayout = Math.floor(betAmount * multiplier);
    const { newBalance } = await settleBet(userId, grossPayout, betAmount, `bucket_${bucket}`, 'plinko');
    io?.to(`user:${userId}`).emit('balance:update', { balance: newBalance });
    // net profit shown to player = gross payout - stake (stake was already deducted)
    res.json({ bucket, multiplier, profit: grossPayout - betAmount, newBalance });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'INSUFFICIENT_FUNDS') { res.status(402).json({ error: 'Insufficient funds' }); return; }
    if (code === 'BET_TOO_SMALL') { res.status(400).json({ error: 'Bet amount too small' }); return; }
    console.error('[games] plinko bet error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// ─── Mines routes ─────────────────────────────────────────────────────────────

const minesStartSchema = z.object({
  betAmount: z.number().int().min(1).max(1_000_000),
  mineCount: z.number().int().min(1).max(24),
});

const minesTileSchema = z.object({
  sessionId: z.number().int(),
  row: z.number().int().min(0).max(4),
  col: z.number().int().min(0).max(4),
});

const minesCashoutSchema = z.object({
  sessionId: z.number().int(),
});

// POST /api/games/mines/start
// Pipeline: deduct bet → generate grid → store session → return { sessionId }
// Grid is NEVER returned to client during an active round (MINE-01)
// Returns 200 { sessionId }
// Returns 402 on INSUFFICIENT_FUNDS
// Returns 400/500 on error
gamesRouter.post('/mines/start', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = minesStartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const userId = req.user!.id;
  const { betAmount, mineCount } = parsed.data;

  try {
    await deductBet(userId, betAmount, 'mines');

    const grid = generateMineGrid(mineCount);
    const state: MinesSessionState = {
      mineCount,
      grid,
      revealed: [],
      tilesRevealed: 0,
      multiplier: 1.0,
      status: 'active',
    };

    const [session] = await db
      .insert(gameSessions)
      .values({
        userId,
        gameType: 'mines',
        state: JSON.stringify(state),
        betAmount,
      })
      .returning({ id: gameSessions.id });

    res.json({ sessionId: session!.id });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'INSUFFICIENT_FUNDS') {
      res.status(402).json({ error: 'Insufficient funds' });
      return;
    }
    if (code === 'BET_TOO_SMALL') {
      res.status(400).json({ error: 'Bet amount too small' });
      return;
    }
    console.error('[games] mines start error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// POST /api/games/mines/tile
// Pipeline: load session → validate tile → check mine → update state → return result
// Returns 200 { hit: true, mineGrid } on mine hit (round over, bet lost)
// Returns 200 { hit: false, gem: true, currentMultiplier, tilesRevealed } on safe tile
// Returns 400 on validation/state errors, 404 if session not found
gamesRouter.post('/mines/tile', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = minesTileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const userId = req.user!.id;
  const { sessionId, row, col } = parsed.data;

  try {
    const rows = await db
      .select()
      .from(gameSessions)
      .where(
        and(
          eq(gameSessions.id, sessionId),
          eq(gameSessions.userId, userId),
          isNull(gameSessions.completedAt),
        ),
      );

    const session = rows[0];
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const state = JSON.parse(session.state) as MinesSessionState;

    if (state.status !== 'active') {
      res.status(400).json({ error: 'Round already ended' });
      return;
    }

    const tileIndex = row * 5 + col;

    if (state.revealed.includes(tileIndex)) {
      res.status(400).json({ error: 'Tile already revealed' });
      return;
    }

    if (state.grid[tileIndex] === true) {
      // Mine hit — round over, bet lost
      state.status = 'exploded';
      await db
        .update(gameSessions)
        .set({ state: JSON.stringify(state), completedAt: new Date() })
        .where(eq(gameSessions.id, sessionId));

      const { newBalance } = await settleBet(userId, 0, session.betAmount, 'exploded', 'mines');
      io?.to(`user:${userId}`).emit('balance:update', { balance: newBalance });

      res.json({ hit: true, mineGrid: state.grid });
      return;
    }

    // Safe tile
    state.revealed.push(tileIndex);
    state.tilesRevealed++;
    state.multiplier = calculateMinesMultiplier(state.mineCount, state.tilesRevealed);

    await db
      .update(gameSessions)
      .set({ state: JSON.stringify(state), updatedAt: new Date() })
      .where(eq(gameSessions.id, sessionId));

    res.json({
      hit: false,
      gem: true,
      currentMultiplier: state.multiplier,
      tilesRevealed: state.tilesRevealed,
    });
  } catch (err: unknown) {
    console.error('[games] mines tile error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// POST /api/games/mines/cashout
// Pipeline: load session → validate state → compute payout → settle → reveal grid
// Returns 200 { payout, newBalance, mineGrid }
// Returns 400 if no tiles revealed or round already ended
// Returns 404 if session not found
gamesRouter.post('/mines/cashout', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = minesCashoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const userId = req.user!.id;
  const { sessionId } = parsed.data;

  try {
    const rows = await db
      .select()
      .from(gameSessions)
      .where(
        and(
          eq(gameSessions.id, sessionId),
          eq(gameSessions.userId, userId),
          isNull(gameSessions.completedAt),
        ),
      );

    const session = rows[0];
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const state = JSON.parse(session.state) as MinesSessionState;

    if (state.status !== 'active') {
      res.status(400).json({ error: 'Round already ended' });
      return;
    }

    if (state.tilesRevealed === 0) {
      res.status(400).json({ error: 'Reveal at least one tile before cashing out' });
      return;
    }

    const payout = Math.floor(session.betAmount * state.multiplier);
    state.status = 'cashout';

    await db
      .update(gameSessions)
      .set({ state: JSON.stringify(state), completedAt: new Date() })
      .where(eq(gameSessions.id, sessionId));

    const { newBalance } = await settleBet(
      userId,
      payout,
      session.betAmount,
      `cashout_${state.tilesRevealed}`,
      'mines',
    );

    io?.to(`user:${userId}`).emit('balance:update', { balance: newBalance });
    res.json({ payout, newBalance, mineGrid: state.grid });
  } catch (err: unknown) {
    console.error('[games] mines cashout error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// GET /api/games/mines/active-session
// Returns the current active Mines session for the authenticated user
// Mine positions are NEVER sent to client during an active round (MINE-01)
// Returns 200 { session: { sessionId, tilesRevealed, revealed, mineCount, multiplier, betAmount } }
// Returns 200 { session: null } if no active session
gamesRouter.get('/mines/active-session', requireAuth, async (req, res) => {
  const userId = req.user!.id;

  try {
    const rows = await db
      .select()
      .from(gameSessions)
      .where(
        and(
          eq(gameSessions.userId, userId),
          eq(gameSessions.gameType, 'mines'),
          isNull(gameSessions.completedAt),
        ),
      )
      .orderBy(desc(gameSessions.createdAt))
      .limit(1);

    const session = rows[0];
    if (!session) {
      res.json({ session: null });
      return;
    }

    const state = JSON.parse(session.state) as MinesSessionState;

    // Never send mine positions to client during active round (MINE-01)
    res.json({
      session: {
        sessionId: session.id,
        tilesRevealed: state.tilesRevealed,
        revealed: state.revealed,
        mineCount: state.mineCount,
        multiplier: state.multiplier,
        betAmount: session.betAmount,
      },
    });
  } catch (err: unknown) {
    console.error('[games] mines active-session error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// ─── Blackjack routes (multi-hand + split) ──────────────────────────────────────

const blackjackDealSchema = z.object({
  bets: z
    .array(z.number().int().min(1).max(1_000_000))
    .min(1, 'At least one hand required')
    .max(MAX_PREDEAL_HANDS, `At most ${MAX_PREDEAL_HANDS} hands`),
});

const blackjackActionSchema = z.object({
  sessionId: z.number().int(),
  action: z.enum(['hit', 'stand', 'double', 'split']),
});

// Build the client-facing view of a session. Player hands are fully visible; the
// dealer hole card stays hidden until the round is settled.
function serializeBlackjack(
  state: BlackjackSessionState,
  sessionId: number,
  newBalance?: number,
) {
  const settled = state.phase === 'settled';
  return {
    sessionId,
    phase: state.phase,
    activeHandIndex: state.activeHandIndex,
    hands: state.hands.map((h) => ({
      cards: h.cards,
      bet: h.bet,
      value: calculateHandValue(h.cards).value,
      status: h.status,
      isDoubled: h.isDoubled,
      splitAce: h.splitAce,
      outcome: h.outcome,
      profit: h.profit,
    })),
    dealer: {
      upCard: state.dealerHand[0] ?? null,
      hand: settled ? state.dealerHand : null,
      value: settled ? calculateHandValue(state.dealerHand).value : null,
    },
    canSplit: canSplit(state),
    canDouble: canDouble(state),
    ...(newBalance !== undefined ? { newBalance } : {}),
  };
}

// Settle every hand to the wallet (one settleBet per hand), persist the session
// as completed, and emit a single balance update. Returns the final balance.
async function settleBlackjack(
  userId: number,
  sessionId: number,
  state: BlackjackSessionState,
): Promise<number> {
  settle(state);
  let newBalance = 0;
  for (const hand of state.hands) {
    const effectiveBet = hand.bet * (hand.isDoubled ? 2 : 1);
    const result = await settleBet(
      userId,
      hand.profit ?? 0,
      effectiveBet,
      hand.outcome ?? 'dealer_win',
      'blackjack',
    );
    newBalance = result.newBalance;
  }
  await db
    .update(gameSessions)
    .set({ state: JSON.stringify(state), completedAt: new Date() })
    .where(eq(gameSessions.id, sessionId));
  io?.to(`user:${userId}`).emit('balance:update', { balance: newBalance });
  return newBalance;
}

// POST /api/games/blackjack/deal
// Body: { bets: number[] } — one entry per pre-deal hand (1..MAX_PREDEAL_HANDS).
// Deducts the total stake, deals all hands, and either returns the player_turn
// view or, if every hand is a natural, settles immediately.
gamesRouter.post('/blackjack/deal', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = blackjackDealSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const userId = req.user!.id;
  const { bets } = parsed.data;
  const total = bets.reduce((sum, b) => sum + b, 0);

  try {
    await deductBet(userId, total, 'blackjack');

    const state = startGame(bets);

    const [session] = await db
      .insert(gameSessions)
      .values({ userId, gameType: 'blackjack', state: JSON.stringify(state), betAmount: total })
      .returning({ id: gameSessions.id });

    if (state.phase === 'dealer_turn') {
      // Every hand was a natural (or otherwise needs no player action) — settle now.
      const newBalance = await settleBlackjack(userId, session!.id, state);
      res.json(serializeBlackjack(state, session!.id, newBalance));
      return;
    }

    res.json(serializeBlackjack(state, session!.id));
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'INSUFFICIENT_FUNDS') { res.status(402).json({ error: 'Insufficient funds' }); return; }
    if (code === 'BET_TOO_SMALL') { res.status(400).json({ error: 'Bet amount too small' }); return; }
    console.error('[games] blackjack deal error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// POST /api/games/blackjack/action
// Body: { sessionId, action: 'hit'|'stand'|'double'|'split' }. Applies the action
// to the active hand; double/split deduct the extra stake. Settles when the
// player turn ends.
gamesRouter.post('/blackjack/action', gameLimiter, clickInterval, requireAuth, async (req, res) => {
  const parsed = blackjackActionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const userId = req.user!.id;
  const { sessionId, action } = parsed.data;

  try {
    const rows = await db
      .select()
      .from(gameSessions)
      .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.userId, userId), isNull(gameSessions.completedAt)));
    const session = rows[0];
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    let state = JSON.parse(session.state) as BlackjackSessionState;
    if (state.phase !== 'player_turn') {
      res.status(400).json({ error: 'Not player turn' });
      return;
    }

    const activeBet = state.hands[state.activeHandIndex]?.bet ?? 0;

    if (action === 'hit') {
      state = playerHit(state);
    } else if (action === 'stand') {
      state = playerStand(state);
    } else if (action === 'double') {
      if (!canDouble(state)) {
        res.status(400).json({ error: 'Cannot double this hand' });
        return;
      }
      await deductBet(userId, activeBet, 'blackjack');
      state = playerDouble(state);
    } else {
      // split
      if (!canSplit(state)) {
        res.status(400).json({ error: 'Cannot split this hand' });
        return;
      }
      await deductBet(userId, activeBet, 'blackjack');
      state = playerSplit(state);
    }

    if (state.phase === 'dealer_turn') {
      const newBalance = await settleBlackjack(userId, sessionId, state);
      res.json(serializeBlackjack(state, sessionId, newBalance));
      return;
    }

    await db
      .update(gameSessions)
      .set({ state: JSON.stringify(state), updatedAt: new Date() })
      .where(eq(gameSessions.id, sessionId));

    res.json(serializeBlackjack(state, sessionId));
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'INSUFFICIENT_FUNDS') { res.status(402).json({ error: 'Insufficient funds' }); return; }
    console.error('[games] blackjack action error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// GET /api/games/blackjack/active-session
// Returns the player open hand so a refresh can resume play. The dealer hole
// card stays hidden during the player turn.
gamesRouter.get('/blackjack/active-session', requireAuth, async (req, res) => {
  const userId = req.user!.id;

  try {
    const rows = await db
      .select()
      .from(gameSessions)
      .where(and(eq(gameSessions.userId, userId), eq(gameSessions.gameType, 'blackjack'), isNull(gameSessions.completedAt)))
      .orderBy(desc(gameSessions.createdAt))
      .limit(1);

    const session = rows[0];
    if (!session) {
      res.json({ session: null });
      return;
    }

    const state = JSON.parse(session.state) as BlackjackSessionState;
    res.json({ session: serializeBlackjack(state, session.id) });
  } catch (err: unknown) {
    console.error('[games] blackjack active-session error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

void totalProfit; // exported for tests/diagnostics
