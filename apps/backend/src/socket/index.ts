import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type {
  FriendDTO,
  FriendRequestDTO,
  GroupInviteDTO,
  GroupLeaderboardSnapshot,
  PublicTableState,
  PrivateHand,
  PokerHandResult,
} from '@gambling/shared';
import { attachAuthMiddleware } from './authMiddleware.js';
import { startLeaderboardBroadcast } from './leaderboardBroadcast.js';
import { startGroupLeaderboardBroadcast } from './groupLeaderboardBroadcast.js';
import { isGroupMember, computeGroupLeaderboard } from '../services/groupService.js';
import { attachPokerRealtime } from './poker.js';
import { tableManager } from '../services/poker/manager.js';

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
  // Poker: public table state to the poker:<id> room; private hole cards to the
  // seated player's user room; the finished-hand result to the table room.
  'poker:state': (data: { tableId: number; state: PublicTableState }) => void;
  'poker:hand': (data: { tableId: number; hand: PrivateHand }) => void;
  'poker:result': (data: { tableId: number; result: PokerHandResult }) => void;
}

interface ClientToServerEvents {
  // Subscribe/unsubscribe to a group's private leaderboard room. Subscribe is
  // membership-verified server-side before the socket joins.
  'group:subscribe': (groupId: number) => void;
  'group:unsubscribe': (groupId: number) => void;
  // Spectate/seat a poker table room (public state only — hole cards go to the
  // user room). Anyone who can see the table may subscribe.
  'poker:subscribe': (tableId: number) => void;
  'poker:unsubscribe': (tableId: number) => void;
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

    // Join a poker table room (spectate or watch your seat). Only public state is
    // broadcast to the room; hole cards are sent to the user room. Push the
    // current snapshot immediately so the page renders without waiting.
    socket.on('poker:subscribe', async (tableId: number) => {
      if (!Number.isInteger(tableId)) return;
      await socket.join(`poker:${tableId}`);
      try {
        const eng = tableManager._engine(tableId);
        if (eng) {
          io.to(socket.id).emit('poker:state', { tableId, state: eng.toPublicState() });
          const uid = socket.data.userId;
          if (uid !== undefined) {
            const hand = eng.privateHandFor(uid);
            if (hand) io.to(socket.id).emit('poker:hand', { tableId, hand });
          }
        }
      } catch (err) {
        console.error('[socket] poker:subscribe failed:', err);
      }
    });
    socket.on('poker:unsubscribe', (tableId: number) => {
      void socket.leave(`poker:${tableId}`);
    });
  });

  startLeaderboardBroadcast(io);
  startGroupLeaderboardBroadcast(io);
  attachPokerRealtime(io);
}
