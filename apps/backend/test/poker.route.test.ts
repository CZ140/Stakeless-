import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { friendships, groups, groupMembers } from '../src/db/schema.js';
import { tableManager } from '../src/services/poker/manager.js';
import { resetDb, createUser, getBalance } from './helpers.js';

const app = createApp();

function auth(method: 'post' | 'get', path: string, token: string) {
  return request(app)[method](path).set('Authorization', `Bearer ${token}`);
}

async function makeFriends(a: number, b: number): Promise<void> {
  await db.insert(friendships).values({ requesterId: a, addresseeId: b, status: 'accepted', respondedAt: new Date() });
}

async function makeGroup(ownerId: number, memberIds: number[] = []): Promise<number> {
  const [g] = await db.insert(groups).values({ name: 'Crew', ownerId }).returning({ id: groups.id });
  await db.insert(groupMembers).values({ groupId: g!.id, userId: ownerId, role: 'owner' });
  for (const m of memberIds) await db.insert(groupMembers).values({ groupId: g!.id, userId: m, role: 'member' });
  return g!.id;
}

async function createTable(token: string, body: Record<string, unknown> = {}) {
  const res = await auth('post', '/api/poker/tables', token).send({
    name: 'Test Table',
    type: 'public',
    smallBlind: 5,
    bigBlind: 10,
    ...body,
  });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

describe('Poker routes', () => {
  beforeEach(async () => {
    await resetDb();
    tableManager._resetAll();
  });

  it('rejects unauthenticated access', async () => {
    expect((await request(app).get('/api/poker/tables')).status).toBe(401);
    expect((await request(app).post('/api/poker/tables').send({ name: 'x' })).status).toBe(401);
  });

  it('creates a table that appears in the lobby with the right buy-in range', async () => {
    const a = await createUser({ username: 'alice' });
    const id = await createTable(a.token);
    const lobby = await auth('get', '/api/poker/tables', a.token);
    const t = lobby.body.tables.find((x: { id: number }) => x.id === id);
    expect(t).toBeTruthy();
    expect(t.bigBlind).toBe(10);
    expect(t.minBuyIn).toBe(400); // 40 * BB
    expect(t.maxBuyIn).toBe(1000); // 100 * BB
    expect(t.seatedHumans).toBe(0);
  });

  it('seats a player, deducting the buy-in from balance', async () => {
    const a = await createUser({ username: 'alice', balance: 1000 });
    const id = await createTable(a.token);
    const res = await auth('post', `/api/poker/tables/${id}/sit`, a.token).send({ seatIndex: 0, buyIn: 1000 });
    expect(res.status).toBe(200);
    expect(await getBalance(a.user.id)).toBe(0);
    expect(res.body.table.seats[0].userId).toBe(a.user.id);
    expect(res.body.table.seats[0].stack).toBe(1000);
    expect(res.body.table.street).toBe('idle'); // only one player → no hand yet
  });

  it('rejects an underfunded buy-in (402) and a below-minimum buy-in (400)', async () => {
    const poor = await createUser({ username: 'poor', balance: 100 });
    const id = await createTable(poor.token);
    expect((await auth('post', `/api/poker/tables/${id}/sit`, poor.token).send({ seatIndex: 0, buyIn: 400 })).status).toBe(402);
    const rich = await createUser({ username: 'rich', balance: 1000 });
    expect((await auth('post', `/api/poker/tables/${id}/sit`, rich.token).send({ seatIndex: 0, buyIn: 100 })).status).toBe(400);
  });

  it('guards double-sitting and taken seats', async () => {
    const a = await createUser({ username: 'alice', balance: 1000 });
    const b = await createUser({ username: 'bob', balance: 1000 });
    const id = await createTable(a.token);
    await auth('post', `/api/poker/tables/${id}/sit`, a.token).send({ seatIndex: 0, buyIn: 500 });
    // Same user can't take another seat.
    expect((await auth('post', `/api/poker/tables/${id}/sit`, a.token).send({ seatIndex: 1, buyIn: 500 })).status).toBe(409);
    // Another user can't take seat 0.
    expect((await auth('post', `/api/poker/tables/${id}/sit`, b.token).send({ seatIndex: 0, buyIn: 500 })).status).toBe(409);
  });

  it('starts a hand when the second player sits and deals private hole cards', async () => {
    const a = await createUser({ username: 'alice', balance: 1000 });
    const b = await createUser({ username: 'bob', balance: 1000 });
    const id = await createTable(a.token);
    await auth('post', `/api/poker/tables/${id}/sit`, a.token).send({ seatIndex: 0, buyIn: 1000 });
    const sit2 = await auth('post', `/api/poker/tables/${id}/sit`, b.token).send({ seatIndex: 1, buyIn: 1000 });

    expect(sit2.body.table.street).toBe('preflop');
    expect(sit2.body.table.seats[0].committedThisStreet).toBe(5); // heads-up button = SB
    expect(sit2.body.table.seats[1].committedThisStreet).toBe(10);
    expect(sit2.body.hand.holeCards).toHaveLength(2); // bob sees his own cards
    expect(sit2.body.table.actingSeat).toBe(0); // SB acts first preflop heads-up
    // Opponent hole cards are not leaked in the public state.
    expect(sit2.body.table.seats[0].revealedCards).toBeUndefined();
  });

  it('enforces turn order and rejects an illegal action', async () => {
    const a = await createUser({ username: 'alice', balance: 1000 });
    const b = await createUser({ username: 'bob', balance: 1000 });
    const id = await createTable(a.token);
    await auth('post', `/api/poker/tables/${id}/sit`, a.token).send({ seatIndex: 0, buyIn: 1000 });
    await auth('post', `/api/poker/tables/${id}/sit`, b.token).send({ seatIndex: 1, buyIn: 1000 });

    // Bob (seat 1) is not to act → 409.
    expect((await auth('post', `/api/poker/tables/${id}/action`, b.token).send({ type: 'check' })).status).toBe(409);
    // Alice faces the big blind, so she cannot check → 400.
    expect((await auth('post', `/api/poker/tables/${id}/action`, a.token).send({ type: 'check' })).status).toBe(400);
  });

  it('plays a fold-out hand and cashes both players out with chips conserved', async () => {
    const a = await createUser({ username: 'alice', balance: 1000 });
    const b = await createUser({ username: 'bob', balance: 1000 });
    const id = await createTable(a.token);
    await auth('post', `/api/poker/tables/${id}/sit`, a.token).send({ seatIndex: 0, buyIn: 1000 });
    await auth('post', `/api/poker/tables/${id}/sit`, b.token).send({ seatIndex: 1, buyIn: 1000 });

    // Alice (SB) folds → Bob wins the blinds.
    const folded = await auth('post', `/api/poker/tables/${id}/action`, a.token).send({ type: 'fold' });
    expect(folded.status).toBe(200);
    expect(folded.body.table.seats[0].stack).toBe(995); // 1000 - 5 SB
    expect(folded.body.table.seats[1].stack).toBe(1005); // 1000 - 10 BB + 15 pot

    // Both cash out; balances reflect the hand and sum back to the starting 2000.
    const leaveA = await auth('post', `/api/poker/tables/${id}/leave`, a.token).send();
    expect(leaveA.body.cashedOut).toBe(995);
    expect(await getBalance(a.user.id)).toBe(995);
    const leaveB = await auth('post', `/api/poker/tables/${id}/leave`, b.token).send();
    expect(leaveB.body.cashedOut).toBe(1005);
    expect(await getBalance(b.user.id)).toBe(1005);
    expect((await getBalance(a.user.id)) + (await getBalance(b.user.id))).toBe(2000);
  });

  it('lets a player leave between hands and reclaim their stack', async () => {
    const a = await createUser({ username: 'alice', balance: 1000 });
    const id = await createTable(a.token);
    await auth('post', `/api/poker/tables/${id}/sit`, a.token).send({ seatIndex: 0, buyIn: 600 });
    expect(await getBalance(a.user.id)).toBe(400);
    const leave = await auth('post', `/api/poker/tables/${id}/leave`, a.token).send();
    expect(leave.body.cashedOut).toBe(600);
    expect(await getBalance(a.user.id)).toBe(1000); // fully reclaimed
  });

  it('refunds every parked seat stack to balance on crash-recovery boot', async () => {
    const a = await createUser({ username: 'alice', balance: 1000 });
    const b = await createUser({ username: 'bob', balance: 1000 });
    const id = await createTable(a.token);
    const id2 = await createTable(a.token); // alice also holds a seat at a 2nd table

    await auth('post', `/api/poker/tables/${id}/sit`, a.token).send({ seatIndex: 0, buyIn: 600 });
    await auth('post', `/api/poker/tables/${id}/sit`, b.token).send({ seatIndex: 1, buyIn: 1000 });
    await auth('post', `/api/poker/tables/${id2}/sit`, a.token).send({ seatIndex: 0, buyIn: 400 });
    // Chips are parked in seats, deducted from balances.
    expect(await getBalance(a.user.id)).toBe(0); // 1000 - 600 - 400
    expect(await getBalance(b.user.id)).toBe(0); // 1000 - 1000

    // Simulate a restart: engines drop and boot reconciliation runs.
    tableManager._resetAll();
    const result = await tableManager.refundAllSeats();
    expect(result.seats).toBe(3);
    expect(result.chips).toBe(2000);

    // Stacks (incl. alice's two seats summed) are back in balances; no seats remain.
    expect(await getBalance(a.user.id)).toBe(1000);
    expect(await getBalance(b.user.id)).toBe(1000);
    const lobby = await auth('get', '/api/poker/tables', a.token);
    for (const t of lobby.body.tables) expect(t.seatedHumans).toBe(0);

    // Idempotent: a second pass is a no-op.
    expect((await tableManager.refundAllSeats()).seats).toBe(0);
  });

  it('invites a friend to the table (friend-gated)', async () => {
    const a = await createUser({ username: 'alice', balance: 1000 });
    const b = await createUser({ username: 'bob', balance: 1000 });
    const stranger = await createUser({ username: 'stranger', balance: 1000 });
    const id = await createTable(a.token);

    // Must be seated to invite.
    expect((await auth('post', `/api/poker/tables/${id}/invite`, a.token).send({ username: 'bob' })).status).toBe(403);

    await auth('post', `/api/poker/tables/${id}/sit`, a.token).send({ seatIndex: 0, buyIn: 1000 });

    // Inviting a non-friend is rejected.
    expect((await auth('post', `/api/poker/tables/${id}/invite`, a.token).send({ username: 'stranger' })).status).toBe(403);
    // Unknown username → 404.
    expect((await auth('post', `/api/poker/tables/${id}/invite`, a.token).send({ username: 'nobody' })).status).toBe(404);

    // Friends can be invited.
    await makeFriends(a.user.id, b.user.id);
    const ok = await auth('post', `/api/poker/tables/${id}/invite`, a.token).send({ username: 'bob' });
    expect(ok.status).toBe(200);
    expect(ok.body.invited).toBe(true);
    void stranger;
  });

  it('lets the uncontested winner reveal their cards, blocking folded/in-hand reveals', async () => {
    const a = await createUser({ username: 'alice', balance: 1000 });
    const b = await createUser({ username: 'bob', balance: 1000 });
    const id = await createTable(a.token);
    await auth('post', `/api/poker/tables/${id}/sit`, a.token).send({ seatIndex: 0, buyIn: 1000 });
    await auth('post', `/api/poker/tables/${id}/sit`, b.token).send({ seatIndex: 1, buyIn: 1000 }); // heads-up hand starts

    // Can't reveal mid-hand.
    expect((await auth('post', `/api/poker/tables/${id}/reveal`, a.token).send()).status).toBe(409);

    // Alice (SB) folds → Bob wins uncontested (no showdown), so Bob's cards stay hidden.
    await auth('post', `/api/poker/tables/${id}/action`, a.token).send({ type: 'fold' });
    const beforeReveal = await auth('get', `/api/poker/tables/${id}`, a.token);
    expect(beforeReveal.body.table.seats[1].revealedCards).toBeUndefined();

    // A folded player has nothing to reveal.
    expect((await auth('post', `/api/poker/tables/${id}/reveal`, a.token).send()).status).toBe(400);

    // The winner can voluntarily show — now everyone sees Bob's two cards.
    const revealed = await auth('post', `/api/poker/tables/${id}/reveal`, b.token).send();
    expect(revealed.status).toBe(200);
    expect(revealed.body.table.seats[1].revealedCards).toHaveLength(2);
    // And a spectator's view reflects it too.
    const spectate = await auth('get', `/api/poker/tables/${id}`, a.token);
    expect(spectate.body.table.seats[1].revealedCards).toHaveLength(2);
  });

  describe('private-table join authorization', () => {
    it('lets the owner sit at their own private table but blocks an outsider', async () => {
      const owner = await createUser({ username: 'owner', balance: 1000 });
      const outsider = await createUser({ username: 'outsider', balance: 1000 });
      const id = await createTable(owner.token, { type: 'private' });

      // Owner can view and sit.
      expect((await auth('get', `/api/poker/tables/${id}`, owner.token)).status).toBe(200);
      expect((await auth('post', `/api/poker/tables/${id}/sit`, owner.token).send({ seatIndex: 0, buyIn: 500 })).status).toBe(200);

      // An outsider can neither view nor sit (403), and never lost coins.
      expect((await auth('get', `/api/poker/tables/${id}`, outsider.token)).status).toBe(403);
      const sit = await auth('post', `/api/poker/tables/${id}/sit`, outsider.token).send({ seatIndex: 1, buyIn: 500 });
      expect(sit.status).toBe(403);
      expect(await getBalance(outsider.user.id)).toBe(1000);

      // The table is hidden from the outsider's lobby but visible to the owner.
      const outsiderLobby = await auth('get', '/api/poker/tables', outsider.token);
      expect(outsiderLobby.body.tables.find((t: { id: number }) => t.id === id)).toBeUndefined();
      const ownerLobby = await auth('get', '/api/poker/tables', owner.token);
      expect(ownerLobby.body.tables.find((t: { id: number }) => t.id === id)).toBeTruthy();
    });

    it('grants access once a friend is invited (sit + lobby visibility)', async () => {
      const owner = await createUser({ username: 'owner', balance: 1000 });
      const friend = await createUser({ username: 'friend', balance: 1000 });
      const id = await createTable(owner.token, { type: 'private' });
      await auth('post', `/api/poker/tables/${id}/sit`, owner.token).send({ seatIndex: 0, buyIn: 500 });

      // Before the invite the friend is locked out.
      expect((await auth('post', `/api/poker/tables/${id}/sit`, friend.token).send({ seatIndex: 1, buyIn: 500 })).status).toBe(403);

      // Invite the friend (friend-gated) → persisted grant.
      await makeFriends(owner.user.id, friend.user.id);
      expect((await auth('post', `/api/poker/tables/${id}/invite`, owner.token).send({ username: 'friend' })).status).toBe(200);

      // Now the friend sees it in their lobby and can sit.
      const lobby = await auth('get', '/api/poker/tables', friend.token);
      expect(lobby.body.tables.find((t: { id: number }) => t.id === id)).toBeTruthy();
      expect((await auth('post', `/api/poker/tables/${id}/sit`, friend.token).send({ seatIndex: 1, buyIn: 500 })).status).toBe(200);
    });

    it('lets a group member sit at a group-scoped private table', async () => {
      const owner = await createUser({ username: 'owner', balance: 1000 });
      const member = await createUser({ username: 'member', balance: 1000 });
      const nonMember = await createUser({ username: 'nonmember', balance: 1000 });
      const groupId = await makeGroup(owner.user.id, [member.user.id]);
      const id = await createTable(owner.token, { type: 'private', groupId });

      // A member can sit; a non-member is blocked.
      expect((await auth('post', `/api/poker/tables/${id}/sit`, member.token).send({ seatIndex: 0, buyIn: 500 })).status).toBe(200);
      expect((await auth('post', `/api/poker/tables/${id}/sit`, nonMember.token).send({ seatIndex: 1, buyIn: 500 })).status).toBe(403);
    });

    it('keeps public tables open to anyone', async () => {
      const a = await createUser({ username: 'alice', balance: 1000 });
      const b = await createUser({ username: 'bob', balance: 1000 });
      const id = await createTable(a.token); // default type: public
      expect((await auth('get', `/api/poker/tables/${id}`, b.token)).status).toBe(200);
      expect((await auth('post', `/api/poker/tables/${id}/sit`, b.token).send({ seatIndex: 0, buyIn: 500 })).status).toBe(200);
    });
  });
});
