import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { register, verifyEmail, login, refreshToken, getProfile, logout, forgotPassword, resetPassword } from '../services/authService.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { env } from '../env.js';

export const authRouter: IRouter = Router();

const registerSchema = z.object({
  email: z.string().email('Must be a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// POST /api/auth/register
authRouter.post('/register', authLimiter, validate(registerSchema), async (req, res) => {
  try {
    await register(req.body.email as string, req.body.password as string);
    res.status(201).json({ message: 'Registration successful. Check your email to verify your account.' });
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException & { code?: string }).code === 'DUPLICATE_EMAIL') {
      // Return same 201 to avoid email enumeration — attacker cannot distinguish new vs existing email
      res.status(201).json({ message: 'Registration successful. Check your email to verify your account.' });
      return;
    }
    console.error('[auth] register error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// GET /api/auth/verify-email?token=<raw>
authRouter.get('/verify-email', async (req, res) => {
  const token = req.query['token'];
  if (typeof token !== 'string' || !token) {
    res.status(400).json({ error: 'Missing verification token' });
    return;
  }
  try {
    await verifyEmail(token);
    // Redirect to frontend login with success message
    res.redirect(`${process.env['FRONTEND_URL'] ?? 'http://localhost:5173'}/login?verified=true`);
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException & { code?: string }).code === 'INVALID_TOKEN') {
      res.status(400).json({ error: 'Invalid or expired verification link' });
      return;
    }
    console.error('[auth] verify-email error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/login
authRouter.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  try {
    const { accessToken, rawRefreshToken } = await login(
      req.body.email as string,
      req.body.password as string
    );

    res.cookie('refreshToken', rawRefreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ accessToken });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'INVALID_CREDENTIALS') {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    if (code === 'EMAIL_NOT_VERIFIED') {
      res.status(403).json({ error: 'Please verify your email before logging in' });
      return;
    }
    if (code === 'ACCOUNT_BANNED') {
      res.status(403).json({ error: 'Your account has been suspended' });
      return;
    }
    console.error('[auth] login error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// POST /api/auth/refresh
// Cookie is scoped to /api/auth/refresh — browser only sends it to this route
authRouter.post('/refresh', async (req, res) => {
  const rawToken: string | undefined = req.cookies['refreshToken'];
  if (!rawToken) {
    res.status(401).json({ error: 'No refresh token' });
    return;
  }

  try {
    const result = await refreshToken(rawToken);
    if (!result) {
      res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
      res.status(401).json({ error: 'Session expired. Please log in again.' });
      return;
    }

    // Re-set cookie with fresh maxAge (sliding expiry)
    res.cookie('refreshToken', result.rawRefreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ accessToken: result.accessToken });
  } catch (err) {
    console.error('[auth] refresh error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// GET /api/auth/me
authRouter.get('/me', requireAuth, async (req, res) => {
  try {
    const profile = await getProfile(req.user!.id);
    res.json(profile);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'NOT_FOUND') {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    console.error('[auth] me error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// POST /api/auth/logout
// Requires the refresh cookie to identify which token to revoke
authRouter.post('/logout', async (req, res) => {
  const rawToken: string | undefined = req.cookies['refreshToken'];
  if (rawToken) {
    await logout(rawToken).catch(() => { /* idempotent — ignore if already gone */ });
  }
  res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
  res.json({ message: 'Logged out' });
});

// POST /api/auth/forgot-password
authRouter.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), async (req, res) => {
  try {
    await forgotPassword(req.body.email as string);
    // Always 200 — no email enumeration
    res.json({ message: 'If this email is registered, you will receive a password reset link.' });
  } catch (err) {
    console.error('[auth] forgot-password error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// POST /api/auth/reset-password
// Body: { token: string, password: string }
authRouter.post('/reset-password', validate(resetPasswordSchema), async (req, res) => {
  try {
    const { accessToken, rawRefreshToken } = await resetPassword(
      req.body.token as string,
      req.body.password as string,
    );

    // Set refresh cookie (auto-login after reset)
    res.cookie('refreshToken', rawRefreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ accessToken });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'INVALID_TOKEN') {
      res.status(400).json({ error: 'Invalid or expired reset link' });
      return;
    }
    console.error('[auth] reset-password error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});
