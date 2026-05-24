import rateLimit from 'express-rate-limit';

// Applied to: /register, /login, /forgot-password
// Counts only failed attempts (skipSuccessfulRequests: true)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
});

// gameLimiter — 120 POST requests per minute per IP on all POST /api/games/* routes (ANTI-01).
// The 100ms clickInterval is the hard anti-bot guard (≤10 req/s); this per-minute
// cap is a secondary sustained-rate ceiling. 30/min was too low for Plinko's
// rapid multi-ball play (it 429'd normal spamming); 120/min keeps it bounded.
export const gameLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Slow down.' },
});
