// ─── Crash ───────────────────────────────────────────────────────────────────
// A multiplier curve rises from 1.00× and "busts" at a hidden, server-decided
// crash point. The player cashes out — manually, or automatically at a preset
// target — before the bust to lock in the current multiplier; if the curve busts
// first, the bet is lost. Pure math shared by the backend (settlement) and the
// frontend (live curve + time↔multiplier mapping). The crypto draw of the crash
// point lives backend-only in services/crashService.ts; the *distribution*
// (crashPointFromUniform) lives here so it's documented and unit-testable.
//
// FAIRNESS: with house edge E, the crash point M has P(M > m) = (1−E)/m for m ≥ 1,
// plus a point mass at 1.00× ("instabust") of probability E. Because the player's
// cash-out multiplier c is chosen without knowledge of M, any strategy that cashes
// out at c wins with probability P(M > c) = (1−E)/c and pays c, so its expected
// return is c·(1−E)/c = 1−E. The RTP is therefore exactly 1−E for every strategy,
// auto or manual. E = 0.03 → 97% RTP, matching the rest of the platform.

export const CRASH = {
  RTP: 0.97,
  HOUSE_EDGE: 0.03,
  // Multiplier growth per second: m(t) = e^(GROWTH·t). 2× ≈ 4.6s, 5× ≈ 10.7s, 10× ≈ 15.3s.
  GROWTH: 0.15,
  // Clamp the crash point so a uniform draw near 1 can't yield Infinity.
  MAX_CRASH: 1_000_000,
  // Lowest auto-cash-out target the UI/API accepts (a win must beat the stake).
  MIN_AUTO_CASHOUT: 1.01,
} as const;

// Displayed multiplier after `elapsedMs` of a running round, floored to 2dp and
// never below 1.00. Backend and frontend share this so the curve agrees exactly.
export function crashMultiplierAt(elapsedMs: number): number {
  if (elapsedMs <= 0) return 1.0;
  return Math.max(1, Math.floor(crashCurveAt(elapsedMs) * 100) / 100);
}

// Raw, *un-floored* multiplier at `elapsedMs` — the smooth underlying curve.
// crashMultiplierAt floors this to 2dp for the readout, but plotting from the
// floored value turns the curve into a staircase (consecutive samples repeat,
// then jump), which a smoothing spline renders as a sawtooth — very visible
// early on when the total rise spans only a handful of 0.01 steps. Plot from
// this continuous value instead; the floored value drives only the number.
export function crashCurveAt(elapsedMs: number): number {
  if (elapsedMs <= 0) return 1.0;
  return Math.exp(CRASH.GROWTH * (elapsedMs / 1000));
}

// Inverse of crashMultiplierAt: ms after start at which the curve first reaches
// multiplier `m` (≥ 1). Used to schedule the bust / auto-cash-out moments.
export function crashTimeToReachMs(m: number): number {
  if (m <= 1) return 0;
  return (Math.log(m) / CRASH.GROWTH) * 1000;
}

// Map a uniform u ∈ [0,1) to a crash point with the house edge baked in (see the
// header). u < HOUSE_EDGE is an instabust at 1.00×; otherwise the renormalised
// tail gives P(M > m) = 1/m. Result is floored to 2dp and capped at MAX_CRASH.
export function crashPointFromUniform(u: number): number {
  if (u < CRASH.HOUSE_EDGE) return 1.0; // instabust
  const u2 = (u - CRASH.HOUSE_EDGE) / (1 - CRASH.HOUSE_EDGE); // renormalise to [0,1)
  const m = 1 / (1 - u2);
  const capped = Math.min(m, CRASH.MAX_CRASH);
  return Math.max(1, Math.floor(capped * 100) / 100);
}

// A cash-out at multiplier `c` wins iff it is strictly below the crash point —
// reaching the crash point exactly counts as the bust (the house wins ties).
export function crashCashoutWins(cashout: number, crashPoint: number): boolean {
  return cashout < crashPoint;
}

export function isValidAutoCashout(t: number): boolean {
  return Number.isFinite(t) && t >= CRASH.MIN_AUTO_CASHOUT && t <= CRASH.MAX_CRASH;
}
