import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { users, refreshTokens } from '../src/db/schema.js';
import { loginWithGoogle } from '../src/services/authService.js';
import type { GoogleProfile } from '../src/services/googleAuthService.js';
import { resetDb, createUser } from './helpers.js';

// loginWithGoogle takes an already-verified GoogleProfile (the JWKS signature
// check lives in googleAuthService and can't run without Google), so these tests
// drive the find-or-create-or-link branches directly against the real test DB.
const profile = (over: Partial<GoogleProfile> = {}): GoogleProfile => ({
  googleId: 'google-sub-123',
  email: 'newplayer@gmail.com',
  emailVerified: true,
  name: 'New Player',
  ...over,
});

describe('loginWithGoogle', () => {
  beforeEach(resetDb);

  it('creates a passwordless account for a brand-new Google user', async () => {
    const { accessToken, rawRefreshToken, isNewUser } = await loginWithGoogle(profile());
    expect(accessToken).toBeTruthy();
    expect(rawRefreshToken).toBeTruthy();
    expect(isNewUser).toBe(true); // fresh account → routes to the username step

    const [row] = await db.select().from(users).where(eq(users.googleId, 'google-sub-123'));
    expect(row).toBeDefined();
    expect(row!.passwordHash).toBeNull();
    expect(row!.isEmailVerified).toBe(true); // Google already verified the email
    expect(row!.balance).toBe(1000); // same starting balance as email signup
    expect(row!.email).toBe('newplayer@gmail.com');

    // A session was issued.
    const tokens = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, row!.id));
    expect(tokens).toHaveLength(1);
  });

  it('reuses the same account for a returning Google user', async () => {
    const first = await loginWithGoogle(profile());
    const second = await loginWithGoogle(profile());
    expect(first.isNewUser).toBe(true);
    expect(second.isNewUser).toBe(false); // returning user — no username step

    const all = await db.select().from(users);
    expect(all).toHaveLength(1); // no duplicate account

    // Each sign-in mints a fresh refresh token.
    const tokens = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, all[0]!.id));
    expect(tokens).toHaveLength(2);
  });

  it('links Google onto an existing email account with the same verified email', async () => {
    const { user } = await createUser({ email: 'existing@gmail.com', googleId: null });

    const result = await loginWithGoogle(profile({ email: 'existing@gmail.com' }));
    expect(result.isNewUser).toBe(false); // linked to an existing account — no username step

    const all = await db.select().from(users);
    expect(all).toHaveLength(1); // linked, not duplicated

    const [linked] = await db.select().from(users).where(eq(users.id, user.id));
    expect(linked!.googleId).toBe('google-sub-123');
    expect(linked!.passwordHash).toBe('x'); // original password retained — both methods work
  });

  it('refuses to seize an existing account when Google has not verified the email', async () => {
    await createUser({ email: 'existing@gmail.com', googleId: null });

    await expect(
      loginWithGoogle(profile({ email: 'existing@gmail.com', emailVerified: false })),
    ).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED_BY_GOOGLE' });

    // Existing account left untouched.
    const [row] = await db.select().from(users).where(eq(users.email, 'existing@gmail.com'));
    expect(row!.googleId).toBeNull();
  });

  it('rejects a banned Google user', async () => {
    await createUser({ email: 'banned@gmail.com', googleId: 'google-sub-banned', isBanned: true });

    await expect(
      loginWithGoogle(profile({ email: 'banned@gmail.com', googleId: 'google-sub-banned' })),
    ).rejects.toMatchObject({ code: 'ACCOUNT_BANNED' });
  });
});
