// Poker routes — all require auth. Create passes through socialLimiter. The
// table manager owns the engines + money; this router validates input, maps coded
// errors to HTTP, and returns the (public) table view. In-hand actions are REST
// here; the realtime layer (P4) pushes state + arms turn timers.
import { Router, type IRouter, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { socialLimiter } from '../middleware/rateLimiter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { tableManager } from '../services/poker/manager.js';

export const pokerRouter: IRouter = Router();

function handlePokerError(err: unknown, res: Response): boolean {
  const code = (err as { code?: string }).code;
  const map: Record<string, [number, string]> = {
    NOT_FOUND: [404, 'Table not found'],
    NOT_AUTHORIZED: [403, 'Not authorized'],
    INVALID_NAME: [400, 'Name must be 1–50 characters'],
    INVALID_STAKES: [400, 'Invalid blinds'],
    BAD_SEAT: [400, 'Invalid seat'],
    BAD_BUYIN: [400, 'Buy-in out of range'],
    INSUFFICIENT_FUNDS: [402, 'Not enough coins for that buy-in'],
    ALREADY_SEATED: [409, 'You are already at this table'],
    SEAT_TAKEN: [409, 'That seat is taken'],
    NOT_SEATED: [403, 'You are not at this table'],
    NOT_YOUR_TURN: [409, 'It is not your turn'],
    ILLEGAL_ACTION: [400, 'Illegal action'],
    NO_SEAT: [400, 'No such seat'],
  };
  if (code && map[code]) {
    const [status, message] = map[code];
    res.status(status).json({ error: message });
    return true;
  }
  return false;
}

function parseId(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET /api/poker/tables — lobby
pokerRouter.get('/tables', requireAuth, async (req, res) => {
  try {
    res.json({ tables: await tableManager.listTables(req.user!.id) });
  } catch (err) {
    console.error('[poker] list error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(50),
  type: z.enum(['public', 'private']),
  smallBlind: z.number().int().positive(),
  bigBlind: z.number().int().positive(),
  maxSeats: z.number().int().min(2).max(6).optional(),
  groupId: z.number().int().positive().nullish(),
  botTarget: z.number().int().min(0).max(5).optional(),
});

pokerRouter.post('/tables', socialLimiter, requireAuth, validate(createSchema), async (req, res) => {
  try {
    const id = await tableManager.createTable(req.user!.id, req.body);
    res.status(201).json({ id });
  } catch (err) {
    if (handlePokerError(err, res)) return;
    console.error('[poker] create error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// GET /api/poker/tables/:id — public state + my hole cards if seated
pokerRouter.get('/tables/:id', requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid table id' });
    return;
  }
  try {
    res.json(await tableManager.getView(req.user!.id, id));
  } catch (err) {
    if (handlePokerError(err, res)) return;
    console.error('[poker] view error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

const sitSchema = z.object({
  seatIndex: z.number().int().min(0).max(5),
  buyIn: z.number().int().positive(),
});

pokerRouter.post('/tables/:id/sit', requireAuth, validate(sitSchema), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid table id' });
    return;
  }
  try {
    await tableManager.sit(req.user!.id, id, req.body.seatIndex as number, req.body.buyIn as number);
    res.json(await tableManager.getView(req.user!.id, id));
  } catch (err) {
    if (handlePokerError(err, res)) return;
    console.error('[poker] sit error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

pokerRouter.post('/tables/:id/leave', requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid table id' });
    return;
  }
  try {
    const result = await tableManager.leave(req.user!.id, id);
    res.json(result);
  } catch (err) {
    if (handlePokerError(err, res)) return;
    console.error('[poker] leave error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

const actionSchema = z.object({
  type: z.enum(['fold', 'check', 'call', 'raise']),
  amount: z.number().int().min(0).optional(),
});

pokerRouter.post('/tables/:id/action', requireAuth, validate(actionSchema), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid table id' });
    return;
  }
  try {
    await tableManager.act(req.user!.id, id, { type: req.body.type, amount: req.body.amount });
    res.json(await tableManager.getView(req.user!.id, id));
  } catch (err) {
    if (handlePokerError(err, res)) return;
    console.error('[poker] action error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});
