import type { GroupRole } from '@gambling/shared';

// Owner / Admin / Member pill used on group cards and member rows.
const CFG: Record<GroupRole, { label: string; icon: string }> = {
  owner: { label: 'OWNER', icon: '★' },
  admin: { label: 'ADMIN', icon: '◆' },
  member: { label: 'MEMBER', icon: '·' },
};

export function RoleBadge({ role }: { role: GroupRole }) {
  const cfg = CFG[role];
  return (
    <span className={`fg-role ${role}`}>
      {cfg.icon}
      <span>{cfg.label}</span>
    </span>
  );
}
