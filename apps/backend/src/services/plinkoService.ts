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
    12: [10, 3, 1.4, 1.1, 1.0, 0.5, 0.3, 0.5, 1.0, 1.1, 1.4, 3, 10],
    //          0    1    2    3    4    5    6    7    8    9   10   11   12   13
    13: [8.1, 4.0, 3.0, 1.9, 1.2, 0.9, 0.5, 0.5, 0.9, 1.2, 1.9, 3.0, 4.0, 8.1],
    //          0    1    2    3    4    5    6    7    8    9   10   11   12   13   14
    14: [7.1, 4.0, 1.9, 1.4, 1.3, 1.1, 0.7, 0.5, 0.7, 1.1, 1.3, 1.4, 1.9, 4.0, 7.1],
    //          0    1    2    3    4    5    6    7    8    9   10   11   12   13   14   15
    15: [15, 8.0, 3.0, 2.0, 1.5, 1.1, 1.0, 0.5, 0.5, 1.0, 1.1, 1.5, 2.0, 3.0, 8.0, 15],
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
    14: [58, 15, 7, 4, 1.9, 1.0, 0.5, 0.3, 0.5, 1.0, 1.9, 4, 7, 15, 58],
    15: [88, 18, 11, 5, 3, 1.3, 0.5, 0.3, 0.3, 0.5, 1.3, 3, 5, 11, 18, 88],
    16: [110, 41, 10, 5, 3, 1.5, 1.0, 0.5, 0.3, 0.5, 1.0, 1.5, 3, 5, 10, 41, 110],
  },
  high: {
    8:  [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
    9:  [43, 7, 2.0, 0.6, 0.2, 0.2, 0.6, 2.0, 7, 43],
    10: [76, 10, 3.0, 0.9, 0.3, 0.2, 0.3, 0.9, 3.0, 10, 76],
    11: [120, 14, 5.2, 1.4, 0.4, 0.2, 0.2, 0.4, 1.4, 5.2, 14, 120],
    12: [170, 24, 8.1, 2.0, 0.7, 0.2, 0.2, 0.2, 0.7, 2.0, 8.1, 24, 170],
    13: [260, 37, 11, 4, 1.4, 0.4, 0.2, 0.2, 0.4, 1.4, 4, 11, 37, 260],
    14: [420, 56, 18, 5, 2.0, 0.5, 0.2, 0.2, 0.2, 0.5, 2.0, 5, 18, 56, 420],
    15: [620, 83, 27, 8, 3, 0.5, 0.2, 0.2, 0.2, 0.2, 0.5, 3, 8, 27, 83, 620],
    16: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
  expert: {
    8:  [76, 10, 3, 0.3, 0.2, 0.3, 3, 10, 76],
    9:  [100, 15, 4, 0.7, 0.2, 0.2, 0.7, 4, 15, 100],
    10: [200, 30, 8, 1.5, 0.3, 0.2, 0.3, 1.5, 8, 30, 200],
    11: [300, 45, 12, 3, 0.4, 0.2, 0.2, 0.4, 3, 12, 45, 300],
    12: [500, 80, 20, 6, 1.5, 0.2, 0.2, 0.2, 1.5, 6, 20, 80, 500],
    13: [800, 120, 30, 8, 3, 0.3, 0.2, 0.2, 0.3, 3, 8, 30, 120, 800],
    14: [1000, 200, 50, 14, 5, 1.0, 0.2, 0.2, 0.2, 1.0, 5, 14, 50, 200, 1000],
    15: [2000, 300, 80, 20, 8, 2, 0.2, 0.2, 0.2, 0.2, 2, 8, 20, 80, 300, 2000],
    16: [5000, 500, 100, 25, 10, 3, 0.5, 0.2, 0.2, 0.2, 0.5, 3, 10, 25, 100, 500, 5000],
  },
};

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
