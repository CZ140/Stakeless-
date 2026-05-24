import bcrypt from 'bcryptjs';
import { eq, and, isNull, gt, ne, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, emailVerificationTokens, refreshTokens } from '../db/schema.js';
import { generateOpaqueToken, hashToken, signAccessToken } from './tokenService.js';
import { sendPasswordResetEmail } from './emailService.js';
import type { GoogleProfile } from './googleAuthService.js';
import { env } from '../env.js';

// Mint a fresh access + refresh token pair for a user and stamp lastLoginAt.
// Shared by the password and Google sign-in paths.
async function issueSession(userId: number): Promise<{ accessToken: string; rawRefreshToken: string }> {
  const accessToken = await signAccessToken(userId);
  const rawRefreshToken = generateOpaqueToken();
  const tokenHash = hashToken(rawRefreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(refreshTokens).values({ userId, tokenHash, expiresAt });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));

  return { accessToken, rawRefreshToken };
}

// Derive a unique username from email prefix + random suffix.
// Retries up to 5 times if collision — sufficient for a small platform.
async function deriveUsername(emailPrefix: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = Math.random().toString(36).slice(2, 7); // 5 random alphanumeric chars
    const candidate = `${emailPrefix.slice(0, 20)}_${suffix}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const existing = await db.select({ id: users.id }).from(users)
      .where(eq(users.username, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
  }
  // Fallback: timestamp suffix guarantees uniqueness
  return `user_${Date.now()}`;
}

export async function register(email: string, password: string): Promise<void> {
  // Check for duplicate email — return generic error to avoid email enumeration
  const existing = await db.select({ id: users.id }).from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  if (existing.length > 0) {
    // Simulate bcrypt delay to prevent timing attacks that reveal email existence
    await bcrypt.hash('timing-attack-prevention', 12);
    throw Object.assign(new Error('Registration failed'), { code: 'DUPLICATE_EMAIL' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const emailPrefix = email.split('@')[0] ?? 'user';
  const username = await deriveUsername(emailPrefix);

  // No email-verification step — accounts are usable the moment they're created
  // (this is a play-money app with no real stakes, so we don't gate on a verified
  // address). Mark verified on insert so login succeeds immediately.
  const [newUser] = await db.insert(users).values({
    email: email.toLowerCase(),
    passwordHash,
    username,
    balance: 1000, // CURR-01: 1,000 coins starting balance (≥50 minimum bets at 1 coin each)
    isEmailVerified: true,
  }).returning({ id: users.id });

  if (!newUser) throw new Error('Failed to create user');
}

export async function login(
  email: string,
  password: string
): Promise<{ accessToken: string; rawRefreshToken: string }> {
  const [user] = await db.select().from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  // Generic error for both "email not found" and "wrong password" — prevents email enumeration
  const invalidErr = Object.assign(new Error('Invalid credentials'), { code: 'INVALID_CREDENTIALS' });

  if (!user) {
    // Run bcrypt anyway to prevent timing-based email enumeration
    await bcrypt.compare(password, '$2a$12$invalidhashplaceholderXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
    throw invalidErr;
  }

  // Google-only accounts have no local password (passwordHash null). Compare
  // against a placeholder so timing stays constant and the result is just false.
  const passwordValid = await bcrypt.compare(
    password,
    user.passwordHash ?? '$2a$12$invalidhashplaceholderXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  );
  if (!passwordValid) throw invalidErr;

  if (user.isBanned) {
    throw Object.assign(new Error('Account banned'), { code: 'ACCOUNT_BANNED' });
  }

  // Issue tokens
  const accessToken = await signAccessToken(user.id);
  const rawRefreshToken = generateOpaqueToken();
  const tokenHash = hashToken(rawRefreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(refreshTokens).values({ userId: user.id, tokenHash, expiresAt });

  // Update lastLoginAt
  await db.update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  return { accessToken, rawRefreshToken };
}

// ─── loginWithGoogle ──────────────────────────────────────────────────────────
// Resolve a verified Google profile to a local account and issue a session.
// Three cases, in order: (1) returning Google user matched on the stable subject
// id; (2) an existing email account with the same Google-verified email — link
// the two so both sign-in methods share one account; (3) a brand-new social
// signup with no local password. Google accounts skip our email-verification
// step because Google has already confirmed the address.
export async function loginWithGoogle(
  profile: GoogleProfile,
): Promise<{ accessToken: string; rawRefreshToken: string }> {
  const bannedErr = Object.assign(new Error('Account banned'), { code: 'ACCOUNT_BANNED' });

  // 1. Returning Google user.
  const [byGoogle] = await db.select().from(users).where(eq(users.googleId, profile.googleId)).limit(1);
  if (byGoogle) {
    if (byGoogle.isBanned) throw bannedErr;
    return issueSession(byGoogle.id);
  }

  // 2. Existing account with the same email — link Google onto it.
  const [byEmail] = await db.select().from(users).where(eq(users.email, profile.email)).limit(1);
  if (byEmail) {
    // Only link if Google vouches for the address; otherwise an unverified Google
    // email must not seize an existing local account.
    if (!profile.emailVerified) {
      throw Object.assign(new Error('Email already registered'), { code: 'EMAIL_NOT_VERIFIED_BY_GOOGLE' });
    }
    if (byEmail.isBanned) throw bannedErr;
    await db.update(users)
      .set({ googleId: profile.googleId, isEmailVerified: true })
      .where(eq(users.id, byEmail.id));
    return issueSession(byEmail.id);
  }

  // 3. Brand-new social signup — no local password.
  const emailPrefix = profile.email.split('@')[0] ?? 'user';
  const username = await deriveUsername(emailPrefix);
  const [newUser] = await db.insert(users).values({
    email: profile.email,
    passwordHash: null,
    googleId: profile.googleId,
    username,
    balance: 1000, // same 1,000-coin starting balance as email signup
    isEmailVerified: true, // Google already verified the address
  }).returning({ id: users.id });

  if (!newUser) throw new Error('Failed to create user');
  return issueSession(newUser.id);
}

export async function refreshToken(
  rawToken: string
): Promise<{ accessToken: string; rawRefreshToken: string } | null> {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const [existing] = await db.select().from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.tokenHash, tokenHash),
        gt(refreshTokens.expiresAt, now),
      )
    )
    .limit(1);

  if (!existing) return null;

  // Rotate: delete old row, insert new one
  await db.delete(refreshTokens).where(eq(refreshTokens.id, existing.id));

  const newRawToken = generateOpaqueToken();
  const newTokenHash = hashToken(newRawToken);
  const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(refreshTokens).values({
    userId: existing.userId,
    tokenHash: newTokenHash,
    expiresAt: newExpiresAt,
  });

  const accessToken = await signAccessToken(existing.userId);

  return { accessToken, rawRefreshToken: newRawToken };
}

export async function getProfile(userId: number) {
  const [user] = await db.select({
    id: users.id,
    email: users.email,
    username: users.username,
    balance: users.balance,
    totalWagered: users.totalWagered,
    totalProfit: users.totalProfit,
    totalLoss: users.totalLoss,
    tierLevel: users.tierLevel,
    avatarColor: users.avatarColor,
    avatarImage: users.avatarImage,
    lastBonusClaimedAt: users.lastBonusClaimedAt,
    createdAt: users.createdAt,
    lastLoginAt: users.lastLoginAt,
  }).from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    balance: user.balance,
    totalWagered: user.totalWagered,
    totalProfit: user.totalProfit,
    totalLoss: user.totalLoss,
    tierLevel: user.tierLevel,
    avatarColor: user.avatarColor,
    avatarImage: user.avatarImage,
    dailyBonusTimestamp: user.lastBonusClaimedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

// ─── updateProfile ──────────────────────────────────────────────────────────
// Edits the authenticated user's own username and/or avatar. Only the fields
// present in `patch` are touched (undefined = leave as-is; null avatar = clear).
// Username uniqueness is enforced case-insensitively (excluding self) so two
// players can't hold the same name in different casing. Throws USERNAME_TAKEN.
// Returns the fresh profile (same shape as getProfile).
interface ProfilePatch {
  username?: string;
  avatarColor?: string | null;
  avatarImage?: string | null;
}

export async function updateProfile(userId: number, patch: ProfilePatch) {
  const updates: Record<string, unknown> = {};

  if (patch.username !== undefined) {
    // Case-insensitive uniqueness check against everyone else.
    const [clash] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.username}) = lower(${patch.username})`, ne(users.id, userId)))
      .limit(1);
    if (clash) throw Object.assign(new Error('Username taken'), { code: 'USERNAME_TAKEN' });
    updates.username = patch.username;
  }

  if (patch.avatarColor !== undefined) updates.avatarColor = patch.avatarColor;
  if (patch.avatarImage !== undefined) updates.avatarImage = patch.avatarImage;

  if (Object.keys(updates).length > 0) {
    await db.update(users).set(updates).where(eq(users.id, userId));
  }

  return getProfile(userId);
}

export async function logout(rawRefreshToken: string): Promise<void> {
  const tokenHash = hashToken(rawRefreshToken);
  await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
  // No error if not found — idempotent logout
}

export async function forgotPassword(email: string): Promise<void> {
  const [user] = await db.select({ id: users.id }).from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  // Always return without error regardless of whether email exists — no enumeration
  if (!user) return;

  // Invalidate any existing password_reset token for this user
  await db.delete(emailVerificationTokens).where(
    and(
      eq(emailVerificationTokens.userId, user.id),
      eq(emailVerificationTokens.type, 'password_reset'),
    )
  );

  // Issue new reset token
  const rawToken = generateOpaqueToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await db.insert(emailVerificationTokens).values({
    userId: user.id,
    tokenHash,
    type: 'password_reset',
    expiresAt,
  });

  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`;
  await sendPasswordResetEmail(email, resetUrl);
}

export async function resetPassword(
  rawToken: string,
  newPassword: string,
): Promise<{ accessToken: string; rawRefreshToken: string }> {
  const tokenHash = hashToken(rawToken);

  const [record] = await db.select().from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.tokenHash, tokenHash),
        eq(emailVerificationTokens.type, 'password_reset'),
        isNull(emailVerificationTokens.usedAt),
      )
    )
    .limit(1);

  if (!record || record.expiresAt < new Date()) {
    throw Object.assign(new Error('Invalid or expired reset link'), { code: 'INVALID_TOKEN' });
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(newPassword, 12);

  // Update user's password
  await db.update(users)
    .set({ passwordHash })
    .where(eq(users.id, record.userId));

  // Mark token used (single-use; replayed attempts get 400)
  await db.update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(emailVerificationTokens.id, record.id));

  // Auto-login: issue fresh access + refresh tokens
  const accessToken = await signAccessToken(record.userId);
  const newRawRefreshToken = generateOpaqueToken();
  const refreshHash = hashToken(newRawRefreshToken);
  const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(refreshTokens).values({
    userId: record.userId,
    tokenHash: refreshHash,
    expiresAt: refreshExpiresAt,
  });

  // Update lastLoginAt
  await db.update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, record.userId));

  return { accessToken, rawRefreshToken: newRawRefreshToken };
}
