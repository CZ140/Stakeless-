import { randomInt } from 'node:crypto';

export type RiskLevel = 'low' | 'medium' | 'high' | 'expert';

// Stake.com-referenced Plinko multiplier tables.
// Structure: PLINKO_MULTIPLIERS[riskLevel][rows] = number[] with (rows+1) elements (symmetric)
// Low risk: gentle curve — small edge boost, center is near 1×
// Medium risk: steeper curve — edges meaningfully higher
// High risk: extreme edges — center is heavily penalized
// Expert risk: even more extreme than High
//
// Bucket counts per row:
//   8 rows → 9 buckets   11 rows → 12 buckets   14 rows → 15 buckets
//   9 rows → 10 buckets  12 rows → 13 buckets   15 rows → 16 buckets
//  10 rows → 11 buckets  13 rows → 14 buckets   16 rows → 17 buckets
export const PLINKO_MULTIPLIERS: Record<RiskLevel, Record<number, number[]>> = {
  low: {
    //            0    1    2    3    4    5    6    7    8
    8:  [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
    //         0    1    2    3    4    5    6    7    8    9
    9:  [5.6, 2.0, 1.6, 1.0, 0.7, 0.7, 1.0, 1.6, 2.0, 5.6],
    //          0    1    2    3    4    5    6    7    8    9   10
    10: [8.9, 3.0, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 3.0, 8.9],
    //          0    1    2    3    4    5    6    7    8    9   10   11
    11: [8.4, 3.0, 1.9, 1.3, 1.0, 0.7, 0.7, 1.0, 1.3, 1.9, 3.0, 8.4],
    //         0   1    2    3    4    5    6    7    8    9   10   11  12
    12: [14, 4.3, 2, 1.6, 1.4, 0.72, 0.465, 0.72, 1.4, 1.6, 2, 4.3, 14],
    //          0    1    2    3    4    5    6    7    8    9   10   11   12   13
    13: [8.8, 4.4, 3.3, 2.1, 1.3, 0.98, 0.548, 0.548, 0.98, 1.3, 2.1, 3.3, 4.4, 8.8],
    //          0    1    2    3    4    5    6    7    8    9   10   11   12   13   14
    14: [8, 4.5, 2.1, 1.6, 1.5, 1.2, 0.79, 0.577, 0.79, 1.2, 1.5, 1.6, 2.1, 4.5, 8],
    //          0    1    2    3    4    5    6    7    8    9   10   11   12   13   14   15
    15: [16, 8.7, 3.3, 2.2, 1.6, 1.2, 1.1, 0.533, 0.533, 1.1, 1.2, 1.6, 2.2, 3.3, 8.7, 16],
    //          0   1   2    3    4    5    6    7    8    9   10   11   12   13   14  15  16
    16: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1.0, 0.5, 1.0, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  },
  medium: {
    //          0   1    2    3    4    3    2    1    0  (symmetric)
    8:  [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    9:  [18, 4, 1.7, 0.9, 0.5, 0.5, 0.9, 1.7, 4, 18],
    10: [22, 5, 2.0, 1.4, 0.6, 0.4, 0.6, 1.4, 2.0, 5, 22],
    11: [24, 6, 3.0, 1.8, 0.7, 0.5, 0.5, 0.7, 1.8, 3.0, 6, 24],
    12: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    13: [43, 13, 6, 3, 1.3, 0.7, 0.4, 0.4, 0.7, 1.3, 3, 6, 13, 43],
    14: [57, 15, 6.9, 3.9, 1.9, 0.98, 0.49, 0.268, 0.49, 0.98, 1.9, 3.9, 6.9, 15, 57],
    15: [88, 18, 11, 5, 3, 1.3, 0.5, 0.3, 0.3, 0.5, 1.3, 3, 5, 11, 18, 88],
    16: [110, 41, 10, 5, 3, 1.5, 1.0, 0.5, 0.3, 0.5, 1.0, 1.5, 3, 5, 10, 41, 110],
  },
  high: {
    8:  [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
    9:  [43, 7, 2.0, 0.6, 0.2, 0.2, 0.6, 2.0, 7, 43],
    10: [76, 10, 3.0, 0.9, 0.3, 0.2, 0.3, 0.9, 3.0, 10, 76],
    11: [120, 14, 5.2, 1.4, 0.4, 0.2, 0.2, 0.4, 1.4, 5.2, 14, 120],
    12: [170, 24, 8.1, 2.0, 0.7, 0.2, 0.2, 0.2, 0.7, 2.0, 8.1, 24, 170],
    13: [229, 33, 9.7, 3.5, 1.2, 0.35, 0.193, 0.193, 0.35, 1.2, 3.5, 9.7, 33, 229],
    14: [396, 53, 17, 4.7, 1.9, 0.47, 0.19, 0.175, 0.19, 0.47, 1.9, 4.7, 17, 53, 396],
    15: [620, 83, 27, 8, 3, 0.5, 0.2, 0.2, 0.2, 0.2, 0.5, 3, 8, 27, 83, 620],
    16: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
  expert: {
    8:  [37, 4.8, 1.4, 0.14, 0.122, 0.14, 1.4, 4.8, 37],
    9:  [55, 8.2, 2.2, 0.38, 0.107, 0.107, 0.38, 2.2, 8.2, 55],
    10: [90, 13, 3.6, 0.67, 0.13, 0.136, 0.13, 0.67, 3.6, 13, 90],
    11: [140, 21, 5.6, 1.4, 0.19, 0.089, 0.089, 0.19, 1.4, 5.6, 21, 140],
    12: [199, 32, 8, 2.4, 0.6, 0.08, 0.061, 0.08, 0.6, 2.4, 8, 32, 199],
    13: [329, 49, 12, 3.3, 1.2, 0.12, 0.115, 0.115, 0.12, 1.2, 3.3, 12, 49, 329],
    14: [379, 76, 19, 5.3, 1.9, 0.38, 0.08, 0.062, 0.08, 0.38, 1.9, 5.3, 19, 76, 379],
    15: [751, 113, 30, 7.5, 3, 0.75, 0.08, 0.072, 0.072, 0.08, 0.75, 3, 7.5, 30, 113, 751],
    16: [2083, 208, 42, 10, 4.2, 1.2, 0.21, 0.08, 0.141, 0.08, 0.21, 1.2, 4.2, 10, 42, 208, 2083],
  },
};

/**
 * Rolls a landing bucket the way a real Plinko ball lands: at each of the `rows`
 * pegs the ball goes left or right with equal probability, so the bucket index
 * is the count of right-bounces — a Binomial(rows, 0.5) distribution.
 *
 * This is the crux of fair Plinko odds. A uniform pick (randomInt(0, rows+1))
 * would give every bucket the same chance, making the huge edge multipliers
 * (e.g. expert/16 pays 5000× at the edges) wildly likely — ~1/17 each instead
 * of the intended ~1/65536 — which is both "too easy" and hugely +EV. The
 * multiplier tables are calibrated for this binomial distribution.
 *
 * @param rows - Number of peg rows (8–16); bucket is 0..rows.
 */
export function rollPlinkoBucket(rows: number): number {
  let bucket = 0;
  for (let i = 0; i < rows; i++) {
    bucket += randomInt(0, 2); // 0 (left) or 1 (right)
  }
  return bucket;
}

/**
 * Returns the multiplier for the given Plinko configuration.
 * Returns 0 if any parameter is invalid.
 *
 * @param rows        - Number of peg rows (8–16)
 * @param riskLevel   - Risk level string ('low'|'medium'|'high'|'expert')
 * @param bucketIndex - Which bucket (0 = far left, rows = far right)
 */
export function resolvePlinko(rows: number, riskLevel: string, bucketIndex: number): number {
  const table = PLINKO_MULTIPLIERS[riskLevel as RiskLevel];
  if (!table) return 0;

  const buckets = table[rows];
  if (!buckets) return 0;

  if (bucketIndex < 0 || bucketIndex >= buckets.length) return 0;

  return buckets[bucketIndex] ?? 0;
}
