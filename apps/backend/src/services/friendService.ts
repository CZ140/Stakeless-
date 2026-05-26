// Friends service — send/accept/decline/cancel/remove friend requests, list
// friends + pending requests, and search users with a relationship tag. Throws
// coded errors ({ code }) that routes/friends.ts maps to HTTP status codes.
//
// The friendships table stores a directed pair (requester → addressee). A
// relationship between two users is a single row in EITHER direction; the
// reverse-duplicate (B→A while A→B exists) has no DB constraint, so it is
// guarded here, and a mutual pending request auto-accepts.
import { and, or, eq, ne, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, friendships } from '../db/schema.js';
import { SOCIAL_LIMITS } from '@gambling/shared';
import type {
  SocialUser,
  FriendDTO,
  BlockedUserDTO,
  FriendRequestDTO,
  FriendRequestsDTO,
  UserSearchResultDTO,
  RelationshipTag,
} from '@gambling/shared';
import { isOnline } from './presence.js';

function err(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

// Drizzle wraps the driver error, so a Postgres unique-violation (23505) surfaces
// on the error or its .cause.
function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;
  return code === '23505';
}

// Columns surfaced across the social UI — never selects password_hash etc.
const userCols = {
  id: users.id,
  username: users.username,
  avatarColor: users.avatarColor,
  avatarImage: users.avatarImage,
  tierLevel: users.tierLevel,
  balance: users.balance,
};
type UserCols = {
  id: number;
  username: string;
  avatarColor: string | null;
  avatarImage: string | null;
  tierLevel: number;
  balance: number;
};

function toSocialUser(u: UserCols): SocialUser {
  return {
    userId: u.id,
    username: u.username,
    avatarColor: u.avatarColor,
    avatarImage: u.avatarImage,
    tierLevel: u.tierLevel,
  };
}

async function getUserById(id: number): Promise<UserCols | null> {
  const [u] = await db.select(userCols).from(users).where(eq(users.id, id));
  return u ?? null;
}

// The single friendship row between two users, in either direction (or null).
async function findRelationship(a: number, b: number) {
  const [row] = await db
    .select()
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
        and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)),
      ),
    );
  return row ?? null;
}

// ─── Send ─────────────────────────────────────────────────────────────────────
export type SendFriendRequestResult =
  | {
      kind: 'requested';
      requestId: number;
      otherUserId: number;
      // For the addressee's live 'friend:request' push (incoming, from the actor).
      requestForOther: FriendRequestDTO;
      // For the actor's HTTP response (outgoing, to the target).
      requestForActor: FriendRequestDTO;
    }
  | {
      kind: 'accepted';
      otherUserId: number;
      // For the actor's HTTP response — the new friend (the original sender).
      friendForActor: FriendDTO;
      // For the original sender's live 'friend:accepted' push — the actor.
      friendForOther: FriendDTO;
    };

export async function sendFriendRequest(
  requesterId: number,
  targetUsername: string,
): Promise<SendFriendRequestResult> {
  const [target] = await db
    .select(userCols)
    .from(users)
    .where(sql`lower(${users.username}) = lower(${targetUsername})`);
  if (!target) throw err('NOT_FOUND', 'No user with that username');
  if (target.id === requesterId) throw err('CANNOT_FRIEND_SELF', 'You cannot friend yourself');

  const actor = await getUserById(requesterId);
  if (!actor) throw err('NOT_FOUND', 'User not found');

  const existing = await findRelationship(requesterId, target.id);
  if (existing) {
    if (existing.status === 'accepted') throw err('ALREADY_FRIENDS', 'You are already friends');
    if (existing.status === 'blocked') throw err('BLOCKED', 'Unable to send a request');
    // status === 'pending'
    if (existing.requesterId === requesterId) {
      throw err('REQUEST_EXISTS', 'A request is already pending');
    }
    // Reverse pending (target → actor): mutual intent ⇒ auto-accept.
    await db
      .update(friendships)
      .set({ status: 'accepted', respondedAt: new Date() })
      .where(eq(friendships.id, existing.id));
    return {
      kind: 'accepted',
      otherUserId: target.id,
      friendForActor: { ...toSocialUser(target), balance: target.balance, since: new Date().toISOString(), online: isOnline(target.id) },
      friendForOther: { ...toSocialUser(actor), balance: actor.balance, since: new Date().toISOString(), online: isOnline(actor.id) },
    };
  }

  let inserted: { id: number; createdAt: Date } | undefined;
  try {
    [inserted] = await db
      .insert(friendships)
      .values({ requesterId, addresseeId: target.id, status: 'pending' })
      .returning({ id: friendships.id, createdAt: friendships.createdAt });
  } catch (e) {
    // Unique-pair violation from a concurrent identical request → treat as existing.
    if (isUniqueViolation(e)) throw err('REQUEST_EXISTS', 'A request is already pending');
    throw e;
  }
  const createdAt = inserted!.createdAt.toISOString();
  return {
    kind: 'requested',
    requestId: inserted!.id,
    otherUserId: target.id,
    requestForOther: { id: inserted!.id, direction: 'incoming', user: toSocialUser(actor), createdAt },
    requestForActor: { id: inserted!.id, direction: 'outgoing', user: toSocialUser(target), createdAt },
  };
}

// ─── Accept ─────────────────────────────────────────────────────────────────
export interface AcceptResult {
  requesterId: number;
  // For the accepter's HTTP response — their new friend (the original sender).
  friendForActor: FriendDTO;
  // For the original sender's live 'friend:accepted' push — the accepter.
  friendForRequester: FriendDTO;
}

export async function acceptFriendRequest(userId: number, requestId: number): Promise<AcceptResult> {
  const [row] = await db.select().from(friendships).where(eq(friendships.id, requestId));
  if (!row || row.status !== 'pending') throw err('NOT_FOUND', 'Request not found');
  if (row.addresseeId !== userId) throw err('NOT_AUTHORIZED', 'Not your request to accept');

  const now = new Date();
  await db.update(friendships).set({ status: 'accepted', respondedAt: now }).where(eq(friendships.id, requestId));

  const [requester, actor] = await Promise.all([getUserById(row.requesterId), getUserById(userId)]);
  if (!requester || !actor) throw err('NOT_FOUND', 'User not found');
  const since = now.toISOString();
  return {
    requesterId: row.requesterId,
    friendForActor: { ...toSocialUser(requester), balance: requester.balance, since, online: isOnline(requester.id) },
    friendForRequester: { ...toSocialUser(actor), balance: actor.balance, since, online: isOnline(actor.id) },
  };
}

// Decline (addressee only) — delete so they can re-ask later.
export async function declineFriendRequest(userId: number, requestId: number): Promise<void> {
  const [row] = await db.select().from(friendships).where(eq(friendships.id, requestId));
  if (!row || row.status !== 'pending') throw err('NOT_FOUND', 'Request not found');
  if (row.addresseeId !== userId) throw err('NOT_AUTHORIZED', 'Not your request to decline');
  await db.delete(friendships).where(eq(friendships.id, requestId));
}

// Cancel (requester only) — delete an outgoing pending request.
export async function cancelFriendRequest(userId: number, requestId: number): Promise<void> {
  const [row] = await db.select().from(friendships).where(eq(friendships.id, requestId));
  if (!row || row.status !== 'pending') throw err('NOT_FOUND', 'Request not found');
  if (row.requesterId !== userId) throw err('NOT_AUTHORIZED', 'Not your request to cancel');
  await db.delete(friendships).where(eq(friendships.id, requestId));
}

// Remove an accepted friend (either direction).
export async function removeFriend(userId: number, otherUserId: number): Promise<void> {
  const rel = await findRelationship(userId, otherUserId);
  if (!rel || rel.status !== 'accepted') throw err('NOT_FOUND', 'Not friends');
  await db.delete(friendships).where(eq(friendships.id, rel.id));
}

// ─── Block / Unblock ──────────────────────────────────────────────────────────
// Blocking ends any friendship/pending request between the two and records a
// blocked row owned by the blocker (requesterId = blocker). While it stands,
// neither side can send a request (sendFriendRequest returns BLOCKED) and the
// pair is hidden from each other's search. Idempotent: re-blocking is a no-op.
// The blocked user is NOT notified.
export async function blockUser(blockerId: number, targetUserId: number): Promise<void> {
  if (blockerId === targetUserId) throw err('CANNOT_BLOCK_SELF', 'You cannot block yourself');
  const target = await getUserById(targetUserId);
  if (!target) throw err('NOT_FOUND', 'User not found');

  await db.transaction(async (tx) => {
    // Drop whatever relationship currently exists (friends, pending, or a stale
    // block owned by the other side), then insert a fresh block owned by us.
    const existing = await tx
      .select()
      .from(friendships)
      .where(
        or(
          and(eq(friendships.requesterId, blockerId), eq(friendships.addresseeId, targetUserId)),
          and(eq(friendships.requesterId, targetUserId), eq(friendships.addresseeId, blockerId)),
        ),
      );
    // Already blocked by us — nothing to do.
    if (existing.some((r) => r.status === 'blocked' && r.requesterId === blockerId)) return;
    if (existing.length > 0) {
      await tx.delete(friendships).where(
        inArray(
          friendships.id,
          existing.map((r) => r.id),
        ),
      );
    }
    await tx
      .insert(friendships)
      .values({ requesterId: blockerId, addresseeId: targetUserId, status: 'blocked', respondedAt: new Date() });
  });
}

// Lift a block we own. 404 if we hadn't blocked this user.
export async function unblockUser(blockerId: number, targetUserId: number): Promise<void> {
  const deleted = await db
    .delete(friendships)
    .where(
      and(
        eq(friendships.requesterId, blockerId),
        eq(friendships.addresseeId, targetUserId),
        eq(friendships.status, 'blocked'),
      ),
    )
    .returning({ id: friendships.id });
  if (deleted.length === 0) throw err('NOT_FOUND', 'Not blocked');
}

// Users the viewer has blocked (rows the viewer owns).
export async function listBlocked(blockerId: number): Promise<BlockedUserDTO[]> {
  const rows = await db
    .select()
    .from(friendships)
    .where(and(eq(friendships.status, 'blocked'), eq(friendships.requesterId, blockerId)));
  if (rows.length === 0) return [];
  const since = new Map<number, string>();
  for (const r of rows) since.set(r.addresseeId, (r.respondedAt ?? r.createdAt).toISOString());
  const us = await db.select(userCols).from(users).where(inArray(users.id, rows.map((r) => r.addresseeId)));
  return us
    .map((u) => ({ ...toSocialUser(u), since: since.get(u.id)! }))
    .sort((a, b) => a.username.localeCompare(b.username));
}

// ─── Lists ──────────────────────────────────────────────────────────────────
export async function listFriends(userId: number): Promise<FriendDTO[]> {
  const rows = await db
    .select()
    .from(friendships)
    .where(
      and(
        eq(friendships.status, 'accepted'),
        or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
      ),
    );
  if (rows.length === 0) return [];
  const since = new Map<number, string>();
  const ids = rows.map((r) => {
    const friendId = r.requesterId === userId ? r.addresseeId : r.requesterId;
    since.set(friendId, (r.respondedAt ?? r.createdAt).toISOString());
    return friendId;
  });
  const us = await db.select(userCols).from(users).where(inArray(users.id, ids));
  return us
    .map((u) => ({ ...toSocialUser(u), balance: u.balance, since: since.get(u.id)!, online: isOnline(u.id) }))
    .sort((a, b) => b.balance - a.balance);
}

// Friend user-ids only (accepted, either direction) — used by the socket layer to
// fan out a presence change to a user's friends without building full DTOs.
export async function listFriendIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ requesterId: friendships.requesterId, addresseeId: friendships.addresseeId })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, 'accepted'),
        or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
      ),
    );
  return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
}

export async function listRequests(userId: number): Promise<FriendRequestsDTO> {
  const rows = await db
    .select()
    .from(friendships)
    .where(
      and(
        eq(friendships.status, 'pending'),
        or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
      ),
    );
  if (rows.length === 0) return { incoming: [], outgoing: [] };

  const otherIds = rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
  const us = await db.select(userCols).from(users).where(inArray(users.id, otherIds));
  const byId = new Map(us.map((u) => [u.id, u]));

  const incoming: FriendRequestDTO[] = [];
  const outgoing: FriendRequestDTO[] = [];
  for (const r of rows) {
    const otherId = r.requesterId === userId ? r.addresseeId : r.requesterId;
    const u = byId.get(otherId);
    if (!u) continue;
    const dto: FriendRequestDTO = {
      id: r.id,
      direction: r.addresseeId === userId ? 'incoming' : 'outgoing',
      user: toSocialUser(u),
      createdAt: r.createdAt.toISOString(),
    };
    (dto.direction === 'incoming' ? incoming : outgoing).push(dto);
  }
  // Newest first.
  incoming.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  outgoing.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { incoming, outgoing };
}

// Search users by username prefix (case-insensitive), tagging each with the
// viewer's relationship so the UI shows Add / Pending / Friends. Blocked pairs
// are hidden.
export async function searchUsers(userId: number, query: string): Promise<UserSearchResultDTO[]> {
  const q = query.trim();
  if (q.length === 0) return [];
  // Escape LIKE wildcards in the user input, then match a prefix.
  const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`);
  const candidates = await db
    .select(userCols)
    .from(users)
    .where(and(ne(users.id, userId), sql`lower(${users.username}) like lower(${escaped + '%'}) escape '\\'`))
    .limit(SOCIAL_LIMITS.SEARCH_RESULT_CAP);
  if (candidates.length === 0) return [];

  const ids = candidates.map((c) => c.id);
  const rels = await db
    .select()
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, userId), inArray(friendships.addresseeId, ids)),
        and(eq(friendships.addresseeId, userId), inArray(friendships.requesterId, ids)),
      ),
    );
  const relByOther = new Map<number, (typeof rels)[number]>();
  for (const r of rels) {
    relByOther.set(r.requesterId === userId ? r.addresseeId : r.requesterId, r);
  }

  const results: UserSearchResultDTO[] = [];
  for (const c of candidates) {
    const rel = relByOther.get(c.id);
    let tag: RelationshipTag = 'none';
    if (rel) {
      if (rel.status === 'blocked') continue; // hide blocked pairs from search
      if (rel.status === 'accepted') tag = 'friends';
      else tag = rel.requesterId === userId ? 'outgoing' : 'incoming';
    }
    results.push({ ...toSocialUser(c), relationship: tag });
  }
  return results;
}

// Used by groupService to enforce the invite-requires-friendship rule.
export async function areFriends(a: number, b: number): Promise<boolean> {
  const rel = await findRelationship(a, b);
  return rel?.status === 'accepted';
}
