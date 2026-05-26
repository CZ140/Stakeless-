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
  PokerInvite,
  PokerChatMessage,
} from '@gambling/shared';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { attachAuthMiddleware } from './authMiddleware.js';
import { startLeaderboardBroadcast } from './leaderboardBroadcast.js';
import { startGroupLeaderboardBroadcast } from './groupLeaderboardBroadcast.js';
import { isGroupMember, computeGroupLeaderboard } from '../services/groupService.js';
import { listFriendIds } from '../services/friendService.js';
import { markOnline, markOffline } from '../services/presence.js';
import { attachPokerRealtime } from './poker.js';
import { tableManager } from '../services/poker/manager.js';
import { sanitizeChat, allowChat, addChatMessage, chatHistory } from '../services/poker/chat.js';
import { handHistory } from '../services/poker/history.js';

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
  // A friend came online/offline — pushed to each of that user's friends' rooms.
  'presence:update': (data: { userId: number; online: boolean }) => void;
  // Private group leaderboard — pushed to the group:<id> room (members only).
  'group:leaderboard': (data: { groupId: number; snapshot: GroupLeaderboardSnapshot }) => void;
  // Poker: public table state to the poker:<id> room; private hole cards to the
  // seated player's user room; the finished-hand result to the table room.
  'poker:state': (data: { tableId: number; state: PublicTableState }) => void;
  'poker:hand': (data: { tableId: number; hand: PrivateHand }) => void;
  'poker:result': (data: { tableId: number; result: PokerHandResult }) => void;
  // A friend invited you to a poker table — pushed to your user room.
  'poker:invite': (data: PokerInvite) => void;
  // Table chat: one new line to the room, plus the recent backlog on subscribe.
  'poker:chat': (data: { tableId: number; message: PokerChatMessage }) => void;
  'poker:chathistory': (data: { tableId: number; messages: PokerChatMessage[] }) => void;
  // Recent finished hands, sent on subscribe (live hands arrive via poker:result).
  'poker:handhistory': (data: { tableId: number; hands: PokerHandResult[] }) => void;
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
  // Send a table-chat line (access-gated + rate-limited server-side).
  'poker:chat': (data: { tableId: number; text: string }) => void;
}

interface SocketData {
  userId?: number;
  // Cached display identity (set lazily on first chat) so we don't re-query per line.
  username?: string;
  avatarColor?: string | null;
}

export let io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

// Fan a presence change out to a user's friends (their user:<id> rooms). Rooms
// with no connected sockets just no-op, so this is bounded by friend count.
async function broadcastPresence(userId: number, online: boolean): Promise<void> {
  try {
    const friendIds = await listFriendIds(userId);
    for (const fid of friendIds) {
      io.to(`user:${fid}`).emit('presence:update', { userId, online });
    }
  } catch (err) {
    console.error('[socket] presence broadcast failed:', err);
  }
}

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
      // First socket for this user → they just came online; tell their friends.
      if (markOnline(userId)) void broadcastPresence(userId, true);
      // Last socket gone → offline. (Guest sockets carry no userId, so skip them.)
      socket.on('disconnect', () => {
        if (markOffline(userId)) void broadcastPresence(userId, false);
      });
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
      // Private tables are spectatable only by authorized users (owner / group /
      // invited) — mirrors the membership gate on group:subscribe.
      if (!(await tableManager.canAccessTable(socket.data.userId, tableId))) return;
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
        // Send the recent chat + hand-history backlog so the panels aren't empty.
        io.to(socket.id).emit('poker:chathistory', { tableId, messages: chatHistory(tableId) });
        io.to(socket.id).emit('poker:handhistory', { tableId, hands: handHistory(tableId) });
      } catch (err) {
        console.error('[socket] poker:subscribe failed:', err);
      }
    });
    socket.on('poker:unsubscribe', (tableId: number) => {
      void socket.leave(`poker:${tableId}`);
    });

    // Table chat. Authenticated + access-gated (private tables) + rate-limited;
    // anything that doesn't pass is silently dropped (the client just sees nothing).
    socket.on('poker:chat', async ({ tableId, text }) => {
      const uid = socket.data.userId;
      if (uid === undefined || !Number.isInteger(tableId)) return;
      const clean = sanitizeChat(text);
      if (!clean) return;
      try {
        if (!(await tableManager.canAccessTable(uid, tableId))) return;
        if (!allowChat(uid)) return;
        // Resolve + cache the sender's display identity once per socket.
        if (socket.data.username === undefined) {
          const [u] = await db
            .select({ username: users.username, avatarColor: users.avatarColor })
            .from(users)
            .where(eq(users.id, uid));
          if (!u) return;
          socket.data.username = u.username;
          socket.data.avatarColor = u.avatarColor;
        }
        const message = addChatMessage(tableId, {
          userId: uid,
          username: socket.data.username,
          avatarColor: socket.data.avatarColor ?? null,
          text: clean,
        });
        io.to(`poker:${tableId}`).emit('poker:chat', { tableId, message });
      } catch (err) {
        console.error('[socket] poker:chat failed:', err);
      }
    });
  });

  startLeaderboardBroadcast(io);
  startGroupLeaderboardBroadcast(io);
  attachPokerRealtime(io);
}
