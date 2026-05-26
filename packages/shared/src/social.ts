// Social layer — Friends & Groups. Shared types plus the group role/permission
// matrix. Single source of truth used by the backend (enforcement) AND the
// frontend (hide/disable controls). Re-exported from index.ts.
//
// SECURITY: the frontend only HIDES controls with roleCan()/canKick(); the
// backend re-reads the actor's role from group_members and re-checks on every
// mutating request. Never trust a role sent by the client.

// ─── Shared user shape ────────────────────────────────────────────────────────
// The minimal public view of a user surfaced across the social UI (rows, podium,
// pickers). Mirrors the leaderboard column set plus the avatar image.
export interface SocialUser {
  userId: number;
  username: string;
  avatarColor: string | null;
  avatarImage: string | null;
  tierLevel: number;
}

// ─── Friends ────────────────────────────────────────────────────────────────
export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';

export interface FriendDTO extends SocialUser {
  balance: number;
  since: string; // ISO timestamp the friendship was accepted
  online: boolean; // live presence — ≥1 of their sockets is connected right now
}

// A user the viewer has blocked. Listed on the Friends "Blocked" tab so the
// block can be lifted. `since` is when the block was created.
export interface BlockedUserDTO extends SocialUser {
  since: string;
}

export interface FriendRequestDTO {
  id: number;
  direction: 'incoming' | 'outgoing';
  user: SocialUser;
  createdAt: string;
}

export interface FriendRequestsDTO {
  incoming: FriendRequestDTO[];
  outgoing: FriendRequestDTO[];
}

// How the searcher relates to a found user — drives Add / Pending / Friends in
// the Add-friend tab.
export type RelationshipTag = 'none' | 'friends' | 'incoming' | 'outgoing' | 'self';

export interface UserSearchResultDTO extends SocialUser {
  relationship: RelationshipTag;
}

// ─── Groups: roles + permissions ──────────────────────────────────────────────
export type GroupRole = 'owner' | 'admin' | 'member';

export type GroupPermission =
  | 'invite' // send group invites (to friends)
  | 'kickMember' // remove a 'member'
  | 'kickAdmin' // remove an 'admin'
  | 'promote' // member -> admin
  | 'demote' // admin -> member
  | 'rename' // edit name / description
  | 'transferOwner' // hand owner to someone else
  | 'deleteGroup';

// The matrix from FRIENDS_GROUPS_PLAN §4.3. Owner has everything; admin can
// invite, kick members and rename; member can only invite friends.
const ROLE_PERMISSIONS: Record<GroupRole, ReadonlySet<GroupPermission>> = {
  owner: new Set<GroupPermission>([
    'invite',
    'kickMember',
    'kickAdmin',
    'promote',
    'demote',
    'rename',
    'transferOwner',
    'deleteGroup',
  ]),
  admin: new Set<GroupPermission>(['invite', 'kickMember', 'rename']),
  member: new Set<GroupPermission>(['invite']),
};

export function roleCan(role: GroupRole, perm: GroupPermission): boolean {
  return ROLE_PERMISSIONS[role]?.has(perm) ?? false;
}

// Can `actorRole` kick a member holding `targetRole`? Nobody can kick the owner;
// kicking an admin needs the 'kickAdmin' permission (owner only); kicking a
// member needs 'kickMember' (owner or admin).
export function canKick(actorRole: GroupRole, targetRole: GroupRole): boolean {
  if (targetRole === 'owner') return false;
  if (targetRole === 'admin') return roleCan(actorRole, 'kickAdmin');
  return roleCan(actorRole, 'kickMember');
}

export const SOCIAL_LIMITS = {
  MAX_GROUPS_PER_USER: 20,
  MAX_MEMBERS_PER_GROUP: 50,
  NAME_MIN: 1,
  NAME_MAX: 50,
  DESCRIPTION_MAX: 140,
  SEARCH_RESULT_CAP: 10,
} as const;

// ─── Groups: DTOs ─────────────────────────────────────────────────────────────
export interface GroupAvatar {
  username: string;
  avatarColor: string | null;
  avatarImage: string | null;
}

export interface GroupSummaryDTO {
  id: number;
  name: string;
  description: string | null;
  memberCount: number;
  myRole: GroupRole;
  ownerUsername: string;
  // A handful of member avatars for the stacked preview on the card.
  avatars: GroupAvatar[];
  // The viewer's rank within the group by balance (1-based), for the card stat.
  myRank: number | null;
}

export interface GroupMemberDTO extends SocialUser {
  role: GroupRole;
  joinedAt: string;
}

export interface GroupDetailDTO {
  id: number;
  name: string;
  description: string | null;
  ownerId: number;
  createdAt: string;
  myRole: GroupRole;
  members: GroupMemberDTO[];
}

export interface GroupInviteDTO {
  id: number;
  group: { id: number; name: string; memberCount: number };
  inviter: SocialUser;
  createdAt: string;
}

// One ranked row of a group's private leaderboard. Carries all three metrics so
// the table can show Balance / Wagered / Profit columns regardless of the active
// tab; `rank` is the 1-based position within the metric the array is sorted by.
export interface GroupLeaderboardRow {
  userId: number;
  username: string;
  avatarColor: string | null;
  avatarImage: string | null;
  tierLevel: number;
  role: GroupRole;
  balance: number;
  wagered: number;
  profit: number;
  rank: number;
}

export interface GroupLeaderboardSnapshot {
  byBalance: GroupLeaderboardRow[];
  byWagered: GroupLeaderboardRow[];
  byProfit: GroupLeaderboardRow[];
}

export type GroupLeaderboardMetric = 'balance' | 'wagered' | 'profit';
