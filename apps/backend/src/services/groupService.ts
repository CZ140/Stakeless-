// Groups service — create/manage groups, invites (gated on friendship), member
// roles, ownership transfer/leave rules, and the private per-group leaderboard.
// Throws coded errors ({ code }) that routes/groups.ts maps to HTTP status.
//
// SECURITY: every mutating function reads the actor's role from group_members
// for that group and enforces it with roleCan()/canKick() from @gambling/shared.
// A role sent by the client is never trusted. Non-members cannot read a group,
// its membership, or its leaderboard.
import { and, eq, inArray, desc, asc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, groups, groupMembers, groupInvites } from '../db/schema.js';
import { roleCan, canKick, SOCIAL_LIMITS } from '@gambling/shared';
import type {
  GroupRole,
  GroupSummaryDTO,
  GroupMemberDTO,
  GroupDetailDTO,
  GroupInviteDTO,
  GroupLeaderboardRow,
  GroupLeaderboardSnapshot,
  SocialUser,
} from '@gambling/shared';
import { areFriends } from './friendService.js';

function err(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

// Drizzle wraps the driver error, so a Postgres unique-violation (23505) surfaces
// on the error or its .cause. Used as the race-safety net behind pre-checks.
function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;
  return code === '23505';
}

const ROLES: ReadonlySet<string> = new Set<GroupRole>(['owner', 'admin', 'member']);
function asRole(r: string): GroupRole {
  return ROLES.has(r) ? (r as GroupRole) : 'member';
}

// The actor's role in a group, or null if they are not a member.
async function getRole(groupId: number, userId: number): Promise<GroupRole | null> {
  const [m] = await db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
  return m ? asRole(m.role) : null;
}

async function requireRole(groupId: number, userId: number): Promise<GroupRole> {
  const role = await getRole(groupId, userId);
  if (!role) throw err('NOT_MEMBER', 'You are not a member of this group');
  return role;
}

export async function isGroupMember(userId: number, groupId: number): Promise<boolean> {
  return (await getRole(groupId, userId)) !== null;
}

// Columns + full member row used to build DTOs and leaderboard rows.
const memberUserCols = {
  userId: users.id,
  username: users.username,
  avatarColor: users.avatarColor,
  avatarImage: users.avatarImage,
  tierLevel: users.tierLevel,
  balance: users.balance,
  wagered: users.totalWagered,
  profit: users.totalProfit,
  role: groupMembers.role,
  joinedAt: groupMembers.joinedAt,
};
interface MemberRow {
  userId: number;
  username: string;
  avatarColor: string | null;
  avatarImage: string | null;
  tierLevel: number;
  balance: number;
  wagered: number;
  profit: number;
  role: string;
  joinedAt: Date;
}

async function fetchMembers(groupId: number): Promise<MemberRow[]> {
  return db
    .select(memberUserCols)
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.userId, users.id))
    .where(eq(groupMembers.groupId, groupId));
}

function toSocialUser(m: MemberRow): SocialUser {
  return {
    userId: m.userId,
    username: m.username,
    avatarColor: m.avatarColor,
    avatarImage: m.avatarImage,
    tierLevel: m.tierLevel,
  };
}

// ─── Create ─────────────────────────────────────────────────────────────────
export async function createGroup(
  userId: number,
  name: string,
  description?: string | null,
): Promise<GroupSummaryDTO> {
  const trimmed = name.trim();
  if (trimmed.length < SOCIAL_LIMITS.NAME_MIN || trimmed.length > SOCIAL_LIMITS.NAME_MAX) {
    throw err('INVALID_NAME', 'Group name must be 1–50 characters');
  }
  const count = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId));
  if ((count[0]?.n ?? 0) >= SOCIAL_LIMITS.MAX_GROUPS_PER_USER) {
    throw err('GROUP_LIMIT', 'You have reached the maximum number of groups');
  }

  const groupId = await db.transaction(async (tx) => {
    const [g] = await tx
      .insert(groups)
      .values({ name: trimmed, description: description?.trim() || null, ownerId: userId })
      .returning({ id: groups.id });
    await tx.insert(groupMembers).values({ groupId: g!.id, userId, role: 'owner' });
    return g!.id;
  });

  const [summary] = await summarizeGroups(userId, [groupId]);
  return summary!;
}

// ─── List my groups ───────────────────────────────────────────────────────────
export async function listMyGroups(userId: number): Promise<GroupSummaryDTO[]> {
  const mine = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId));
  if (mine.length === 0) return [];
  return summarizeGroups(userId, mine.map((m) => m.groupId));
}

// Build GroupSummaryDTO[] for the given group ids from the viewer's perspective.
async function summarizeGroups(userId: number, groupIds: number[]): Promise<GroupSummaryDTO[]> {
  if (groupIds.length === 0) return [];
  const [groupRows, joined] = await Promise.all([
    db.select().from(groups).where(inArray(groups.id, groupIds)),
    // Members of every requested group in one join (carries groupId for grouping).
    db
      .select({
        groupId: groupMembers.groupId,
        userId: users.id,
        username: users.username,
        avatarColor: users.avatarColor,
        avatarImage: users.avatarImage,
        tierLevel: users.tierLevel,
        balance: users.balance,
        wagered: users.totalWagered,
        profit: users.totalProfit,
        role: groupMembers.role,
        joinedAt: groupMembers.joinedAt,
      })
      .from(groupMembers)
      .innerJoin(users, eq(groupMembers.userId, users.id))
      .where(inArray(groupMembers.groupId, groupIds)),
  ]);
  const membersByGroup = new Map<number, MemberRow[]>();
  for (const row of joined) {
    const list = membersByGroup.get(row.groupId) ?? [];
    list.push(row as MemberRow);
    membersByGroup.set(row.groupId, list);
  }

  const out: GroupSummaryDTO[] = [];
  for (const g of groupRows) {
    const members = membersByGroup.get(g.id) ?? [];
    const myRole = members.find((m) => m.userId === userId);
    if (!myRole) continue; // viewer not a member — skip (defensive)
    const owner = members.find((m) => asRole(m.role) === 'owner');
    // Rank by balance for the card stat.
    const byBalance = [...members].sort((a, b) => b.balance - a.balance);
    const myRank = byBalance.findIndex((m) => m.userId === userId);
    // A few avatars for the stacked preview — richest first.
    const avatars = byBalance.slice(0, 4).map((m) => ({
      username: m.username,
      avatarColor: m.avatarColor,
      avatarImage: m.avatarImage,
    }));
    out.push({
      id: g.id,
      name: g.name,
      description: g.description,
      memberCount: members.length,
      myRole: asRole(myRole.role),
      ownerUsername: owner?.username ?? '',
      avatars,
      myRank: myRank >= 0 ? myRank + 1 : null,
    });
  }
  // Most members first (a light, stable ordering).
  out.sort((a, b) => b.memberCount - a.memberCount);
  return out;
}

// ─── Detail ─────────────────────────────────────────────────────────────────
export async function getGroup(userId: number, groupId: number): Promise<GroupDetailDTO> {
  const myRole = await getRole(groupId, userId);
  if (!myRole) throw err('NOT_MEMBER', 'You are not a member of this group');
  const [g] = await db.select().from(groups).where(eq(groups.id, groupId));
  if (!g) throw err('NOT_FOUND', 'Group not found');
  const members = await fetchMembers(groupId);
  // Owner first, then admins, then members; alphabetical within a tier.
  const order: Record<GroupRole, number> = { owner: 0, admin: 1, member: 2 };
  const memberDTOs: GroupMemberDTO[] = members
    .sort((a, b) => order[asRole(a.role)] - order[asRole(b.role)] || a.username.localeCompare(b.username))
    .map((m) => ({ ...toSocialUser(m), role: asRole(m.role), joinedAt: m.joinedAt.toISOString() }));
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    ownerId: g.ownerId,
    createdAt: g.createdAt.toISOString(),
    myRole,
    members: memberDTOs,
  };
}

// ─── Invites ──────────────────────────────────────────────────────────────────
export interface InviteResult {
  inviteeId: number;
  // For the invitee's live 'group:invite' push.
  invite: GroupInviteDTO;
}

export async function inviteToGroup(
  userId: number,
  groupId: number,
  inviteeUsername: string,
): Promise<InviteResult> {
  const actorRole = await requireRole(groupId, userId);
  if (!roleCan(actorRole, 'invite')) throw err('NOT_AUTHORIZED', 'You cannot invite to this group');

  const [invitee] = await db
    .select({ id: users.id, username: users.username, avatarColor: users.avatarColor, avatarImage: users.avatarImage, tierLevel: users.tierLevel })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${inviteeUsername})`);
  if (!invitee) throw err('NOT_FOUND', 'No user with that username');

  // KEY RULE: you can only invite an accepted friend.
  if (!(await areFriends(userId, invitee.id))) throw err('NOT_FRIENDS', 'You can only invite friends');

  if (await getRole(groupId, invitee.id)) throw err('ALREADY_MEMBER', 'That user is already a member');

  // Pre-check the one-pending-invite rule (the partial unique index is the
  // race-safety net behind it).
  const [pending] = await db
    .select({ id: groupInvites.id })
    .from(groupInvites)
    .where(
      and(
        eq(groupInvites.groupId, groupId),
        eq(groupInvites.inviteeId, invitee.id),
        eq(groupInvites.status, 'pending'),
      ),
    );
  if (pending) throw err('INVITE_EXISTS', 'An invite is already pending');

  const [inviter] = await db
    .select({ id: users.id, username: users.username, avatarColor: users.avatarColor, avatarImage: users.avatarImage, tierLevel: users.tierLevel })
    .from(users)
    .where(eq(users.id, userId));
  const [g] = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, groupId));

  let inviteId: number;
  let createdAt: Date;
  try {
    const [row] = await db
      .insert(groupInvites)
      .values({ groupId, inviterId: userId, inviteeId: invitee.id, status: 'pending' })
      .returning({ id: groupInvites.id, createdAt: groupInvites.createdAt });
    inviteId = row!.id;
    createdAt = row!.createdAt;
  } catch (e) {
    if (isUniqueViolation(e)) throw err('INVITE_EXISTS', 'An invite is already pending');
    throw e;
  }

  const memberCount = await countMembers(groupId);
  return {
    inviteeId: invitee.id,
    invite: {
      id: inviteId,
      group: { id: groupId, name: g?.name ?? '', memberCount },
      inviter: {
        userId: inviter!.id,
        username: inviter!.username,
        avatarColor: inviter!.avatarColor,
        avatarImage: inviter!.avatarImage,
        tierLevel: inviter!.tierLevel,
      },
      createdAt: createdAt.toISOString(),
    },
  };
}

async function countMembers(groupId: number): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId));
  return r?.n ?? 0;
}

export async function listMyGroupInvites(userId: number): Promise<GroupInviteDTO[]> {
  const rows = await db
    .select({
      id: groupInvites.id,
      groupId: groupInvites.groupId,
      groupName: groups.name,
      createdAt: groupInvites.createdAt,
      inviterId: users.id,
      inviterName: users.username,
      inviterColor: users.avatarColor,
      inviterImage: users.avatarImage,
      inviterTier: users.tierLevel,
    })
    .from(groupInvites)
    .innerJoin(groups, eq(groupInvites.groupId, groups.id))
    .innerJoin(users, eq(groupInvites.inviterId, users.id))
    .where(and(eq(groupInvites.inviteeId, userId), eq(groupInvites.status, 'pending')))
    .orderBy(desc(groupInvites.createdAt));
  if (rows.length === 0) return [];
  const counts = await db
    .select({ groupId: groupMembers.groupId, n: sql<number>`count(*)`.mapWith(Number) })
    .from(groupMembers)
    .where(inArray(groupMembers.groupId, rows.map((r) => r.groupId)))
    .groupBy(groupMembers.groupId);
  const countByGroup = new Map(counts.map((c) => [c.groupId, c.n]));
  return rows.map((r) => ({
    id: r.id,
    group: { id: r.groupId, name: r.groupName, memberCount: countByGroup.get(r.groupId) ?? 0 },
    inviter: {
      userId: r.inviterId,
      username: r.inviterName,
      avatarColor: r.inviterColor,
      avatarImage: r.inviterImage,
      tierLevel: r.inviterTier,
    },
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function acceptGroupInvite(userId: number, inviteId: number): Promise<GroupDetailDTO> {
  const [inv] = await db.select().from(groupInvites).where(eq(groupInvites.id, inviteId));
  if (!inv || inv.status !== 'pending') throw err('NOT_FOUND', 'Invite not found');
  if (inv.inviteeId !== userId) throw err('NOT_AUTHORIZED', 'Not your invite');

  await db.transaction(async (tx) => {
    // Re-check membership + capacity inside the tx.
    const [existing] = await tx
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, inv.groupId), eq(groupMembers.userId, userId)));
    if (existing) {
      await tx.update(groupInvites).set({ status: 'accepted', respondedAt: new Date() }).where(eq(groupInvites.id, inviteId));
      return;
    }
    const cap = await tx
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, inv.groupId));
    if ((cap[0]?.n ?? 0) >= SOCIAL_LIMITS.MAX_MEMBERS_PER_GROUP) throw err('GROUP_FULL', 'This group is full');
    await tx.insert(groupMembers).values({ groupId: inv.groupId, userId, role: 'member' });
    await tx.update(groupInvites).set({ status: 'accepted', respondedAt: new Date() }).where(eq(groupInvites.id, inviteId));
  });

  return getGroup(userId, inv.groupId);
}

export async function declineGroupInvite(userId: number, inviteId: number): Promise<void> {
  const [inv] = await db.select().from(groupInvites).where(eq(groupInvites.id, inviteId));
  if (!inv || inv.status !== 'pending') throw err('NOT_FOUND', 'Invite not found');
  if (inv.inviteeId !== userId) throw err('NOT_AUTHORIZED', 'Not your invite');
  await db.update(groupInvites).set({ status: 'declined', respondedAt: new Date() }).where(eq(groupInvites.id, inviteId));
}

// ─── Member management ──────────────────────────────────────────────────────
export async function kickMember(actorId: number, groupId: number, targetUserId: number): Promise<void> {
  if (actorId === targetUserId) throw err('NOT_AUTHORIZED', 'Use leave to remove yourself');
  const actorRole = await requireRole(groupId, actorId);
  const targetRole = await getRole(groupId, targetUserId);
  if (!targetRole) throw err('NOT_FOUND', 'That user is not a member');
  if (!canKick(actorRole, targetRole)) throw err('NOT_AUTHORIZED', 'You cannot remove that member');
  await db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId)));
}

export async function setMemberRole(
  actorId: number,
  groupId: number,
  targetUserId: number,
  role: 'admin' | 'member',
): Promise<void> {
  const actorRole = await requireRole(groupId, actorId);
  const perm = role === 'admin' ? 'promote' : 'demote';
  if (!roleCan(actorRole, perm)) throw err('NOT_AUTHORIZED', 'Only the owner can change roles');
  const targetRole = await getRole(groupId, targetUserId);
  if (!targetRole) throw err('NOT_FOUND', 'That user is not a member');
  if (targetRole === 'owner') throw err('NOT_AUTHORIZED', 'The owner role cannot be changed here');
  await db
    .update(groupMembers)
    .set({ role })
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId)));
}

export async function transferOwnership(actorId: number, groupId: number, targetUserId: number): Promise<void> {
  const actorRole = await requireRole(groupId, actorId);
  if (!roleCan(actorRole, 'transferOwner')) throw err('NOT_AUTHORIZED', 'Only the owner can transfer ownership');
  const targetRole = await getRole(groupId, targetUserId);
  if (!targetRole) throw err('NOT_FOUND', 'That user is not a member');
  if (targetUserId === actorId) throw err('NOT_AUTHORIZED', 'You already own this group');
  await db.transaction(async (tx) => {
    await tx.update(groupMembers).set({ role: 'owner' }).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId)));
    await tx.update(groupMembers).set({ role: 'admin' }).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, actorId)));
    await tx.update(groups).set({ ownerId: targetUserId }).where(eq(groups.id, groupId));
  });
}

export async function renameGroup(
  actorId: number,
  groupId: number,
  patch: { name?: string; description?: string | null },
): Promise<GroupDetailDTO> {
  const actorRole = await requireRole(groupId, actorId);
  if (!roleCan(actorRole, 'rename')) throw err('NOT_AUTHORIZED', 'You cannot edit this group');
  const set: { name?: string; description?: string | null } = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (trimmed.length < SOCIAL_LIMITS.NAME_MIN || trimmed.length > SOCIAL_LIMITS.NAME_MAX) {
      throw err('INVALID_NAME', 'Group name must be 1–50 characters');
    }
    set.name = trimmed;
  }
  if (patch.description !== undefined) {
    set.description = patch.description?.trim() || null;
  }
  if (Object.keys(set).length > 0) {
    await db.update(groups).set(set).where(eq(groups.id, groupId));
  }
  return getGroup(actorId, groupId);
}

// Leave a group. Owner rule: if other members remain, ownership auto-promotes to
// the longest-tenured admin (fallback: longest-tenured member) before leaving; if
// the owner is the last member, the group is deleted (cascades members + invites).
export async function leaveGroup(userId: number, groupId: number): Promise<{ deleted: boolean }> {
  const role = await requireRole(groupId, userId);
  const members = await fetchMembers(groupId);

  if (role !== 'owner') {
    await db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
    return { deleted: false };
  }

  const others = members.filter((m) => m.userId !== userId);
  if (others.length === 0) {
    await db.delete(groups).where(eq(groups.id, groupId)); // cascade removes members + invites
    return { deleted: true };
  }

  // Pick a successor: longest-tenured admin, else longest-tenured member.
  const byTenure = [...others].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  const successor = byTenure.find((m) => asRole(m.role) === 'admin') ?? byTenure[0]!;
  await db.transaction(async (tx) => {
    await tx.update(groupMembers).set({ role: 'owner' }).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, successor.userId)));
    await tx.update(groups).set({ ownerId: successor.userId }).where(eq(groups.id, groupId));
    await tx.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
  });
  return { deleted: false };
}

export async function deleteGroup(actorId: number, groupId: number): Promise<void> {
  const actorRole = await requireRole(groupId, actorId);
  if (!roleCan(actorRole, 'deleteGroup')) throw err('NOT_AUTHORIZED', 'Only the owner can delete the group');
  await db.delete(groups).where(eq(groups.id, groupId)); // cascade members + invites
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────
// Build the three ranked arrays (balance/wagered/profit) for a group. Each row
// carries all three metrics so the table can render every column; `rank` is the
// 1-based position within the metric the array is ordered by.
export async function computeGroupLeaderboard(groupId: number): Promise<GroupLeaderboardSnapshot> {
  const members = await fetchMembers(groupId);
  const base = members.map((m) => ({
    userId: m.userId,
    username: m.username,
    avatarColor: m.avatarColor,
    avatarImage: m.avatarImage,
    tierLevel: m.tierLevel,
    role: asRole(m.role),
    balance: m.balance,
    wagered: m.wagered,
    profit: m.profit,
  }));
  const ranked = (key: 'balance' | 'wagered' | 'profit'): GroupLeaderboardRow[] =>
    [...base]
      .sort((a, b) => b[key] - a[key] || a.userId - b.userId)
      .map((row, i) => ({ ...row, rank: i + 1 }));
  return { byBalance: ranked('balance'), byWagered: ranked('wagered'), byProfit: ranked('profit') };
}

export async function getGroupLeaderboard(userId: number, groupId: number): Promise<GroupLeaderboardSnapshot> {
  if (!(await isGroupMember(userId, groupId))) throw err('NOT_MEMBER', 'You are not a member of this group');
  return computeGroupLeaderboard(groupId);
}
