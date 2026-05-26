// Friends routes — all require auth (none are public). Mutating POSTs also pass
// through socialLimiter (spam guard) before requireAuth. Services throw coded
// errors; this router maps the codes to HTTP status. Live notifications
// (friend:request / friend:accepted) are emitted here to the target's
// user:<id> room via the null-safe io singleton (undefined in route tests).
import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { socialLimiter } from '../middleware/rateLimiter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { io } from '../socket/index.js';
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
  listFriends,
  listRequests,
  searchUsers,
  blockUser,
  unblockUser,
  listBlocked,
} from '../services/friendService.js';

export const friendsRouter: IRouter = Router();

// Map a coded service error to a response. Returns true if it handled the error.
function handleSocialError(err: unknown, res: import('express').Response): boolean {
  const code = (err as { code?: string }).code;
  const map: Record<string, [number, string]> = {
    NOT_FOUND: [404, 'No user with that username'],
    CANNOT_FRIEND_SELF: [400, 'You cannot friend yourself'],
    CANNOT_BLOCK_SELF: [400, 'You cannot block yourself'],
    ALREADY_FRIENDS: [409, 'You are already friends'],
    REQUEST_EXISTS: [409, 'A request is already pending'],
    BLOCKED: [403, 'Unable to send a request'],
    NOT_AUTHORIZED: [403, 'Not authorized'],
  };
  if (code && map[code]) {
    const [status, message] = map[code];
    res.status(status).json({ error: message });
    return true;
  }
  return false;
}

// GET /api/friends — accepted friends
friendsRouter.get('/', requireAuth, async (req, res) => {
  try {
    res.json({ friends: await listFriends(req.user!.id) });
  } catch (err) {
    console.error('[friends] list error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// GET /api/friends/requests — incoming + outgoing pending
friendsRouter.get('/requests', requireAuth, async (req, res) => {
  try {
    res.json(await listRequests(req.user!.id));
  } catch (err) {
    console.error('[friends] requests error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// GET /api/friends/search?q=
friendsRouter.get('/search', requireAuth, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  try {
    res.json({ results: await searchUsers(req.user!.id, q) });
  } catch (err) {
    console.error('[friends] search error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// GET /api/friends/blocked — users the caller has blocked
friendsRouter.get('/blocked', requireAuth, async (req, res) => {
  try {
    res.json({ blocked: await listBlocked(req.user!.id) });
  } catch (err) {
    console.error('[friends] blocked list error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

const sendSchema = z.object({
  username: z.string().trim().min(1, 'Username required').max(50),
});

// POST /api/friends/requests { username } — send (or auto-accept a mutual) request
friendsRouter.post('/requests', socialLimiter, requireAuth, validate(sendSchema), async (req, res) => {
  try {
    const result = await sendFriendRequest(req.user!.id, req.body.username as string);
    if (result.kind === 'accepted') {
      // Mutual intent — notify the original sender that it's now accepted.
      io?.to(`user:${result.otherUserId}`).emit('friend:accepted', { friend: result.friendForOther });
      res.status(200).json({ status: 'accepted', friend: result.friendForActor });
      return;
    }
    io?.to(`user:${result.otherUserId}`).emit('friend:request', { request: result.requestForOther });
    res.status(201).json({ status: 'requested', request: result.requestForActor });
  } catch (err) {
    if (handleSocialError(err, res)) return;
    console.error('[friends] send error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// POST /api/friends/requests/:id/accept
friendsRouter.post('/requests/:id/accept', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Invalid request id' });
    return;
  }
  try {
    const result = await acceptFriendRequest(req.user!.id, id);
    io?.to(`user:${result.requesterId}`).emit('friend:accepted', { friend: result.friendForRequester });
    res.json({ friend: result.friendForActor });
  } catch (err) {
    if (handleSocialError(err, res)) return;
    console.error('[friends] accept error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// POST /api/friends/requests/:id/decline
friendsRouter.post('/requests/:id/decline', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Invalid request id' });
    return;
  }
  try {
    await declineFriendRequest(req.user!.id, id);
    res.status(204).end();
  } catch (err) {
    if (handleSocialError(err, res)) return;
    console.error('[friends] decline error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// DELETE /api/friends/requests/:id — cancel an outgoing pending request
friendsRouter.delete('/requests/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Invalid request id' });
    return;
  }
  try {
    await cancelFriendRequest(req.user!.id, id);
    res.status(204).end();
  } catch (err) {
    if (handleSocialError(err, res)) return;
    console.error('[friends] cancel error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// POST /api/friends/:userId/block — block a user (ends any friendship/request)
friendsRouter.post('/:userId/block', socialLimiter, requireAuth, async (req, res) => {
  const targetId = Number(req.params.userId);
  if (!Number.isInteger(targetId)) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }
  try {
    await blockUser(req.user!.id, targetId);
    res.status(204).end();
  } catch (err) {
    if (handleSocialError(err, res)) return;
    console.error('[friends] block error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// DELETE /api/friends/:userId/block — lift a block
friendsRouter.delete('/:userId/block', requireAuth, async (req, res) => {
  const targetId = Number(req.params.userId);
  if (!Number.isInteger(targetId)) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }
  try {
    await unblockUser(req.user!.id, targetId);
    res.status(204).end();
  } catch (err) {
    if (handleSocialError(err, res)) return;
    console.error('[friends] unblock error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// DELETE /api/friends/:userId — remove an accepted friend
friendsRouter.delete('/:userId', requireAuth, async (req, res) => {
  const otherId = Number(req.params.userId);
  if (!Number.isInteger(otherId)) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }
  try {
    await removeFriend(req.user!.id, otherId);
    res.status(204).end();
  } catch (err) {
    if (handleSocialError(err, res)) return;
    console.error('[friends] remove error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});
