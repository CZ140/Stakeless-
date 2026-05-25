import './env.js'; // Must be first — crashes with clear error if env vars are missing
import { createServer } from 'node:http';
import { env } from './env.js';
import { createApp } from './app.js';
import { createSocketServer } from './socket/index.js';
import { tableManager } from './services/poker/manager.js';

const app = createApp();
const server = createServer(app);
createSocketServer(server);

server.listen(env.PORT, async () => {
  console.log(`[backend] Running at http://localhost:${env.PORT}`);
  console.log(`[backend] Health check: http://localhost:${env.PORT}/api/health`);
  // Crash recovery: a restart abandons in-memory poker hands, so return every
  // parked seat stack to its owner's balance and clear the seats (no stranded coins).
  try {
    const { seats, chips } = await tableManager.refundAllSeats();
    if (seats > 0) console.log(`[backend] Poker crash-recovery: refunded ${chips} chips across ${seats} seat(s)`);
  } catch (e) {
    console.error('[backend] Poker crash-recovery failed:', e);
  }
});
