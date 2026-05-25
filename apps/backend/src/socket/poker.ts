// Poker realtime glue. Attaches the table manager's hooks to Socket.IO so each
// table-state change is pushed to the table room (public state) and each seated
// human's own hole cards to their user room. Also owns the per-table TIMERS:
//   • a turn timer that auto-checks/folds a human who runs out of time
//   • a bot timer that makes the acting bot move after a short delay
//   • a between-hands timer that deals the next hand
// All timers are server-side; the manager stays transport-agnostic.
import type { Server } from 'socket.io';
import { tableManager } from '../services/poker/manager.js';
import { POKER } from '@gambling/shared';

const NEXT_HAND_DELAY_MS = 4000;
const BOT_MIN_MS = 800;
const BOT_MAX_MS = 1900;

// Per-table timers + the current human turn deadline (epoch ms).
const turnTimers = new Map<number, ReturnType<typeof setTimeout>>();
const nextHandTimers = new Map<number, ReturnType<typeof setTimeout>>();
const deadlines = new Map<number, number>();

function clearTurn(tableId: number): void {
  const t = turnTimers.get(tableId);
  if (t) clearTimeout(t);
  turnTimers.delete(tableId);
  deadlines.delete(tableId);
}

export function attachPokerRealtime(io: Server): void {
  // Push the public state to the room + private hole cards to each seated human.
  function pushState(tableId: number): void {
    const eng = tableManager._engine(tableId);
    if (!eng) return;
    const state = eng.toPublicState();
    state.actionDeadline = deadlines.get(tableId) ?? null;
    io.to(`poker:${tableId}`).emit('poker:state', { tableId, state });
    for (const s of eng.occupiedSeats()) {
      if (s.isBot) continue;
      const hand = eng.privateHandFor(s.userId);
      if (hand) io.to(`user:${s.userId}`).emit('poker:hand', { tableId, hand });
    }
  }

  // Arm the acting seat: schedule the bot to move, or a turn timeout for a human.
  function armActor(tableId: number): void {
    clearTurn(tableId);
    const eng = tableManager._engine(tableId);
    if (!eng || eng.actingIndex === null) return;
    const seat = eng.occupiedSeats().find((s) => s.seatIndex === eng.actingIndex);
    if (!seat) return;
    if (seat.isBot) {
      const delay = BOT_MIN_MS + Math.floor(Math.random() * (BOT_MAX_MS - BOT_MIN_MS));
      turnTimers.set(
        tableId,
        setTimeout(() => {
          void tableManager.runBotAction(tableId);
        }, delay),
      );
    } else {
      deadlines.set(tableId, Date.now() + POKER.TURN_MS);
      turnTimers.set(
        tableId,
        setTimeout(() => {
          void tableManager.timeoutCurrentActor(tableId);
        }, POKER.TURN_MS),
      );
    }
  }

  tableManager.hooks = {
    onStateChange: (tableId) => pushState(tableId),
    onHandResult: (tableId) => {
      const eng = tableManager._engine(tableId);
      if (eng?.lastResult) io.to(`poker:${tableId}`).emit('poker:result', { tableId, result: eng.lastResult });
    },
    onActorChanged: (tableId) => armActor(tableId),
    onHandEnded: (tableId) => {
      clearTurn(tableId);
      const prev = nextHandTimers.get(tableId);
      if (prev) clearTimeout(prev);
      nextHandTimers.set(
        tableId,
        setTimeout(() => {
          void tableManager.startNextHandIfReady(tableId);
        }, NEXT_HAND_DELAY_MS),
      );
    },
  };
}
