import { reconcileTier } from './walletService.js';
import { io } from '../socket/index.js';

// After a round settles, bring the player's tier in line with their new lifetime
// wager. If they crossed a threshold, the reward was already credited inside
// reconcileTier — push the updated balance again (so the chip flashes the bonus)
// and a tier:up event the client turns into a celebration. Best-effort: a tier
// reconcile failure must never fail the bet the player already won/lost.
//
// Shared by the games router (instant-settle games) and the crash scheduler
// (timer-driven settlement) so every settle path reconciles tiers identically.
export async function applyTierUp(userId: number): Promise<void> {
  try {
    const tierUp = await reconcileTier(userId);
    if (tierUp) {
      io?.to(`user:${userId}`).emit('balance:update', { balance: tierUp.newBalance });
      io?.to(`user:${userId}`).emit('tier:up', {
        level: tierUp.toLevel,
        name: tierUp.name,
        reward: tierUp.reward,
        dailyBonus: tierUp.dailyBonus,
      });
    }
  } catch (err) {
    console.error('[tier] reconcile error:', err);
  }
}
