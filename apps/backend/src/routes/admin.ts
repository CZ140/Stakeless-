import { Router, type IRouter } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  getDashboardStats,
  searchPlayer,
  getPlayerHistory,
  banUser,
  unbanUser,
  logAdminAction,
} from '../services/adminService.js';

export const adminRouter: IRouter = Router();

// All /api/admin/* routes require admin role (ADMIN-01)
adminRouter.use(requireAdmin);

// GET /api/admin/stats — dashboard overview (ADMIN-02)
adminRouter.get('/stats', async (req, res) => {
  try {
    const stats = await getDashboardStats();
    await logAdminAction(req.user!.id, 'view_stats', null, 'dashboard stats viewed');
    res.json(stats);
  } catch (err) {
    console.error('[admin] stats error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// GET /api/admin/players?q=username — player search (ADMIN-03)
adminRouter.get('/players', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) { res.status(400).json({ error: 'Query required' }); return; }
  try {
    const players = await searchPlayer(q);
    await logAdminAction(req.user!.id, 'search_player', null, `searched: ${q}`);
    res.json({ players });
  } catch (err) {
    console.error('[admin] search error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// GET /api/admin/players/:id/history — game history (ADMIN-03)
adminRouter.get('/players/:id/history', async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isFinite(targetId)) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    const history = await getPlayerHistory(targetId);
    res.json({ history });
  } catch (err) {
    console.error('[admin] history error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// POST /api/admin/players/:id/ban — ban user (ADMIN-04)
adminRouter.post('/players/:id/ban', async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isFinite(targetId)) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (targetId === req.user!.id) { res.status(400).json({ error: 'Cannot ban yourself' }); return; }
  try {
    await banUser(targetId);
    await logAdminAction(req.user!.id, 'ban', targetId, 'banned via admin panel');
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin] ban error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// POST /api/admin/players/:id/unban — unban user (ADMIN-05 audit)
adminRouter.post('/players/:id/unban', async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isFinite(targetId)) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    await unbanUser(targetId);
    await logAdminAction(req.user!.id, 'unban', targetId, 'unbanned via admin panel');
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin] unban error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});
