import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { register, login, loginWithGoogle, refreshToken, getProfile, updateProfile, logout, forgotPassword, resetPassword } from '../services/authService.js';
import { verifyGoogleCredential } from '../services/googleAuthService.js';
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
    res.status(201).json({ message: 'Registration successful. You can sign in now.' });
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException & { code?: string }).code === 'DUPLICATE_EMAIL') {
      // Return same 201 to avoid email enumeration — attacker cannot distinguish new vs existing email
      res.status(201).json({ message: 'Registration successful. You can sign in now.' });
      return;
    }
    console.error('[auth] register error:', err);
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
    if (code === 'ACCOUNT_BANNED') {
      res.status(403).json({ error: 'Your account has been suspended' });
      return;
    }
    console.error('[auth] login error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

const googleAuthSchema = z.object({
  credential: z.string().min(1, 'Missing Google credential'),
});

// POST /api/auth/google
// Body: { credential } — the ID token from Google Identity Services. We verify it
// against Google's keys, find-or-create the account, then issue our own session
// (identical access token + refresh cookie as a password login).
authRouter.post('/google', authLimiter, validate(googleAuthSchema), async (req, res) => {
  try {
    const profile = await verifyGoogleCredential(req.body.credential as string);
    const { accessToken, rawRefreshToken } = await loginWithGoogle(profile);

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
    if (code === 'GOOGLE_NOT_CONFIGURED') {
      res.status(503).json({ error: 'Google sign-in is not available right now' });
      return;
    }
    if (code === 'INVALID_GOOGLE_TOKEN') {
      res.status(401).json({ error: 'Google sign-in failed. Please try again.' });
      return;
    }
    if (code === 'EMAIL_NOT_VERIFIED_BY_GOOGLE') {
      res.status(403).json({ error: 'This email is already registered. Sign in with your password instead.' });
      return;
    }
    if (code === 'ACCOUNT_BANNED') {
      res.status(403).json({ error: 'Your account has been suspended' });
      return;
    }
    console.error('[auth] google sign-in error:', err);
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

// PATCH /api/auth/me — edit own username and/or avatar.
// avatarImage is a client-resized data URL (no object storage); the length cap
// (~256KB) is the real guard, enforced here so an oversized body is rejected
// before it touches the DB. avatarColor/avatarImage accept null to clear.
const MAX_AVATAR_CHARS = 350_000; // ~256KB of base64
const updateProfileSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters')
      .max(20, 'Username must be at most 20 characters')
      .regex(/^[A-Za-z0-9_]+$/, 'Use only letters, numbers and underscores')
      .optional(),
    avatarColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Invalid colour')
      .nullable()
      .optional(),
    avatarImage: z
      .string()
      .regex(/^data:image\/(png|jpe?g|webp);base64,/, 'Invalid image')
      .max(MAX_AVATAR_CHARS, 'Image too large — please pick a smaller picture')
      .nullable()
      .optional(),
  })
  .refine((d) => d.username !== undefined || d.avatarColor !== undefined || d.avatarImage !== undefined, {
    message: 'Nothing to update',
  });

authRouter.patch('/me', requireAuth, validate(updateProfileSchema), async (req, res) => {
  try {
    const profile = await updateProfile(req.user!.id, req.body);
    res.json(profile);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'USERNAME_TAKEN') {
      res.status(409).json({ error: 'That username is already taken' });
      return;
    }
    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    console.error('[auth] update profile error:', err);
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
