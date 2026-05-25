// Groups routes — all require auth. Create/invite pass through socialLimiter.
// Services enforce the role/permission matrix and throw coded errors; this
// router maps codes to HTTP status. The live group:invite event is emitted here
// to the invitee's user:<id> room; group leaderboard pushes are handled by the
// socket subscribe handler + groupLeaderboardBroadcast.
//
// Route ORDER matters: the literal /invites paths are declared before /:id so
// Express doesn't capture "invites" as a group id.
import { Router, type IRouter, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { socialLimiter } from '../middleware/rateLimiter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { io } from '../socket/index.js';
import { SOCIAL_LIMITS } from '@gambling/shared';
import {
  createGroup,
  listMyGroups,
  getGroup,
  inviteToGroup,
  listMyGroupInvites,
  acceptGroupInvite,
  declineGroupInvite,
  kickMember,
  setMemberRole,
  transferOwnership,
  renameGroup,
  leaveGroup,
  deleteGroup,
  getGroupLeaderboard,
} from '../services/groupService.js';

export const groupsRouter: IRouter = Router();

function handleGroupError(err: unknown, res: Response): boolean {
  const code = (err as { code?: string }).code;
  const map: Record<string, [number, string]> = {
    NOT_FOUND: [404, 'Not found'],
    NOT_MEMBER: [403, 'You are not a member of this group'],
    NOT_AUTHORIZED: [403, 'Not authorized'],
    NOT_FRIENDS: [403, 'You can only invite friends'],
    ALREADY_MEMBER: [409, 'That user is already a member'],
    INVITE_EXISTS: [409, 'An invite is already pending'],
    GROUP_LIMIT: [409, 'You have reached the maximum number of groups'],
    GROUP_FULL: [409, 'This group is full'],
    INVALID_NAME: [400, 'Group name must be 1–50 characters'],
    OWNER_MUST_TRANSFER: [409, 'Transfer ownership before leaving'],
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

// ─── Lists + create ─────────────────────────────────────────────────────────
groupsRouter.get('/', requireAuth, async (req, res) => {
  try {
    res.json({ groups: await listMyGroups(req.user!.id) });
  } catch (err) {
    console.error('[groups] list error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

const createSchema = z.object({
  name: z.string().trim().min(SOCIAL_LIMITS.NAME_MIN).max(SOCIAL_LIMITS.NAME_MAX),
  description: z.string().trim().max(SOCIAL_LIMITS.DESCRIPTION_MAX).nullish(),
});

groupsRouter.post('/', socialLimiter, requireAuth, validate(createSchema), async (req, res) => {
  try {
    const group = await createGroup(req.user!.id, req.body.name as string, req.body.description as string | undefined);
    res.status(201).json({ group });
  } catch (err) {
    if (handleGroupError(err, res)) return;
    console.error('[groups] create error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// ─── Invites (literal paths — must precede /:id) ──────────────────────────────
groupsRouter.get('/invites', requireAuth, async (req, res) => {
  try {
    res.json({ invites: await listMyGroupInvites(req.user!.id) });
  } catch (err) {
    console.error('[groups] invites error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

groupsRouter.post('/invites/:inviteId/accept', requireAuth, async (req, res) => {
  const inviteId = parseId(req.params.inviteId);
  if (inviteId === null) {
    res.status(400).json({ error: 'Invalid invite id' });
    return;
  }
  try {
    const group = await acceptGroupInvite(req.user!.id, inviteId);
    res.json({ group });
  } catch (err) {
    if (handleGroupError(err, res)) return;
    console.error('[groups] accept invite error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

groupsRouter.post('/invites/:inviteId/decline', requireAuth, async (req, res) => {
  const inviteId = parseId(req.params.inviteId);
  if (inviteId === null) {
    res.status(400).json({ error: 'Invalid invite id' });
    return;
  }
  try {
    await declineGroupInvite(req.user!.id, inviteId);
    res.status(204).end();
  } catch (err) {
    if (handleGroupError(err, res)) return;
    console.error('[groups] decline invite error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// ─── Single group ─────────────────────────────────────────────────────────────
groupsRouter.get('/:id', requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid group id' });
    return;
  }
  try {
    res.json({ group: await getGroup(req.user!.id, id) });
  } catch (err) {
    if (handleGroupError(err, res)) return;
    console.error('[groups] get error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

const renameSchema = z
  .object({
    name: z.string().trim().min(SOCIAL_LIMITS.NAME_MIN).max(SOCIAL_LIMITS.NAME_MAX).optional(),
    description: z.string().trim().max(SOCIAL_LIMITS.DESCRIPTION_MAX).nullish(),
  })
  .refine((d) => d.name !== undefined || d.description !== undefined, { message: 'Nothing to update' });

groupsRouter.patch('/:id', requireAuth, validate(renameSchema), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid group id' });
    return;
  }
  try {
    const group = await renameGroup(req.user!.id, id, req.body);
    res.json({ group });
  } catch (err) {
    if (handleGroupError(err, res)) return;
    console.error('[groups] rename error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

groupsRouter.delete('/:id', requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid group id' });
    return;
  }
  try {
    await deleteGroup(req.user!.id, id);
    res.status(204).end();
  } catch (err) {
    if (handleGroupError(err, res)) return;
    console.error('[groups] delete error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

groupsRouter.get('/:id/leaderboard', requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid group id' });
    return;
  }
  try {
    res.json(await getGroupLeaderboard(req.user!.id, id));
  } catch (err) {
    if (handleGroupError(err, res)) return;
    console.error('[groups] leaderboard error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

const inviteSchema = z.object({ username: z.string().trim().min(1).max(50) });

groupsRouter.post('/:id/invites', socialLimiter, requireAuth, validate(inviteSchema), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid group id' });
    return;
  }
  try {
    const result = await inviteToGroup(req.user!.id, id, req.body.username as string);
    io?.to(`user:${result.inviteeId}`).emit('group:invite', { invite: result.invite });
    res.status(201).json({ invite: result.invite });
  } catch (err) {
    if (handleGroupError(err, res)) return;
    console.error('[groups] invite error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// DELETE member — kick someone, or leave if userId === me (owner-leave rules apply)
groupsRouter.delete('/:id/members/:userId', requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  const targetId = parseId(req.params.userId);
  if (id === null || targetId === null) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    if (targetId === req.user!.id) {
      const { deleted } = await leaveGroup(req.user!.id, id);
      res.json({ left: true, deleted });
      return;
    }
    await kickMember(req.user!.id, id, targetId);
    res.status(204).end();
  } catch (err) {
    if (handleGroupError(err, res)) return;
    console.error('[groups] kick/leave error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

const roleSchema = z.object({ role: z.enum(['admin', 'member']) });

groupsRouter.patch('/:id/members/:userId', requireAuth, validate(roleSchema), async (req, res) => {
  const id = parseId(req.params.id);
  const targetId = parseId(req.params.userId);
  if (id === null || targetId === null) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    await setMemberRole(req.user!.id, id, targetId, req.body.role as 'admin' | 'member');
    res.status(204).end();
  } catch (err) {
    if (handleGroupError(err, res)) return;
    console.error('[groups] set role error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

const transferSchema = z.object({ userId: z.number().int().positive() });

groupsRouter.post('/:id/transfer', requireAuth, validate(transferSchema), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid group id' });
    return;
  }
  try {
    await transferOwnership(req.user!.id, id, req.body.userId as number);
    res.status(204).end();
  } catch (err) {
    if (handleGroupError(err, res)) return;
    console.error('[groups] transfer error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});
