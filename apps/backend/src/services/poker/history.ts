// Recent-hands history — ephemeral, in-memory, per table. Like the live engine and
// table chat, finished hands are not persisted: each table keeps the last few
// PokerHandResults so a player (or railbird) can review how recent hands played
// out. A restart clears it, which is fine — chips reset on restart anyway, so there
// is no pre-restart hand to reconcile. Recorded by the manager at hand end; the
// socket layer ships the backlog on subscribe and the live result per hand.
import type { PokerHandResult } from '@gambling/shared';

const MAX_HANDS = 30; // lines retained per table

const histories = new Map<number, PokerHandResult[]>();

// Append a finished hand (kept in play order; trimmed to the cap).
export function recordHand(tableId: number, result: PokerHandResult): void {
  const list = histories.get(tableId) ?? [];
  list.push(result);
  if (list.length > MAX_HANDS) list.splice(0, list.length - MAX_HANDS);
  histories.set(tableId, list);
}

// Recent hands, most-recent-first (ready for display).
export function handHistory(tableId: number): PokerHandResult[] {
  return [...(histories.get(tableId) ?? [])].reverse();
}

// Drop a table's history (or everything, for test isolation).
export function clearHistory(tableId?: number): void {
  if (tableId === undefined) histories.clear();
  else histories.delete(tableId);
}
