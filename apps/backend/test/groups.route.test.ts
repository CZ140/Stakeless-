import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { friendships } from '../src/db/schema.js';
import { resetDb, createUser } from './helpers.js';

const app = createApp();

function auth(method: 'post' | 'get' | 'delete' | 'patch', path: string, token: string) {
  return request(app)[method](path).set('Authorization', `Bearer ${token}`);
}

// Seed an accepted friendship directly (fast setup for the invite-friendship rule).
async function makeFriends(a: number, b: number): Promise<void> {
  await db.insert(friendships).values({ requesterId: a, addresseeId: b, status: 'accepted', respondedAt: new Date() });
}

async function createGroup(token: string, name = 'Inner Circle'): Promise<number> {
  const res = await auth('post', '/api/groups', token).send({ name });
  expect(res.status).toBe(201);
  return res.body.group.id as number;
}

// Invite a friend and have them accept — returns once they're a member.
async function joinViaInvite(ownerToken: string, groupId: number, invitee: { token: string; username: string }) {
  const inv = await auth('post', `/api/groups/${groupId}/invites`, ownerToken).send({ username: invitee.username });
  expect(inv.status).toBe(201);
  const invites = await auth('get', '/api/groups/invites', invitee.token);
  const inviteId = invites.body.invites[0].id as number;
  const accept = await auth('post', `/api/groups/invites/${inviteId}/accept`, invitee.token).send();
  expect(accept.status).toBe(200);
}

describe('Groups routes', () => {
  beforeEach(resetDb);

  it('rejects unauthenticated access', async () => {
    expect((await request(app).get('/api/groups')).status).toBe(401);
    expect((await request(app).post('/api/groups').send({ name: 'x' })).status).toBe(401);
  });

  it('creates a group with the creator as owner', async () => {
    const a = await createUser({ username: 'alice' });
    const create = await auth('post', '/api/groups', a.token).send({ name: 'Inner Circle', description: 'no mercy' });
    expect(create.status).toBe(201);
    expect(create.body.group.myRole).toBe('owner');
    expect(create.body.group.memberCount).toBe(1);

    const list = await auth('get', '/api/groups', a.token);
    expect(list.body.groups).toHaveLength(1);
    expect(list.body.groups[0].ownerUsername).toBe('alice');
  });

  it('refuses to invite a non-friend (403 NOT_FRIENDS)', async () => {
    const a = await createUser({ username: 'alice' });
    const b = await createUser({ username: 'bob' });
    const groupId = await createGroup(a.token);
    const res = await auth('post', `/api/groups/${groupId}/invites`, a.token).send({ username: b.user.username });
    expect(res.status).toBe(403);
  });

  it('invites a friend, who accepts and becomes a member', async () => {
    const a = await createUser({ username: 'alice' });
    const b = await createUser({ username: 'bob' });
    await makeFriends(a.user.id, b.user.id);
    const groupId = await createGroup(a.token);

    await joinViaInvite(a.token, groupId, { token: b.token, username: b.user.username });

    const detail = await auth('get', `/api/groups/${groupId}`, a.token);
    expect(detail.body.group.members).toHaveLength(2);
    expect(detail.body.group.members.find((m: { username: string }) => m.username === 'bob').role).toBe('member');

    // b can now see the group too
    expect((await auth('get', '/api/groups', b.token)).body.groups).toHaveLength(1);
  });

  it('guards duplicate invites and inviting an existing member', async () => {
    const a = await createUser({ username: 'alice' });
    const b = await createUser({ username: 'bob' });
    await makeFriends(a.user.id, b.user.id);
    const groupId = await createGroup(a.token);

    const first = await auth('post', `/api/groups/${groupId}/invites`, a.token).send({ username: b.user.username });
    expect(first.status).toBe(201);
    const dup = await auth('post', `/api/groups/${groupId}/invites`, a.token).send({ username: b.user.username });
    expect(dup.status).toBe(409); // INVITE_EXISTS

    // Accept, then a fresh invite is rejected as ALREADY_MEMBER
    const invites = await auth('get', '/api/groups/invites', b.token);
    await auth('post', `/api/groups/invites/${invites.body.invites[0].id}/accept`, b.token).send();
    const member = await auth('post', `/api/groups/${groupId}/invites`, a.token).send({ username: b.user.username });
    expect(member.status).toBe(409); // ALREADY_MEMBER
  });

  it('hides the group and its leaderboard from non-members (403)', async () => {
    const a = await createUser({ username: 'alice' });
    const c = await createUser({ username: 'carol' });
    const groupId = await createGroup(a.token);
    expect((await auth('get', `/api/groups/${groupId}`, c.token)).status).toBe(403);
    expect((await auth('get', `/api/groups/${groupId}/leaderboard`, c.token)).status).toBe(403);
  });

  it('enforces the role matrix for promote/demote and kicks', async () => {
    const a = await createUser({ username: 'alice' }); // owner
    const b = await createUser({ username: 'bob' });
    const c = await createUser({ username: 'carol' });
    await makeFriends(a.user.id, b.user.id);
    await makeFriends(a.user.id, c.user.id);
    const groupId = await createGroup(a.token);
    await joinViaInvite(a.token, groupId, { token: b.token, username: b.user.username });
    await joinViaInvite(a.token, groupId, { token: c.token, username: c.user.username });

    // A member cannot promote anyone.
    expect((await auth('patch', `/api/groups/${groupId}/members/${c.user.id}`, b.token).send({ role: 'admin' })).status).toBe(403);

    // Owner promotes bob → admin.
    expect((await auth('patch', `/api/groups/${groupId}/members/${b.user.id}`, a.token).send({ role: 'admin' })).status).toBe(204);

    // Admin bob can kick member carol, but NOT the owner.
    expect((await auth('delete', `/api/groups/${groupId}/members/${a.user.id}`, b.token)).status).toBe(403);
    expect((await auth('delete', `/api/groups/${groupId}/members/${c.user.id}`, b.token)).status).toBe(204);

    const detail = await auth('get', `/api/groups/${groupId}`, a.token);
    expect(detail.body.group.members).toHaveLength(2); // alice + bob
  });

  it('transfers ownership, swapping roles and groups.ownerId', async () => {
    const a = await createUser({ username: 'alice' });
    const b = await createUser({ username: 'bob' });
    await makeFriends(a.user.id, b.user.id);
    const groupId = await createGroup(a.token);
    await joinViaInvite(a.token, groupId, { token: b.token, username: b.user.username });

    // A member cannot transfer; the owner can.
    expect((await auth('post', `/api/groups/${groupId}/transfer`, b.token).send({ userId: a.user.id })).status).toBe(403);
    expect((await auth('post', `/api/groups/${groupId}/transfer`, a.token).send({ userId: b.user.id })).status).toBe(204);

    const detail = await auth('get', `/api/groups/${groupId}`, b.token);
    const roles = Object.fromEntries(detail.body.group.members.map((m: { username: string; role: string }) => [m.username, m.role]));
    expect(roles['bob']).toBe('owner');
    expect(roles['alice']).toBe('admin');
    expect(detail.body.group.ownerId).toBe(b.user.id);
  });

  it('auto-promotes the longest-tenured admin when the owner leaves', async () => {
    const a = await createUser({ username: 'alice' }); // owner
    const b = await createUser({ username: 'bob' });
    await makeFriends(a.user.id, b.user.id);
    const groupId = await createGroup(a.token);
    await joinViaInvite(a.token, groupId, { token: b.token, username: b.user.username });
    await auth('patch', `/api/groups/${groupId}/members/${b.user.id}`, a.token).send({ role: 'admin' });

    const leave = await auth('delete', `/api/groups/${groupId}/members/${a.user.id}`, a.token);
    expect(leave.status).toBe(200);
    expect(leave.body.deleted).toBe(false);

    const detail = await auth('get', `/api/groups/${groupId}`, b.token);
    expect(detail.body.group.members.find((m: { username: string }) => m.username === 'bob').role).toBe('owner');
  });

  it('deletes the group when the last member (owner) leaves', async () => {
    const a = await createUser({ username: 'alice' });
    const groupId = await createGroup(a.token);
    const leave = await auth('delete', `/api/groups/${groupId}/members/${a.user.id}`, a.token);
    expect(leave.status).toBe(200);
    expect(leave.body.deleted).toBe(true);
    expect((await auth('get', `/api/groups/${groupId}`, a.token)).status).toBe(403);
  });

  it('only the owner can delete the group (cascades members)', async () => {
    const a = await createUser({ username: 'alice' });
    const b = await createUser({ username: 'bob' });
    await makeFriends(a.user.id, b.user.id);
    const groupId = await createGroup(a.token);
    await joinViaInvite(a.token, groupId, { token: b.token, username: b.user.username });

    expect((await auth('delete', `/api/groups/${groupId}`, b.token)).status).toBe(403);
    expect((await auth('delete', `/api/groups/${groupId}`, a.token)).status).toBe(204);
    // Group gone for both; b no longer has any groups.
    expect((await auth('get', '/api/groups', b.token)).body.groups).toHaveLength(0);
  });

  it('returns a members-only leaderboard ranked by each metric', async () => {
    const a = await createUser({ username: 'alice', balance: 500, totalWagered: 2000, totalProfit: 100 });
    const b = await createUser({ username: 'bob', balance: 900, totalWagered: 1000, totalProfit: 400 });
    await makeFriends(a.user.id, b.user.id);
    const groupId = await createGroup(a.token);
    await joinViaInvite(a.token, groupId, { token: b.token, username: b.user.username });

    const lb = await auth('get', `/api/groups/${groupId}/leaderboard`, a.token);
    expect(lb.status).toBe(200);
    // bob leads balance + profit; alice leads wagered.
    expect(lb.body.byBalance[0].username).toBe('bob');
    expect(lb.body.byBalance[0].rank).toBe(1);
    expect(lb.body.byProfit[0].username).toBe('bob');
    expect(lb.body.byWagered[0].username).toBe('alice');
    // each row carries all three metrics
    expect(lb.body.byBalance[0]).toMatchObject({ balance: 900, wagered: 1000, profit: 400, role: 'member' });
  });
});
