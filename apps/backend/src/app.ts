import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { walletRouter } from './routes/wallet.js';
import { gamesRouter } from './routes/games.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { profileRouter } from './routes/profile.js';
import { adminRouter } from './routes/admin.js';
import { friendsRouter } from './routes/friends.js';
import { groupsRouter } from './routes/groups.js';
import { devRouter } from './routes/dev.js';

export function createApp(): Express {
  const app = express();

  // Security headers first
  app.use(helmet());

  // CORS — allow requests from Vite dev server
  app.use(
    cors({
      origin: ['http://localhost:5173'],
      credentials: true,
    })
  );

  // Body parsing
  app.use(express.json());

  // Cookie parsing (needed for refresh token httpOnly cookies)
  app.use(cookieParser());

  // Routes
  app.use('/api', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/games', gamesRouter);
  app.use('/api/leaderboard', leaderboardRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/friends', friendsRouter);
  app.use('/api/groups', groupsRouter);

  // Dev-only routes — never registered in production
  if (process.env.NODE_ENV !== 'production') {
    app.use('/api/dev', devRouter);
  }

  return app;
}
