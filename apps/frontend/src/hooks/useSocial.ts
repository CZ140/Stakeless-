import { useEffect } from 'react';
import { toast } from 'sonner';
import { socket } from '../socket';
import { apiClient } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useFriendsStore } from '../stores/friendsStore';
import { useGroupsStore } from '../stores/groupsStore';
import type { FriendDTO, FriendRequestDTO, GroupInviteDTO } from '@gambling/shared';

// Mounted once in AppShell. Seeds the friend-request / group-invite counts used
// by the sidebar badges on app load, and keeps them live via socket events
// (friend:request / friend:accepted / group:invite) with a toast for each.
// The socket itself is connected/disconnected by AuthContext.
export function useSocial(): void {
  const { accessToken } = useAuth();

  useEffect(() => {
    if (!accessToken) {
      useFriendsStore.getState().reset();
      useGroupsStore.getState().reset();
      return;
    }

    // Initial population for the badges (the pages refetch their own detail).
    apiClient
      .get<{ friends: FriendDTO[] }>('/friends')
      .then((r) => useFriendsStore.getState().setFriends(r.data.friends))
      .catch(() => {});
    apiClient
      .get<{ incoming: FriendRequestDTO[]; outgoing: FriendRequestDTO[] }>('/friends/requests')
      .then((r) => {
        useFriendsStore.getState().setRequests(r.data.incoming, r.data.outgoing);
        useFriendsStore.getState().markLoaded();
      })
      .catch(() => {});
    apiClient
      .get<{ invites: GroupInviteDTO[] }>('/groups/invites')
      .then((r) => {
        useGroupsStore.getState().setInvites(r.data.invites);
        useGroupsStore.getState().markLoaded();
      })
      .catch(() => {});

    function onFriendRequest({ request }: { request: FriendRequestDTO }) {
      useFriendsStore.getState().addIncoming(request);
      toast(`${request.user.username} sent you a friend request`);
    }
    function onFriendAccepted({ friend }: { friend: FriendDTO }) {
      useFriendsStore.getState().resolveAccepted(friend);
      toast.success(`${friend.username} accepted your friend request`);
    }
    function onGroupInvite({ invite }: { invite: GroupInviteDTO }) {
      useGroupsStore.getState().addInvite(invite);
      toast(`${invite.inviter.username} invited you to ${invite.group.name}`);
    }

    socket.on('friend:request', onFriendRequest);
    socket.on('friend:accepted', onFriendAccepted);
    socket.on('group:invite', onGroupInvite);
    return () => {
      socket.off('friend:request', onFriendRequest);
      socket.off('friend:accepted', onFriendAccepted);
      socket.off('group:invite', onGroupInvite);
    };
  }, [accessToken]);
}
