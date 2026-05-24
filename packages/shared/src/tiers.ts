// ─── Tier progression (single source of truth) ──────────────────────────────────
// Tiers are derived from a player's lifetime `totalWagered`. The backend persists
// the reached level (users.tier_level) so it can grant the one-time `reward` the
// first time a player crosses into a tier, and so the daily bonus knows which
// `dailyBonus` to credit. The frontend consumes the same table for badges and the
// profile ladder — no duplicated thresholds.
//
// Thresholds ramp ~6–7× per step on purpose: totalWagered compounds (a bigger
// balance funds bigger bets), so a geometric ladder keeps the top tiers a genuine
// long-haul grind rather than something you snowball into.

export interface Tier {
  /** 0-based rank, also the value persisted in users.tier_level. */
  level: number;
  name: string;
  /** Inclusive lifetime-wagered floor to hold this tier. */
  minWagered: number;
  /** Daily bonus credited while at this tier (coins / 24h). */
  dailyBonus: number;
  /** One-time grant the first time this tier is reached (0 for the base tier). */
  reward: number;
}

export const TIERS: readonly Tier[] = [
  { level: 0, name: 'Bronze', minWagered: 0, dailyBonus: 100, reward: 0 },
  { level: 1, name: 'Silver', minWagered: 25_000, dailyBonus: 150, reward: 1_500 },
  { level: 2, name: 'Gold', minWagered: 150_000, dailyBonus: 250, reward: 8_000 },
  { level: 3, name: 'Platinum', minWagered: 1_000_000, dailyBonus: 400, reward: 50_000 },
  { level: 4, name: 'Diamond', minWagered: 6_000_000, dailyBonus: 650, reward: 250_000 },
  { level: 5, name: 'Obsidian', minWagered: 40_000_000, dailyBonus: 1_000, reward: 1_000_000 },
] as const;

/** Highest tier level whose `minWagered` floor is met by `wagered`. */
export function tierLevelForWagered(wagered: number): number {
  let level = 0;
  for (const t of TIERS) {
    if (wagered >= t.minWagered) level = t.level;
    else break;
  }
  return level;
}

/** The tier a player holds at the given lifetime-wagered amount. */
export function tierForWagered(wagered: number): Tier {
  return TIERS[tierLevelForWagered(wagered)]!;
}

/** Look up a tier by its persisted level, clamped to the valid range. */
export function tierByLevel(level: number): Tier {
  const clamped = Math.max(0, Math.min(TIERS.length - 1, level));
  return TIERS[clamped]!;
}

/** The next tier up, or null if already at the top. */
export function nextTier(level: number): Tier | null {
  return TIERS[level + 1] ?? null;
}
