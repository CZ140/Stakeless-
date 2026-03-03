// European roulette constants
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type BetZone =
  | 'red'
  | 'black'
  | 'odd'
  | 'even'
  | 'dozen_1'
  | 'dozen_2'
  | 'dozen_3'
  | 'col_1'
  | 'col_2'
  | 'col_3'
  | `number_${number}`;

export interface PlacedBet {
  zone: BetZone;
  amount: number;
}

// ─── resolveRouletteBets ────────────────────────────────────────────────────────
// Pure function — no I/O.
// Returns the net profit for all placed bets given a winning pocket number.
//
// Profit semantics: deductBet already removes the full totalBet.
// So profit here is PURE winnings added back on top of the deducted stake.
//   - On a 1:1 win: profit = betAmount (player receives bet back as winnings)
//   - On a 2:1 win: profit = betAmount * 2
//   - On a 35:1 straight-up win: profit = betAmount * 35
//   - On a loss: profit = 0
export function resolveRouletteBets(
  winningPocket: number,
  bets: Array<{ zone: string; amount: number }>,
): number {
  let profit = 0;
  for (const bet of bets) {
    if (isBetWon(winningPocket, bet.zone)) {
      profit += bet.amount * getMultiplier(bet.zone);
    }
  }
  return profit;
}

function isBetWon(pocket: number, zone: string): boolean {
  if (pocket === 0) {
    // Zero (green): only a straight-up number_0 bet wins on zero.
    // All outside bets (red/black, odd/even, dozens, columns) lose.
    return zone === 'number_0';
  }
  switch (zone) {
    case 'red':
      return RED_NUMBERS.has(pocket);
    case 'black':
      return !RED_NUMBERS.has(pocket);
    case 'odd':
      return pocket % 2 !== 0;
    case 'even':
      return pocket % 2 === 0;
    case 'dozen_1':
      return pocket >= 1 && pocket <= 12;
    case 'dozen_2':
      return pocket >= 13 && pocket <= 24;
    case 'dozen_3':
      return pocket >= 25 && pocket <= 36;
    case 'col_1':
      return pocket % 3 === 1;
    case 'col_2':
      return pocket % 3 === 2;
    case 'col_3':
      // pocket is guaranteed non-zero here (zero guard above handles zero)
      return pocket % 3 === 0;
    default: {
      const n = parseInt(zone.replace('number_', ''), 10);
      return pocket === n;
    }
  }
}

function getMultiplier(zone: string): number {
  if (zone.startsWith('number_')) return 35;
  if (['dozen_1', 'dozen_2', 'dozen_3', 'col_1', 'col_2', 'col_3'].includes(zone)) return 2;
  return 1; // red, black, odd, even — 1:1 payout
}
