import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from './requireAuth.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Step 1: JWT verification — requireAuth sets req.user or sends 401
  let authPassed = false;
  await requireAuth(req, res, () => { authPassed = true; });
  if (!authPassed) return; // requireAuth already responded

  // Step 2: DB role check — ADMIN-01: never trust JWT payload for role
  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, req.user!.id))
    .limit(1)
    .catch(() => []);

  if (row?.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}
