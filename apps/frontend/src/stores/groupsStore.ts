import { create } from 'zustand';
import type {
  GroupSummaryDTO,
  GroupInviteDTO,
  GroupDetailDTO,
  GroupLeaderboardSnapshot,
  GroupLeaderboardMetric,
} from '@gambling/shared';

// Groups state: the list + incoming invites (kept live by group:invite), plus
// the currently-open group's detail and its live private leaderboard.
interface GroupsState {
  myGroups: GroupSummaryDTO[];
  invites: GroupInviteDTO[];
  current: GroupDetailDTO | null;
  leaderboard: GroupLeaderboardSnapshot | null;
  activeTab: GroupLeaderboardMetric;
  loaded: boolean;

  setMyGroups: (groups: GroupSummaryDTO[]) => void;
  setInvites: (invites: GroupInviteDTO[]) => void;
  addInvite: (invite: GroupInviteDTO) => void;
  removeInvite: (id: number) => void;
  setCurrent: (group: GroupDetailDTO | null) => void;
  setLeaderboard: (snapshot: GroupLeaderboardSnapshot | null) => void;
  setActiveTab: (tab: GroupLeaderboardMetric) => void;
  markLoaded: () => void;
  reset: () => void;
}

export const useGroupsStore = create<GroupsState>()((set) => ({
  myGroups: [],
  invites: [],
  current: null,
  leaderboard: null,
  activeTab: 'balance',
  loaded: false,

  setMyGroups: (myGroups) => set({ myGroups }),
  setInvites: (invites) => set({ invites }),
  addInvite: (invite) => set((s) => (s.invites.some((i) => i.id === invite.id) ? s : { invites: [invite, ...s.invites] })),
  removeInvite: (id) => set((s) => ({ invites: s.invites.filter((i) => i.id !== id) })),
  setCurrent: (current) => set({ current }),
  setLeaderboard: (leaderboard) => set({ leaderboard }),
  setActiveTab: (activeTab) => set({ activeTab }),
  markLoaded: () => set({ loaded: true }),
  reset: () => set({ myGroups: [], invites: [], current: null, leaderboard: null, activeTab: 'balance', loaded: false }),
}));
