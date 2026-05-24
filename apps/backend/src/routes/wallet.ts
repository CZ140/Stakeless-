import { Router, type IRouter } from 'express';
import { randomInt } from 'node:crypto';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateBet } from '../middleware/validateBet.js';
import { claimDailyBonus, deductBet, settleBet } from '../services/walletService.js';

export const walletRouter: IRouter = Router();

// POST /api/wallet/bonus
// Requires a valid Bearer token (requireAuth middleware).
// Returns 200 { newBalance, nextClaimAt, amount } on success.
// Returns 429 { error, msUntilNext } if the 24h cooldown has not elapsed.
// Returns 500 on unexpected errors.
walletRouter.post('/bonus', requireAuth, async (req, res) => {
  try {
    const { newBalance, nextClaimAt, amount } = await claimDailyBonus(req.user!.id);
    res.json({ newBalance, nextClaimAt, amount });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'BONUS_NOT_READY') {
      const msUntilNext = (err as { msUntilNext?: number }).msUntilNext;
      res.status(429).json({ error: 'Bonus not available yet', msUntilNext });
      return;
    }
    console.error('[wallet] bonus error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// POST /api/wallet/bet
// Coin-flip game endpoint — demonstrates the full GINF-01..05 pipeline.
// Requires a valid Bearer token (requireAuth) and validated bet params (validateBet).
// Pipeline: validateBet → deductBet → randomInt coin-flip → settleBet → respond
//
// Returns 200 { outcome, profit, newBalance } on success.
// Returns 400 if betAmount < 1 (GINF-05 — caught by validateBet before this handler).
// Returns 402 if balance < betAmount (GINF-01 — caught in deductBet).
// Returns 500 on unexpected errors.
//
// NOTE: deductBet and settleBet are intentionally TWO separate DB transactions.
// Stateful games in Phase 4 need them separate (deduct before play, settle after outcome).
// For coin-flip they execute back-to-back in the same request.
walletRouter.post('/bet', requireAuth, validateBet, async (req, res) => {
  const userId = req.user!.id;
  const { betAmount, gameType } = req.body as { betAmount: number; gameType: string };

  try {
    // Step 1: Atomically deduct bet from balance (GINF-01 — throws INSUFFICIENT_FUNDS if short)
    await deductBet(userId, betAmount, gameType);

    // Step 2: Resolve outcome using crypto.randomInt (GINF-02 — never Math.random())
    const isWin = randomInt(0, 2) === 1; // 50% probability, cryptographically secure
    const profit = isWin ? betAmount : 0; // win: 2× return (profit = betAmount); loss: profit = 0
    const outcome: 'win' | 'loss' = isWin ? 'win' : 'loss';

    // Step 3: Credit winnings and append game_logs row (GINF-03, GINF-04)
    const { newBalance } = await settleBet(userId, profit, betAmount, outcome, gameType);

    // Step 4: Return result
    res.json({ outcome, profit, newBalance });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'INSUFFICIENT_FUNDS') {
      res.status(402).json({ error: 'Insufficient funds' });
      return;
    }
    if (code === 'BET_TOO_SMALL') {
      res.status(400).json({ error: 'Minimum bet is 1 coin' });
      return;
    }
    console.error('[wallet] bet error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});
