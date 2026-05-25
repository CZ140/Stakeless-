import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type {
  FriendDTO,
  FriendRequestDTO,
  GroupInviteDTO,
  GroupLeaderboardSnapshot,
} from '@gambling/shared';
import { attachAuthMiddleware } from './authMiddleware.js';
import { startLeaderboardBroadcast } from './leaderboardBroadcast.js';
import { startGroupLeaderboardBroadcast } from './groupLeaderboardBroadcast.js';
import { isGroupMember, computeGroupLeaderboard } from '../services/groupService.js';

interface LeaderboardRow {
  id: number;
  username: string;
  value: number;
  tierLevel: number;
  avatarColor: string | null;
}

interface LeaderboardSnapshot {
  byBalance: LeaderboardRow[];
  byWagered: LeaderboardRow[];
  byProfit: LeaderboardRow[];
}

interface TierUpEvent {
  level: number;
  name: string;
  reward: number;
  dailyBonus: number;
}

interface ServerToClientEvents {
  'leaderboard:update': (data: LeaderboardSnapshot) => void;
  'balance:update': (data: { balance: number }) => void;
  'tier:up': (data: TierUpEvent) => void;
  // Crash round resolution, pushed to the player's room by the crash scheduler.
  'crash:bust': (data: { sessionId: number; crashPoint: number }) => void;
  'crash:cashout': (data: {
    sessionId: number;
    multiplier: number;
    payout: number;
    newBalance: number;
    auto: boolean;
  }) => void;
  // Social: pushed to the target's user:<id> room.
  'friend:request': (data: { request: FriendRequestDTO }) => void;
  'friend:accepted': (data: { friend: FriendDTO }) => void;
  'group:invite': (data: { invite: GroupInviteDTO }) => void;
  // Private group leaderboard — pushed to the group:<id> room (members only).
  'group:leaderboard': (data: { groupId: number; snapshot: GroupLeaderboardSnapshot }) => void;
}

interface ClientToServerEvents {
  // Subscribe/unsubscribe to a group's private leaderboard room. Subscribe is
  // membership-verified server-side before the socket joins.
  'group:subscribe': (groupId: number) => void;
  'group:unsubscribe': (groupId: number) => void;
}

interface SocketData {
  userId?: number;
}

export let io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export function createSocketServer(server: HttpServer): void {
  io = new Server(server, {
    cors: {
      // Socket.IO CORS is separate from Express cors middleware — both must be configured
      origin: ['http://localhost:5173'],
      credentials: true,
    },
  });

  attachAuthMiddleware(io);

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    if (userId !== undefined) {
      void socket.join(`user:${userId}`);
    }
    // All sockets (auth and guest) receive leaderboard:update via io.emit

    // Join a group's private leaderboard room — only after verifying the socket's
    // user is a member (else anyone could read any group's board). Pushes an
    // immediate snapshot so the page doesn't wait for the next broadcast tick.
    socket.on('group:subscribe', async (groupId: number) => {
      const uid = socket.data.userId;
      if (uid === undefined || !Number.isInteger(groupId)) return;
      try {
        if (await isGroupMember(uid, groupId)) {
          await socket.join(`group:${groupId}`);
          const snapshot = await computeGroupLeaderboard(groupId);
          io.to(socket.id).emit('group:leaderboard', { groupId, snapshot });
        }
      } catch (err) {
        console.error('[socket] group:subscribe failed:', err);
      }
    });

    socket.on('group:unsubscribe', (groupId: number) => {
      void socket.leave(`group:${groupId}`);
    });
  });

  startLeaderboardBroadcast(io);
  startGroupLeaderboardBroadcast(io);
}
