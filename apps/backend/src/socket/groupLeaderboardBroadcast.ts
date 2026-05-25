// Per-group private leaderboard broadcaster — the group-scoped twin of
// leaderboardBroadcast.ts. Each tick it inspects the live socket rooms and only
// recomputes boards for groups that currently have ≥1 subscriber (a `group:<id>`
// room only exists while a member is viewing), so idle groups cost nothing.
import type { Server } from 'socket.io';
import { computeGroupLeaderboard } from '../services/groupService.js';

const BROADCAST_INTERVAL_MS = 7000;
let broadcastInterval: ReturnType<typeof setInterval> | null = null;

export function startGroupLeaderboardBroadcast(io: Server): void {
  // Guard against duplicate timers on hot reload.
  if (broadcastInterval !== null) {
    clearInterval(broadcastInterval);
  }
  broadcastInterval = setInterval(async () => {
    try {
      // Rooms named `group:<id>` only exist while a member is subscribed.
      const groupIds: number[] = [];
      for (const room of io.sockets.adapter.rooms.keys()) {
        if (room.startsWith('group:')) {
          const id = Number(room.slice('group:'.length));
          if (Number.isInteger(id)) groupIds.push(id);
        }
      }
      if (groupIds.length === 0) return; // no subscribers anywhere → no work

      await Promise.all(
        groupIds.map(async (groupId) => {
          const snapshot = await computeGroupLeaderboard(groupId);
          io.to(`group:${groupId}`).emit('group:leaderboard', { groupId, snapshot });
        }),
      );
    } catch (err) {
      console.error('[group leaderboard broadcast] failed:', err);
    }
  }, BROADCAST_INTERVAL_MS);
}
