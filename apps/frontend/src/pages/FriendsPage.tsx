import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from '../components/vault/AppShell';
import { Avatar } from '../components/vault/Avatar';
import { TierBadge } from '../components/vault/TierBadge';
import { SearchIcon, XIcon, CheckIcon } from '../components/vault/icons';
import { apiClient } from '../api/client';
import { useFriendsStore } from '../stores/friendsStore';
import type { FriendDTO, FriendRequestDTO, UserSearchResultDTO } from '@gambling/shared';

type TabKey = 'friends' | 'requests' | 'add';

function joinedLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function FriendsList() {
  const friends = useFriendsStore((s) => s.friends);
  const removeFriendByUserId = useFriendsStore((s) => s.removeFriendByUserId);

  async function remove(f: FriendDTO) {
    removeFriendByUserId(f.userId); // optimistic
    try {
      await apiClient.delete(`/friends/${f.userId}`);
    } catch {
      toast.error('Could not remove friend');
    }
  }

  if (friends.length === 0) {
    return (
      <div className="fg-empty">
        <div className="fg-empty-mark">◇</div>
        <h4>No friends yet</h4>
        <p>Add some to compare balances and build a group.</p>
      </div>
    );
  }
  return (
    <div className="fg-list">
      {friends.map((f) => (
        <div className="fg-row" key={f.userId}>
          <Avatar username={f.username} avatarColor={f.avatarColor} avatarImage={f.avatarImage} className="fg-ava s40" />
          <div className="fg-row-meta">
            <div className="fg-row-name">
              <Link className="fg-link" to={`/profile/${f.username}`}>{f.username}</Link>
              <TierBadge level={f.tierLevel} />
            </div>
            <div className="fg-row-sub">
              <span className="num">{f.balance.toLocaleString()}</span>
              <span className="fg-coin">🪙</span>
              <span className="fg-sep">·</span>
              <span>joined {joinedLabel(f.since)}</span>
            </div>
          </div>
          <div className="fg-row-actions">
            <button className="btn btn-outline" disabled style={{ padding: '7px 12px', fontSize: 12 }} title="Available when Poker launches">
              Invite to table<span className="fg-soon">Poker · soon</span>
            </button>
            <button className="btn btn-ghost" style={{ padding: '7px 14px', fontSize: 12 }} onClick={() => remove(f)}>Remove</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function RequestsTab() {
  const incoming = useFriendsStore((s) => s.incoming);
  const outgoing = useFriendsStore((s) => s.outgoing);

  async function accept(req: FriendRequestDTO) {
    try {
      const res = await apiClient.post<{ friend: FriendDTO }>(`/friends/requests/${req.id}/accept`);
      useFriendsStore.getState().removeRequest(req.id);
      useFriendsStore.getState().addFriend(res.data.friend);
      toast.success(`You and ${req.user.username} are now friends`);
    } catch {
      toast.error('Could not accept request');
    }
  }
  async function decline(req: FriendRequestDTO) {
    useFriendsStore.getState().removeRequest(req.id);
    try {
      await apiClient.post(`/friends/requests/${req.id}/decline`);
    } catch {
      toast.error('Could not decline request');
    }
  }
  async function cancel(req: FriendRequestDTO) {
    useFriendsStore.getState().removeRequest(req.id);
    try {
      await apiClient.delete(`/friends/requests/${req.id}`);
    } catch {
      toast.error('Could not cancel request');
    }
  }

  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <div className="fg-empty">
        <div className="fg-empty-mark">◇</div>
        <h4>No pending requests</h4>
        <p>Friend requests you send or receive will show up here.</p>
      </div>
    );
  }

  return (
    <div className="fg-stack">
      <div>
        <div className="fg-sub-head"><span className="section-title">Incoming · {incoming.length}</span></div>
        {incoming.length === 0 ? (
          <div className="fg-search-hint">Nothing incoming right now.</div>
        ) : (
          <div className="fg-list">
            {incoming.map((r) => (
              <div className="fg-row" key={r.id}>
                <Avatar username={r.user.username} avatarColor={r.user.avatarColor} avatarImage={r.user.avatarImage} className="fg-ava s40" />
                <div className="fg-row-meta">
                  <div className="fg-row-name"><Link className="fg-link" to={`/profile/${r.user.username}`}>{r.user.username}</Link></div>
                  <div className="fg-row-sub">wants to be friends</div>
                </div>
                <div className="fg-row-actions">
                  <button className="btn btn-primary" style={{ padding: '7px 16px', fontSize: 12 }} onClick={() => accept(r)}>Accept</button>
                  <button className="btn btn-ghost" style={{ padding: '7px 12px', fontSize: 12 }} onClick={() => decline(r)}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="fg-sub-head"><span className="section-title">Outgoing · {outgoing.length}</span></div>
        {outgoing.length === 0 ? (
          <div className="fg-search-hint">No outgoing requests.</div>
        ) : (
          <div className="fg-list">
            {outgoing.map((r) => (
              <div className="fg-row" key={r.id}>
                <Avatar username={r.user.username} avatarColor={r.user.avatarColor} avatarImage={r.user.avatarImage} className="fg-ava s40" />
                <div className="fg-row-meta">
                  <div className="fg-row-name">
                    <Link className="fg-link" to={`/profile/${r.user.username}`}>{r.user.username}</Link>
                    <span className="tag" style={{ marginLeft: 4 }}>Pending</span>
                  </div>
                  <div className="fg-row-sub">awaiting response</div>
                </div>
                <div className="fg-row-actions">
                  <button className="btn btn-ghost" style={{ padding: '7px 12px', fontSize: 12 }} onClick={() => cancel(r)}>Cancel</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AddFriendTab() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserSearchResultDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const term = q.trim();
    if (term.length === 0) {
      setResults([]);
      return;
    }
    debounce.current = setTimeout(() => {
      setLoading(true);
      apiClient
        .get<{ results: UserSearchResultDTO[] }>(`/friends/search`, { params: { q: term } })
        .then((r) => setResults(r.data.results))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q]);

  async function add(target: UserSearchResultDTO) {
    // Optimistically flip the tag to pending.
    setResults((rs) => rs.map((r) => (r.userId === target.userId ? { ...r, relationship: 'outgoing' } : r)));
    try {
      const res = await apiClient.post<
        | { status: 'requested'; request: FriendRequestDTO }
        | { status: 'accepted'; friend: FriendDTO }
      >('/friends/requests', { username: target.username });
      if (res.data.status === 'accepted') {
        useFriendsStore.getState().resolveAccepted(res.data.friend);
        setResults((rs) => rs.map((r) => (r.userId === target.userId ? { ...r, relationship: 'friends' } : r)));
        toast.success(`You and ${target.username} are now friends`);
      } else {
        useFriendsStore.getState().addOutgoing(res.data.request);
        toast.success(`Friend request sent to ${target.username}`);
      }
    } catch (e) {
      setResults((rs) => rs.map((r) => (r.userId === target.userId ? { ...r, relationship: 'none' } : r)));
      const ax = e as { response?: { data?: { error?: string } } };
      toast.error(ax.response?.data?.error ?? 'Could not send request');
    }
  }

  return (
    <div className="fg-add">
      <div className="fg-search">
        <SearchIcon size={16} />
        <input className="fg-search-input" placeholder="Search by username" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        {q && <button className="fg-search-clear" onClick={() => setQ('')} aria-label="Clear"><XIcon size={12} /></button>}
      </div>
      {q.trim().length > 0 && (
        <div className="fg-search-hint">
          <span className="fg-mono">{loading ? '…' : results.length} result{results.length === 1 ? '' : 's'}</span> matching "<strong>{q}</strong>" · usernames are case-insensitive
        </div>
      )}

      {results.length > 0 && (
        <div className="fg-list">
          {results.map((r) => (
            <div className="fg-row" key={r.userId}>
              <Avatar username={r.username} avatarColor={r.avatarColor} avatarImage={r.avatarImage} className="fg-ava s40" />
              <div className="fg-row-meta">
                <div className="fg-row-name"><Link className="fg-link" to={`/profile/${r.username}`}>{r.username}</Link></div>
                <div className="fg-row-sub">@{r.username.toLowerCase()}</div>
              </div>
              <div className="fg-row-actions">
                {r.relationship === 'none' && <button className="btn btn-primary" style={{ padding: '7px 18px', fontSize: 12 }} onClick={() => add(r)}>+ Add</button>}
                {r.relationship === 'outgoing' && <span className="tag">⌛ Pending</span>}
                {r.relationship === 'incoming' && <button className="btn btn-primary" style={{ padding: '7px 16px', fontSize: 12 }} onClick={() => add(r)}>Accept</button>}
                {r.relationship === 'friends' && <span className="tag accent"><CheckIcon size={11} /> Friends</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FriendsPage() {
  const [tab, setTab] = useState<TabKey>('friends');
  const friends = useFriendsStore((s) => s.friends);
  const incoming = useFriendsStore((s) => s.incoming);
  const outgoing = useFriendsStore((s) => s.outgoing);

  // Refresh from the server on mount (useSocial seeds it on app load, but a hard
  // navigation here should show fresh data).
  useEffect(() => {
    apiClient.get<{ friends: FriendDTO[] }>('/friends').then((r) => useFriendsStore.getState().setFriends(r.data.friends)).catch(() => {});
    apiClient
      .get<{ incoming: FriendRequestDTO[]; outgoing: FriendRequestDTO[] }>('/friends/requests')
      .then((r) => useFriendsStore.getState().setRequests(r.data.incoming, r.data.outgoing))
      .catch(() => {});
  }, []);

  const tabs: { id: TabKey; label: string; count?: number; badge?: boolean }[] = [
    { id: 'friends', label: 'Friends', count: friends.length },
    { id: 'requests', label: 'Requests', count: incoming.length, badge: incoming.length > 0 },
    { id: 'add', label: 'Add friend' },
  ];

  return (
    <AppShell>
      <div className="crumb"><span>HOME</span><span className="crumb-sep">/</span><span>FRIENDS</span></div>
      <div className="welcome" style={{ marginBottom: 22 }}>
        <div>
          <h1 className="h-title">Friends</h1>
          <p className="h-subtitle">Your people across Stakeless · build a group to compare balances</p>
        </div>
        <div className="welcome-meta">
          <div className="stat">FRIENDS<strong className="num">{friends.length}</strong></div>
          <div className="stat">REQUESTS<strong className="num pos">{incoming.length}</strong></div>
          <div className="stat">SENT<strong className="num">{outgoing.length}</strong></div>
        </div>
      </div>

      <div className="fg-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={'fg-tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
            {t.label}
            {t.count != null && <span className={'fg-tab-count' + (t.badge ? ' badge' : '')}>{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'friends' && <FriendsList />}
      {tab === 'requests' && <RequestsTab />}
      {tab === 'add' && <AddFriendTab />}
    </AppShell>
  );
}
