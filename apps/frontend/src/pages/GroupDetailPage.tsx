import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from '../components/vault/AppShell';
import { Avatar } from '../components/vault/Avatar';
import { TierBadge } from '../components/vault/TierBadge';
import { RoleBadge } from '../components/vault/RoleBadge';
import {
  XIcon,
  PencilIcon,
  KebabIcon,
  TransferIcon,
  RefreshIcon,
  SearchIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from '../components/vault/icons';
import { apiClient } from '../api/client';
import { socket } from '../socket';
import { useAuth } from '../contexts/AuthContext';
import { useGroupsStore } from '../stores/groupsStore';
import { useFriendsStore } from '../stores/friendsStore';
import { roleCan, canKick } from '@gambling/shared';
import type {
  GroupDetailDTO,
  GroupLeaderboardSnapshot,
  GroupLeaderboardMetric,
  GroupLeaderboardRow,
  GroupMemberDTO,
  GroupRole,
} from '@gambling/shared';

const PODIUM_KIND = ['gold', 'silver', 'bronze'] as const;
const TABS: { key: GroupLeaderboardMetric; label: string }[] = [
  { key: 'balance', label: 'Balance' },
  { key: 'wagered', label: 'Wagered' },
  { key: 'profit', label: 'Profit' },
];

function fmt(metric: GroupLeaderboardMetric, value: number): string {
  const sign = metric === 'profit' && value > 0 ? '+' : '';
  return sign + value.toLocaleString();
}

export function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const groupId = Number(id);
  const navigate = useNavigate();
  const { username: myUsername } = useAuth();

  const current = useGroupsStore((s) => s.current);
  const leaderboard = useGroupsStore((s) => s.leaderboard);
  const activeTab = useGroupsStore((s) => s.activeTab);
  const setActiveTab = useGroupsStore((s) => s.setActiveTab);

  const [menuOpen, setMenuOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [transferring, setTransferring] = useState(false);

  function refetchDetail() {
    apiClient
      .get<{ group: GroupDetailDTO }>(`/groups/${groupId}`)
      .then((r) => useGroupsStore.getState().setCurrent(r.data.group))
      .catch(() => navigate('/groups'));
  }
  function refetchLeaderboard() {
    apiClient
      .get<GroupLeaderboardSnapshot>(`/groups/${groupId}/leaderboard`)
      .then((r) => useGroupsStore.getState().setLeaderboard(r.data))
      .catch(() => {});
  }

  // Load detail + leaderboard, subscribe to the live group room.
  useEffect(() => {
    if (!Number.isInteger(groupId)) {
      navigate('/groups');
      return;
    }
    useGroupsStore.getState().setCurrent(null);
    useGroupsStore.getState().setLeaderboard(null);
    refetchDetail();
    refetchLeaderboard();

    function onLeaderboard(data: { groupId: number; snapshot: GroupLeaderboardSnapshot }) {
      if (data.groupId === groupId) useGroupsStore.getState().setLeaderboard(data.snapshot);
    }
    socket.on('group:leaderboard', onLeaderboard);
    if (!socket.connected) socket.connect();
    socket.emit('group:subscribe', groupId);

    return () => {
      socket.emit('group:unsubscribe', groupId);
      socket.off('group:leaderboard', onLeaderboard);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  if (!current) {
    return (
      <AppShell>
        <div className="crumb"><Link to="/groups">HOME / GROUPS</Link></div>
        <div className="fg-search-hint">Loading group…</div>
      </AppShell>
    );
  }

  const myRole: GroupRole = current.myRole;
  const rows: GroupLeaderboardRow[] = leaderboard
    ? leaderboard[activeTab === 'balance' ? 'byBalance' : activeTab === 'wagered' ? 'byWagered' : 'byProfit']
    : [];
  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);
  const myRow = rows.find((r) => r.username === myUsername);

  async function doRename(name: string, description: string) {
    try {
      await apiClient.patch(`/groups/${groupId}`, { name: name.trim(), description: description.trim() || null });
      setRenaming(false);
      refetchDetail();
      toast.success('Group updated');
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } } };
      toast.error(ax.response?.data?.error ?? 'Could not update group');
    }
  }
  async function doTransfer(userId: number) {
    try {
      await apiClient.post(`/groups/${groupId}/transfer`, { userId });
      setTransferring(false);
      refetchDetail();
      toast.success('Ownership transferred');
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } } };
      toast.error(ax.response?.data?.error ?? 'Could not transfer ownership');
    }
  }
  async function doDelete() {
    if (!window.confirm(`Delete “${current!.name}”? This removes it for everyone.`)) return;
    try {
      await apiClient.delete(`/groups/${groupId}`);
      toast.success('Group deleted');
      navigate('/groups');
    } catch {
      toast.error('Could not delete group');
    }
  }
  async function doLeave() {
    const meId = current!.members.find((m) => m.username === myUsername)?.userId;
    if (meId === undefined) return;
    const ownerWarning = myRole === 'owner' ? ' Ownership passes to the longest-tenured member (or the group is deleted if you are the last member).' : '';
    if (!window.confirm(`Leave “${current!.name}”?${ownerWarning}`)) return;
    try {
      await apiClient.delete(`/groups/${groupId}/members/${meId}`);
      toast.success('Left the group');
      navigate('/groups');
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } } };
      toast.error(ax.response?.data?.error ?? 'Could not leave group');
    }
  }

  const memberCounts = countRoles(current.members);

  return (
    <AppShell>
      <div className="crumb">
        <Link to="/groups">HOME / GROUPS</Link>
        <span className="crumb-sep">/</span>
        <span style={{ color: 'var(--text-secondary)' }}>{current.name.toUpperCase()}</span>
      </div>

      <div className="fg-gd-hero">
        <div className="fg-gd-title-block">
          <div className="fg-gd-title-row">
            <h1 className="h-title">{current.name}</h1>
            {roleCan(myRole, 'rename') && (
              <button className="fg-icon-btn" title="Rename" onClick={() => setRenaming(true)}><PencilIcon size={13} /></button>
            )}
            <span className="live-badge">live</span>
          </div>
          <p className="h-subtitle">
            {current.description ? `${current.description} · ` : ''}
            {current.members.length} member{current.members.length === 1 ? '' : 's'} · created {new Date(current.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div className="fg-gd-actions">
          <button className="btn btn-ghost" style={{ padding: '8px 16px' }} onClick={doLeave}>Leave</button>
          {(roleCan(myRole, 'rename') || roleCan(myRole, 'transferOwner') || roleCan(myRole, 'deleteGroup')) && (
            <div className="fg-menu-wrap">
              <button className="fg-icon-btn" onClick={() => setMenuOpen((v) => !v)} title="Group controls"><KebabIcon size={16} /></button>
              {menuOpen && (
                <div className="fg-menu" onMouseLeave={() => setMenuOpen(false)}>
                  {roleCan(myRole, 'rename') && <button className="fg-menu-item" onClick={() => { setMenuOpen(false); setRenaming(true); }}><PencilIcon size={12} /> Rename group</button>}
                  {roleCan(myRole, 'transferOwner') && <button className="fg-menu-item" onClick={() => { setMenuOpen(false); setTransferring(true); }}><TransferIcon size={12} /> Transfer ownership…</button>}
                  {roleCan(myRole, 'deleteGroup') && (
                    <>
                      <div className="fg-menu-sep" />
                      <button className="fg-menu-item danger" onClick={() => { setMenuOpen(false); void doDelete(); }}><XIcon size={12} /> Delete group</button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          {roleCan(myRole, 'invite') && <button className="btn btn-primary" onClick={() => setInviting(true)}>+ Invite</button>}
        </div>
      </div>

      <div className="fg-gd-grid">
        {/* LEFT — leaderboard */}
        <section>
          <div className="fg-lb-head">
            <div>
              <div className="section-title">Private leaderboard</div>
              <div className="fg-mono fg-dim" style={{ marginTop: 6 }}>
                {myRow ? <>You're <span style={{ color: 'var(--accent)' }}>#{myRow.rank} of {rows.length}</span> by {activeTab}</> : 'Ranked among members'}
              </div>
            </div>
            <div className="fg-pill-tabs">
              {TABS.map((t) => (
                <button key={t.key} className={'fg-pill-tab' + (activeTab === t.key ? ' active' : '')} onClick={() => setActiveTab(t.key)}>{t.label}</button>
              ))}
            </div>
          </div>

          {top3.length > 0 && (
            <div className="podium" style={{ marginBottom: 14 }}>
              {top3.map((m, i) => {
                const kind = PODIUM_KIND[i]!;
                const isYou = m.username === myUsername;
                return (
                  <div key={m.userId} className={`podium-card ${kind}${isYou ? ' fg-podium-you' : ''}`}>
                    <div className="pos">#{i + 1} · {kind.toUpperCase()}</div>
                    <div className="ava">{m.username.charAt(0).toUpperCase()}</div>
                    <div className="pname">
                      {m.username}
                      <TierBadge level={m.tierLevel} size={12} />
                    </div>
                    <div className="amt">{fmt(activeTab, m[activeTab])}<small>V</small></div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="grp-lb-table">
            <div className="grp-lb-row grp-lb-head">
              <div>Rank</div>
              <div>Player</div>
              <div style={{ textAlign: 'right' }}>{TABS.find((t) => t.key === activeTab)!.label}</div>
              <div style={{ textAlign: 'right' }} className="grp-lb-wagered">Wagered</div>
              <div style={{ textAlign: 'right' }} className="grp-lb-profit">Profit</div>
            </div>
            {rest.length === 0 && top3.length === 0 ? (
              <div className="fg-picker-empty">No members yet.</div>
            ) : (
              rest.map((m) => {
                const isYou = m.username === myUsername;
                return (
                  <div key={m.userId} className={'grp-lb-row' + (isYou ? ' you' : '')}>
                    <div className="rk">{m.rank}</div>
                    <div className="grp-lb-player">
                      <Avatar username={m.username} avatarColor={m.avatarColor} avatarImage={m.avatarImage} className="fg-ava s30" />
                      <div>
                        <strong>{m.username}</strong>
                        <TierBadge level={m.tierLevel} size={11} />
                        {isYou && <span className="fg-you-tag" style={{ marginLeft: 8 }}>YOU</span>}
                        <small>@{m.username.toLowerCase()}</small>
                      </div>
                    </div>
                    <div className="grp-lb-num">{fmt(activeTab, m[activeTab])}</div>
                    <div className="grp-lb-num muted grp-lb-wagered">{m.wagered.toLocaleString()}</div>
                    <div className={'grp-lb-num grp-lb-profit ' + (m.profit >= 0 ? 'delta-up' : 'delta-down')}>{m.profit >= 0 ? '+' : ''}{m.profit.toLocaleString()}</div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* RIGHT — members + invite picker */}
        <aside className="fg-gd-aside">
          <div className="card fg-mem-card">
            <div className="fg-mem-head">
              <span className="section-title">Members · {current.members.length}</span>
              <span className="fg-mono fg-dim">{memberCounts}</span>
            </div>
            <div className="fg-mem-list">
              {current.members.map((m) => (
                <MemberRow
                  key={m.userId}
                  m={m}
                  myRole={myRole}
                  isYou={m.username === myUsername}
                  onChanged={() => { refetchDetail(); refetchLeaderboard(); }}
                  groupId={groupId}
                />
              ))}
            </div>
          </div>

          {roleCan(myRole, 'invite') && (
            <div className="card fg-picker-card">
              <div className="fg-picker-head">
                <div>
                  <span className="section-title">Invite from friends</span>
                  <div className="fg-mono fg-dim" style={{ marginTop: 4 }}>
                    pulls from your <Link className="fg-link" to="/friends">friends list</Link>, not global search
                  </div>
                </div>
              </div>
              <FriendPicker groupId={groupId} members={current.members} />
            </div>
          )}
        </aside>
      </div>

      {inviting && (
        <div className="fg-modal-shade" onClick={() => setInviting(false)}>
          <div className="fg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fg-modal-head">
              <div>
                <div className="section-title">Invite to {current.name}</div>
                <div className="h-subtitle" style={{ marginTop: 6, fontSize: 13 }}>
                  Only friends can be invited. <Link className="fg-link" to="/friends" onClick={() => setInviting(false)}>Add more friends →</Link>
                </div>
              </div>
              <button className="fg-icon-btn" onClick={() => setInviting(false)} aria-label="Close"><XIcon size={14} /></button>
            </div>
            <FriendPicker groupId={groupId} members={current.members} expanded />
          </div>
        </div>
      )}

      {renaming && <RenameModal initialName={current.name} initialDesc={current.description ?? ''} onClose={() => setRenaming(false)} onSave={doRename} />}
      {transferring && (
        <TransferModal members={current.members.filter((m) => m.role !== 'owner')} onClose={() => setTransferring(false)} onPick={doTransfer} />
      )}
    </AppShell>
  );
}

function countRoles(members: GroupMemberDTO[]): string {
  const n = { owner: 0, admin: 0, member: 0 } as Record<GroupRole, number>;
  for (const m of members) n[m.role] += 1;
  return `${n.owner} owner · ${n.admin} admin · ${n.member} member${n.member === 1 ? '' : 's'}`;
}

function MemberRow({
  m,
  myRole,
  isYou,
  groupId,
  onChanged,
}: {
  m: GroupMemberDTO;
  myRole: GroupRole;
  isYou: boolean;
  groupId: number;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const canPromote = m.role === 'member' && roleCan(myRole, 'promote');
  const canDemote = m.role === 'admin' && roleCan(myRole, 'demote');
  const canKickThis = canKick(myRole, m.role);
  const showKebab = !isYou && m.role !== 'owner' && (canPromote || canDemote || canKickThis);

  async function setRole(role: 'admin' | 'member') {
    setOpen(false);
    try {
      await apiClient.patch(`/groups/${groupId}/members/${m.userId}`, { role });
      onChanged();
    } catch {
      toast.error('Could not change role');
    }
  }
  async function kick() {
    setOpen(false);
    try {
      await apiClient.delete(`/groups/${groupId}/members/${m.userId}`);
      toast.success(`Removed ${m.username}`);
      onChanged();
    } catch {
      toast.error('Could not remove member');
    }
  }

  return (
    <div className={'fg-mem-row' + (isYou ? ' you' : '')}>
      <Avatar username={m.username} avatarColor={m.avatarColor} avatarImage={m.avatarImage} className="fg-ava s36" />
      <div className="fg-mem-meta">
        <div className="fg-mem-name">
          <Link className="fg-link" to={`/profile/${m.username}`}>{m.username}</Link>
          <TierBadge level={m.tierLevel} size={11} />
          {isYou && <span className="fg-you-tag">YOU</span>}
        </div>
        <div className="fg-mem-sub">
          <RoleBadge role={m.role} />
          <span className="fg-sep">·</span>
          <span className="fg-mono">joined {new Date(m.joinedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>
      </div>
      {showKebab ? (
        <div className="fg-menu-wrap">
          <button className="fg-icon-btn" onClick={() => setOpen((v) => !v)} aria-label="Member controls"><KebabIcon size={14} /></button>
          {open && (
            <div className="fg-menu" onMouseLeave={() => setOpen(false)}>
              {canPromote && <button className="fg-menu-item" onClick={() => setRole('admin')}><ArrowUpIcon size={11} /> Promote to admin</button>}
              {canDemote && <button className="fg-menu-item" onClick={() => setRole('member')}><ArrowDownIcon size={11} /> Demote to member</button>}
              {canKickThis && (
                <>
                  {(canPromote || canDemote) && <div className="fg-menu-sep" />}
                  <button className="fg-menu-item danger" onClick={kick}><XIcon size={11} /> Kick from group</button>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="fg-menu-spacer" aria-hidden="true" />
      )}
    </div>
  );
}

function FriendPicker({ groupId, members, expanded = false }: { groupId: number; members: GroupMemberDTO[]; expanded?: boolean }) {
  const friends = useFriendsStore((s) => s.friends);
  const [q, setQ] = useState('');
  const [invited, setInvited] = useState<Set<number>>(new Set());
  const memberIds = new Set(members.map((m) => m.userId));
  const filtered = friends.filter((f) => !q || f.username.toLowerCase().includes(q.toLowerCase()));

  async function invite(userId: number, username: string) {
    setInvited((s) => new Set(s).add(userId));
    try {
      await apiClient.post(`/groups/${groupId}/invites`, { username });
      toast.success(`Invited ${username}`);
    } catch (e) {
      setInvited((s) => {
        const n = new Set(s);
        n.delete(userId);
        return n;
      });
      const ax = e as { response?: { data?: { error?: string } } };
      toast.error(ax.response?.data?.error ?? 'Could not invite');
    }
  }

  return (
    <div className={'fg-picker' + (expanded ? ' expanded' : '')}>
      <div className="fg-search" style={{ marginBottom: 10 }}>
        <SearchIcon size={14} />
        <input className="fg-search-input" placeholder="Search your friends…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="fg-picker-list">
        {friends.length === 0 && <div className="fg-picker-empty">No friends yet — add some on the Friends page.</div>}
        {friends.length > 0 && filtered.length === 0 && <div className="fg-picker-empty">No friends match "<strong>{q}</strong>".</div>}
        {filtered.map((f) => {
          const inGroup = memberIds.has(f.userId);
          const wasInvited = invited.has(f.userId);
          return (
            <div className="fg-picker-row" key={f.userId}>
              <Avatar username={f.username} avatarColor={f.avatarColor} avatarImage={f.avatarImage} className="fg-ava s30" />
              <div className="fg-picker-meta">
                <div className="fg-picker-name">{f.username} <TierBadge level={f.tierLevel} size={9} /></div>
                <div className="fg-picker-sub fg-mono">{f.balance.toLocaleString()} 🪙</div>
              </div>
              {inGroup ? (
                <span className="tag fg-picker-tag">In group</span>
              ) : wasInvited ? (
                <span className="tag fg-picker-tag">⌛ Invited</span>
              ) : (
                <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => invite(f.userId, f.username)}>Invite</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RenameModal({ initialName, initialDesc, onClose, onSave }: { initialName: string; initialDesc: string; onClose: () => void; onSave: (name: string, desc: string) => void }) {
  const [name, setName] = useState(initialName);
  const [desc, setDesc] = useState(initialDesc);
  return (
    <div className="fg-modal-shade" onClick={onClose}>
      <div className="fg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fg-modal-head">
          <div className="section-title">Edit group</div>
          <button className="fg-icon-btn" onClick={onClose} aria-label="Close"><XIcon size={14} /></button>
        </div>
        <div>
          <label className="label">Group name</label>
          <input className="input" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Description</label>
          <input className="input" maxLength={140} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!name.trim()} onClick={() => onSave(name, desc)}>Save</button>
        </div>
      </div>
    </div>
  );
}

function TransferModal({ members, onClose, onPick }: { members: GroupMemberDTO[]; onClose: () => void; onPick: (userId: number) => void }) {
  return (
    <div className="fg-modal-shade" onClick={onClose}>
      <div className="fg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fg-modal-head">
          <div>
            <div className="section-title">Transfer ownership</div>
            <div className="h-subtitle" style={{ marginTop: 6, fontSize: 13 }}>You'll become an admin. This can't be undone by you.</div>
          </div>
          <button className="fg-icon-btn" onClick={onClose} aria-label="Close"><XIcon size={14} /></button>
        </div>
        <div className="fg-picker-list" style={{ maxHeight: 360 }}>
          {members.length === 0 && <div className="fg-picker-empty">No other members to transfer to.</div>}
          {members.map((m) => (
            <div className="fg-picker-row" key={m.userId}>
              <Avatar username={m.username} avatarColor={m.avatarColor} avatarImage={m.avatarImage} className="fg-ava s30" />
              <div className="fg-picker-meta">
                <div className="fg-picker-name">{m.username} <RoleBadge role={m.role} /></div>
              </div>
              <button className="btn btn-outline" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => onPick(m.userId)}>Make owner</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
