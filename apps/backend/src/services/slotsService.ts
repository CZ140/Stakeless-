import { randomInt } from 'node:crypto';
import { SLOTS, SLOT_TOTAL_WEIGHT, symbolForRoll, type SlotGrid } from '@gambling/shared';

// Fill the 3×3 grid with independent crypto-secure weighted draws — one per cell,
// matching the rest of the platform (Roulette/Plinko/Mines/Dice all use
// crypto.randomInt). The roll→symbol mapping lives in @gambling/shared so the
// frontend's paytable and the backend's settlement agree exactly.
export function spinGrid(): SlotGrid {
  const grid: SlotGrid = [];
  for (let reel = 0; reel < SLOTS.REELS; reel++) {
    const column = [];
    for (let row = 0; row < SLOTS.ROWS; row++) {
      column.push(symbolForRoll(randomInt(0, SLOT_TOTAL_WEIGHT)));
    }
    grid.push(column);
  }
  return grid;
}
