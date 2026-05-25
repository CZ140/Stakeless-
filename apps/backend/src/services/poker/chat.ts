// Table chat — ephemeral, in-memory, per table. Like the live engine state, chat
// is not persisted: it lives only while the server runs (a restart clears it,
// which is fine for casual railbird banter). Each table keeps a small ring buffer
// so a player who joins mid-session sees the last few lines. Pure + DB-free so the
// rules (sanitize, rate limit, buffer cap) are trivially unit-testable; the socket
// layer supplies the sender's identity and does the broadcast.
import { POKER_CHAT_MAX_LEN, type PokerChatMessage } from '@gambling/shared';

const MAX_HISTORY = 50; // lines retained per table
const RATE_WINDOW_MS = 5000;
const RATE_MAX = 5; // messages per window per user

const histories = new Map<number, PokerChatMessage[]>();
const sendLog = new Map<number, number[]>(); // userId → recent send timestamps
let seq = 0;

export function chatHistory(tableId: number): PokerChatMessage[] {
  return histories.get(tableId) ?? [];
}

// Normalize a raw chat string: collapse whitespace (chat is single-line), trim,
// reject empties, and clamp length. Returns null if there's nothing to send.
export function sanitizeChat(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length === 0) return null;
  return t.slice(0, POKER_CHAT_MAX_LEN);
}

// Sliding-window rate limit. Returns false when the user is over the cap (the
// caller silently drops the message). Records the send when allowed.
export function allowChat(userId: number, now = Date.now()): boolean {
  const recent = (sendLog.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    sendLog.set(userId, recent);
    return false;
  }
  recent.push(now);
  sendLog.set(userId, recent);
  return true;
}

// Append a message to a table's buffer (trimming to the cap) and return the
// stored line (with its server id + timestamp) for broadcasting.
export function addChatMessage(
  tableId: number,
  sender: { userId: number; username: string; avatarColor: string | null; text: string },
  now = Date.now(),
): PokerChatMessage {
  const message: PokerChatMessage = { id: ++seq, ts: now, ...sender };
  const list = histories.get(tableId) ?? [];
  list.push(message);
  if (list.length > MAX_HISTORY) list.splice(0, list.length - MAX_HISTORY);
  histories.set(tableId, list);
  return message;
}

// Drop a table's history (or everything, for test isolation).
export function clearChat(tableId?: number): void {
  if (tableId === undefined) {
    histories.clear();
    sendLog.clear();
    seq = 0;
  } else {
    histories.delete(tableId);
  }
}
