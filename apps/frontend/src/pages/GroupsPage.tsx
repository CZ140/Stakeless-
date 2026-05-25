import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from '../components/vault/AppShell';
import { Avatar } from '../components/vault/Avatar';
import { RoleBadge } from '../components/vault/RoleBadge';
import { XIcon, ArrowRightIcon } from '../components/vault/icons';
import { apiClient } from '../api/client';
import { useGroupsStore } from '../stores/groupsStore';
import { SOCIAL_LIMITS } from '@gambling/shared';
import type { GroupSummaryDTO, GroupInviteDTO } from '@gambling/shared';

function fetchGroups(): void {
  apiClient.get<{ groups: GroupSummaryDTO[] }>('/groups').then((r) => useGroupsStore.getState().setMyGroups(r.data.groups)).catch(() => {});
  apiClient.get<{ invites: GroupInviteDTO[] }>('/groups/invites').then((r) => useGroupsStore.getState().setInvites(r.data.invites)).catch(() => {});
}

function CreateGroupForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await apiClient.post('/groups', { name: name.trim(), description: desc.trim() || undefined });
      toast.success(`Created “${name.trim()}”`);
      fetchGroups();
      onClose();
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } } };
      toast.error(ax.response?.data?.error ?? 'Could not create group');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fg-create card" style={{ padding: 20, marginBottom: 20 }}>
      <div className="fg-create-head">
        <span className="section-title">New group</span>
        <button className="fg-icon-btn" onClick={onClose} aria-label="Close"><XIcon size={14} /></button>
      </div>
      <div className="fg-create-grid">
        <div>
          <label className="label">Group name <span className="fg-dim">· max {SOCIAL_LIMITS.NAME_MAX}</span></label>
          <input className="input" maxLength={SOCIAL_LIMITS.NAME_MAX} placeholder="e.g. Inner Circle" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Description <span className="fg-dim">· optional, max {SOCIAL_LIMITS.DESCRIPTION_MAX}</span></label>
          <input className="input" maxLength={SOCIAL_LIMITS.DESCRIPTION_MAX} placeholder="One line about the group" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
      </div>
      <div className="fg-create-foot">
        <span className="fg-mono fg-dim">
          {name.length}/{SOCIAL_LIMITS.NAME_MAX} · {desc.length}/{SOCIAL_LIMITS.DESCRIPTION_MAX} — you'll be set as <span style={{ color: 'var(--gold)' }}>Owner</span>
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!name.trim() || saving} onClick={create}>Create group</button>
        </div>
      </div>
    </div>
  );
}

function GroupCard({ group }: { group: GroupSummaryDTO }) {
  return (
    <Link className="fg-group-card" to={`/groups/${group.id}`}>
      <div className="fg-group-card-top">
        <div className="fg-group-name">{group.name}</div>
        <RoleBadge role={group.myRole} />
      </div>
      <div className="fg-group-desc">{group.description || 'No description'}</div>
      <div className="fg-group-meta">
        <div className="fg-ava-stack">
          {group.avatars.slice(0, 4).map((a, i) => (
            <span key={a.username + i} className="fg-ava-stack-item" style={{ zIndex: 4 - i }}>
              <Avatar username={a.username} avatarColor={a.avatarColor} avatarImage={a.avatarImage} className="fg-ava s26" />
            </span>
          ))}
          {group.memberCount > 4 && <span className="fg-ava-stack-more">+{group.memberCount - 4}</span>}
        </div>
        <div className="fg-mono fg-dim">{group.memberCount} member{group.memberCount === 1 ? '' : 's'}</div>
      </div>
      <div className="fg-group-rank">
        {group.myRank != null ? (
          <>
            <span className="fg-rank-num">#{group.myRank}</span>
            <span className="fg-rank-text">of {group.memberCount} · <span style={{ color: 'var(--text-secondary)' }}>you</span></span>
          </>
        ) : (
          <span className="fg-rank-text">private leaderboard</span>
        )}
        <span className="fg-rank-arrow"><ArrowRightIcon size={14} /></span>
      </div>
    </Link>
  );
}

export function GroupsPage() {
  const navigate = useNavigate();
  const myGroups = useGroupsStore((s) => s.myGroups);
  const invites = useGroupsStore((s) => s.invites);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchGroups();
  }, []);

  async function acceptInvite(inv: GroupInviteDTO) {
    try {
      const res = await apiClient.post<{ group: { id: number } }>(`/groups/invites/${inv.id}/accept`);
      useGroupsStore.getState().removeInvite(inv.id);
      fetchGroups();
      toast.success(`Joined ${inv.group.name}`);
      navigate(`/groups/${res.data.group.id}`);
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } } };
      toast.error(ax.response?.data?.error ?? 'Could not accept invite');
    }
  }
  async function declineInvite(inv: GroupInviteDTO) {
    useGroupsStore.getState().removeInvite(inv.id);
    try {
      await apiClient.post(`/groups/invites/${inv.id}/decline`);
    } catch {
      toast.error('Could not decline invite');
    }
  }

  return (
    <AppShell>
      <div className="crumb"><span>HOME</span><span className="crumb-sep">/</span><span>GROUPS</span></div>
      <div className="welcome" style={{ marginBottom: 22 }}>
        <div>
          <h1 className="h-title">Groups</h1>
          <p className="h-subtitle">Private leaderboards with your circle · separate from the global rank</p>
        </div>
        <div>
          <button className="btn btn-primary" onClick={() => setCreating((v) => !v)}>+ Create group</button>
        </div>
      </div>

      {creating && <CreateGroupForm onClose={() => setCreating(false)} />}

      {invites.length > 0 && (
        <>
          <div className="fg-sub-head" style={{ marginTop: 10 }}>
            <span className="section-title">Invitations · {invites.length}</span>
          </div>
          <div className="fg-inv-grid">
            {invites.map((inv) => (
              <div className="fg-inv-card" key={inv.id}>
                <div className="fg-inv-eyebrow">GROUP INVITE</div>
                <div className="fg-inv-name">{inv.group.name}</div>
                <div className="fg-inv-from">
                  <Avatar username={inv.inviter.username} avatarColor={inv.inviter.avatarColor} avatarImage={inv.inviter.avatarImage} className="fg-ava s22" />
                  <span>invited by <strong>@{inv.inviter.username}</strong></span>
                  <span className="fg-sep">·</span>
                  <span className="fg-mono">{inv.group.memberCount} member{inv.group.memberCount === 1 ? '' : 's'}</span>
                </div>
                <div className="fg-inv-actions">
                  <button className="btn btn-primary" style={{ padding: '8px 18px', fontSize: 13 }} onClick={() => acceptInvite(inv)}>Accept</button>
                  <button className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }} onClick={() => declineInvite(inv)}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="fg-sub-head" style={{ marginTop: 26 }}>
        <span className="section-title">My groups · {myGroups.length}</span>
        {myGroups.length > 0 && <span className="fg-mono fg-dim">tap a card to open</span>}
      </div>

      {myGroups.length === 0 ? (
        <div className="fg-empty">
          <div className="fg-empty-mark">◇</div>
          <h4>No groups yet</h4>
          <p>Create one and invite your friends to see who's really winning.</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Create group</button>
        </div>
      ) : (
        <div className="fg-group-grid">
          {myGroups.map((g) => <GroupCard key={g.id} group={g} />)}
        </div>
      )}
    </AppShell>
  );
}
