import { create } from 'zustand';
import type { FriendDTO, FriendRequestDTO, UserSearchResultDTO } from '@gambling/shared';

// Friends state shared by the Friends page, the sidebar request-count badge, and
// the group friend-picker. Populated on app load (useSocial) and kept live by
// socket events (friend:request / friend:accepted).
interface FriendsState {
  friends: FriendDTO[];
  incoming: FriendRequestDTO[];
  outgoing: FriendRequestDTO[];
  searchResults: UserSearchResultDTO[];
  loaded: boolean;

  setFriends: (friends: FriendDTO[]) => void;
  setRequests: (incoming: FriendRequestDTO[], outgoing: FriendRequestDTO[]) => void;
  setSearchResults: (results: UserSearchResultDTO[]) => void;
  markLoaded: () => void;

  // Live + optimistic mutators.
  addIncoming: (req: FriendRequestDTO) => void;
  addOutgoing: (req: FriendRequestDTO) => void;
  removeRequest: (id: number) => void;
  addFriend: (friend: FriendDTO) => void;
  removeFriendByUserId: (userId: number) => void;
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
  loaded: false,

  setFriends: (friends) => set({ friends: [...friends].sort(sortByBalance) }),
  setRequests: (incoming, outgoing) => set({ incoming, outgoing }),
  setSearchResults: (searchResults) => set({ searchResults }),
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
  resolveAccepted: (friend) =>
    set((s) => ({
      friends: s.friends.some((f) => f.userId === friend.userId)
        ? s.friends
        : [...s.friends, friend].sort(sortByBalance),
      outgoing: s.outgoing.filter((r) => r.user.userId !== friend.userId),
    })),
  reset: () => set({ friends: [], incoming: [], outgoing: [], searchResults: [], loaded: false }),
}));
