import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { attachAuthMiddleware } from './authMiddleware.js';
import { startLeaderboardBroadcast } from './leaderboardBroadcast.js';

interface LeaderboardRow {
  id: number;
  username: string;
  value: number;
  tierLevel: number;
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
}

interface ClientToServerEvents {
  // Clients do not send custom events in Phase 6
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
  });

  startLeaderboardBroadcast(io);
}
