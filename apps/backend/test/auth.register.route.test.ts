import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { eq, sql } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { users } from '../src/db/schema.js';
import { resetDb, createUser } from './helpers.js';

const app = createApp();

describe('POST /api/auth/register — chosen username', () => {
  beforeEach(resetDb);

  it('creates an account with the chosen username', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@player.com', username: 'CoolHandLuke', password: 'password123' });
    expect(res.status).toBe(201);

    const [row] = await db.select().from(users).where(eq(users.email, 'new@player.com'));
    expect(row!.username).toBe('CoolHandLuke'); // stored with the display casing
  });

  it('rejects a request with no username (400)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'password123' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid username (400)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.com', username: 'no spaces!', password: 'password123' });
    expect(res.status).toBe(400);
  });

  it('rejects a taken username case-insensitively (409)', async () => {
    await createUser({ username: 'Taken' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'fresh@player.com', username: 'taken', password: 'password123' });
    expect(res.status).toBe(409);

    // No account was created for the rejected attempt.
    const [row] = await db.select().from(users).where(eq(users.email, 'fresh@player.com'));
    expect(row).toBeUndefined();
  });

  it('stays silent on a duplicate email (201, no enumeration)', async () => {
    await createUser({ email: 'dupe@player.com', username: 'original' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dupe@player.com', username: 'somethingNew', password: 'password123' });
    expect(res.status).toBe(201); // same response as success — email existence not revealed

    // ...and no second account leaked in under the duplicate email.
    const rows = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = 'dupe@player.com'`);
    expect(rows).toHaveLength(1);
  });
});
