import { create } from 'zustand';
import type { FriendDTO, BlockedUserDTO, FriendRequestDTO, UserSearchResultDTO } from '@gambling/shared';

// Friends state shared by the Friends page, the sidebar request-count badge, and
// the group friend-picker. Populated on app load (useSocial) and kept live by
// socket events (friend:request / friend:accepted / presence:update).
interface FriendsState {
  friends: FriendDTO[];
  incoming: FriendRequestDTO[];
  outgoing: FriendRequestDTO[];
  searchResults: UserSearchResultDTO[];
  blocked: BlockedUserDTO[];
  loaded: boolean;

  setFriends: (friends: FriendDTO[]) => void;
  setRequests: (incoming: FriendRequestDTO[], outgoing: FriendRequestDTO[]) => void;
  setSearchResults: (results: UserSearchResultDTO[]) => void;
  setBlocked: (blocked: BlockedUserDTO[]) => void;
  markLoaded: () => void;

  // Live + optimistic mutators.
  addIncoming: (req: FriendRequestDTO) => void;
  addOutgoing: (req: FriendRequestDTO) => void;
  removeRequest: (id: number) => void;
  addFriend: (friend: FriendDTO) => void;
  removeFriendByUserId: (userId: number) => void;
  // presence:update — a friend came online/offline.
  setFriendPresence: (userId: number, online: boolean) => void;
  // Block/unblock — moves a user between the friends and blocked lists.
  addBlocked: (user: BlockedUserDTO) => void;
  removeBlocked: (userId: number) => void;
  // friend:accepted — a request we sent was accepted; add the friend, drop the
  // matching outgoing request.
  resolveAccepted: (friend: FriendDTO) => void;
  reset: () => void;
}

function sortByBalance(a: FriendDTO, b: FriendDTO): number {
  return b.balance - a.balance;
}

export const useFriendsStore = create<FriendsState>()((set) => ({
  friends: [],
  incoming: [],
  outgoing: [],
  searchResults: [],
  blocked: [],
  loaded: false,

  setFriends: (friends) => set({ friends: [...friends].sort(sortByBalance) }),
  setRequests: (incoming, outgoing) => set({ incoming, outgoing }),
  setSearchResults: (searchResults) => set({ searchResults }),
  setBlocked: (blocked) => set({ blocked }),
  markLoaded: () => set({ loaded: true }),

  addIncoming: (req) =>
    set((s) => (s.incoming.some((r) => r.id === req.id) ? s : { incoming: [req, ...s.incoming] })),
  addOutgoing: (req) =>
    set((s) => (s.outgoing.some((r) => r.id === req.id) ? s : { outgoing: [req, ...s.outgoing] })),
  removeRequest: (id) =>
    set((s) => ({ incoming: s.incoming.filter((r) => r.id !== id), outgoing: s.outgoing.filter((r) => r.id !== id) })),
  addFriend: (friend) =>
    set((s) =>
      s.friends.some((f) => f.userId === friend.userId)
        ? s
        : { friends: [...s.friends, friend].sort(sortByBalance) },
    ),
  removeFriendByUserId: (userId) => set((s) => ({ friends: s.friends.filter((f) => f.userId !== userId) })),
  setFriendPresence: (userId, online) =>
    set((s) => {
      if (!s.friends.some((f) => f.userId === userId)) return s;
      return { friends: s.friends.map((f) => (f.userId === userId ? { ...f, online } : f)) };
    }),
  addBlocked: (user) =>
    set((s) =>
      s.blocked.some((b) => b.userId === user.userId)
        ? s
        : {
            blocked: [...s.blocked, user].sort((a, b) => a.username.localeCompare(b.username)),
            // A blocked user can no longer be a friend or have a pending request with us.
            friends: s.friends.filter((f) => f.userId !== user.userId),
            incoming: s.incoming.filter((r) => r.user.userId !== user.userId),
            outgoing: s.outgoing.filter((r) => r.user.userId !== user.userId),
          },
    ),
  removeBlocked: (userId) => set((s) => ({ blocked: s.blocked.filter((b) => b.userId !== userId) })),
  resolveAccepted: (friend) =>
    set((s) => ({
      friends: s.friends.some((f) => f.userId === friend.userId)
        ? s.friends
        : [...s.friends, friend].sort(sortByBalance),
      outgoing: s.outgoing.filter((r) => r.user.userId !== friend.userId),
    })),
  reset: () => set({ friends: [], incoming: [], outgoing: [], searchResults: [], blocked: [], loaded: false }),
}));
