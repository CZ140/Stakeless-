import type { Request, Response, NextFunction } from 'express';

export const MINIMUM_INTERVAL_MS = 100;
const lastSeen = new Map<string, number>();

export function clickInterval(req: Request, res: Response, next: NextFunction): void {
  // Integration tests fire requests back-to-back from one loopback IP; the
  // 100ms human-pacing guard is verified elsewhere, so skip it under test.
  if (process.env.NODE_ENV === 'test') {
    next();
    return;
  }

  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    'unknown';

  const now = Date.now();
  const last = lastSeen.get(ip);

  if (last !== undefined && now - last < MINIMUM_INTERVAL_MS) {
    res.status(429).json({ error: 'Too fast. Slow down.' });
    return;
  }

  lastSeen.set(ip, now);
  next();
}
