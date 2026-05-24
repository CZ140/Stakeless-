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

// gameLimiter — 30 POST requests per minute per IP on all POST /api/games/* routes (ANTI-01)
export const gameLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  // Integration tests make many game POSTs from one IP within a minute; the
  // limit itself is verified separately, so skip it under test.
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many requests. Slow down.' },
});
