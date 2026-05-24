// Shared avatar: shows an uploaded image when present, otherwise a letter
// monogram tinted with the chosen colour (or a colour derived from the username
// so even un-customized avatars aren't all the same green). Reuses the existing
// avatar size/shape classes (.acc-ava, .avatar, .ava, .ava-sm) via `className`,
// overriding only the background — so it drops into every avatar slot.

// Curated palette offered in the editor; all read well on the dark theme.
export const AVATAR_PALETTE = [
  '#00E082', // emerald (brand)
  '#5aa9ff', // blue
  '#b06bff', // violet
  '#ff6b8a', // pink
  '#e8b54d', // gold
  '#f0894d', // orange
  '#5fd6c8', // teal
  '#9aa4b2', // slate
] as const;

// Deterministic fallback colour from the username (stable per user).
export function derivedAvatarColor(username: string): string {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]!;
}

// Dark or light monogram text depending on background luminance — keeps the
// initial legible on any chosen colour.
export function avatarTextColor(hex: string): string {
  const c = hex.replace('#', '');
  if (c.length < 6) return '#06140c';
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#06140c' : '#f2f4f7';
}

interface AvatarProps {
  username: string;
  avatarColor?: string | null;
  avatarImage?: string | null;
  /** Existing avatar class for size/shape (e.g. 'acc-ava', 'avatar', 'ava-sm'). */
  className?: string;
}

export function Avatar({ username, avatarColor, avatarImage, className = '' }: AvatarProps) {
  if (avatarImage) {
    return (
      <span className={(className + ' has-img').trim()}>
        <img className="avatar-photo" src={avatarImage} alt="" />
      </span>
    );
  }
  const bg = avatarColor ?? derivedAvatarColor(username);
  return (
    <span className={className} style={{ background: bg, color: avatarTextColor(bg) }}>
      {(username.charAt(0) || '?').toUpperCase()}
    </span>
  );
}
