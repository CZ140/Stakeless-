// Shared TypeScript types for @gambling/shared

// Tier progression — table + helpers shared by backend (persistence, rewards,
// daily bonus) and frontend (badges, profile ladder). Named re-exports document
// the public API. NOTE: this package needs "type": "module" in package.json —
// without it Node treats these files as CommonJS and `import { TIERS }` fails to
// bind statically (only dynamic import would see the names).
export {
  TIERS,
  tierLevelForWagered,
  tierForWagered,
  tierByLevel,
  nextTier,
} from './tiers.js';
export type { Tier } from './tiers.js';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

// Game types (stubs for future phases)
export type GameType = 'roulette' | 'plinko' | 'mines' | 'blackjack';

// Wallet / Game types (Phase 3+)
export interface BetRequest {
  betAmount: number;
  gameType?: string;
}

export interface BetResponse {
  outcome: 'win' | 'loss';
  profit: number;
  newBalance: number;
}
