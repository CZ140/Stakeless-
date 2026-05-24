// Inline SVG icon set — geometric, custom-drawn for the "Vault" design system.
// Ported from the design handoff (icons.jsx) to typed React components.
// Stroke icons use currentColor + 1.6 strokeWidth so they inherit text color.
import type { ReactElement } from 'react';

interface IconProps {
  size?: number;
}
interface ColorIconProps extends IconProps {
  color?: string;
}

const stroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const DashboardIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <rect x="3" y="3" width="8" height="10" rx="1.5" />
    <rect x="13" y="3" width="8" height="6" rx="1.5" />
    <rect x="3" y="15" width="8" height="6" rx="1.5" />
    <rect x="13" y="11" width="8" height="10" rx="1.5" />
  </svg>
);

export const RouletteIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3.2" />
    <line x1="12" y1="3" x2="12" y2="8.8" />
    <line x1="12" y1="15.2" x2="12" y2="21" />
    <line x1="3" y1="12" x2="8.8" y2="12" />
    <line x1="15.2" y1="12" x2="21" y2="12" />
  </svg>
);

export const DiceIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="9" cy="15" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="15" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const SlotsIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <line x1="9" y1="5" x2="9" y2="19" />
    <line x1="15" y1="5" x2="15" y2="19" />
    <circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const PlinkoIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="5" r="1" />
    <circle cx="8" cy="10" r="1" />
    <circle cx="16" cy="10" r="1" />
    <circle cx="6" cy="15" r="1" />
    <circle cx="12" cy="15" r="1" />
    <circle cx="18" cy="15" r="1" />
    <path d="M4 20 L20 20" />
  </svg>
);

export const MinesIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="13" r="6" />
    <path d="M12 7 L12 4 M14 5 L17 3 M16 7 L19 6" />
    <circle cx="10" cy="11" r="0.6" fill="currentColor" />
  </svg>
);

export const BlackjackIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <rect x="5" y="7" width="11" height="14" rx="2" transform="rotate(-8 10.5 14)" />
    <rect x="8" y="4" width="11" height="14" rx="2" transform="rotate(8 13.5 11)" />
  </svg>
);

export const LeaderboardIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <rect x="3" y="13" width="4" height="8" rx="1" />
    <rect x="10" y="8" width="4" height="13" rx="1" />
    <rect x="17" y="3" width="4" height="18" rx="1" />
  </svg>
);

export const ProfileIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </svg>
);

export const SearchIcon = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21 L16 16" />
  </svg>
);

export const MenuIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

export const BellIcon = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10 21a2 2 0 0 0 4 0" />
  </svg>
);

export const ChatIcon = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <path d="M21 12a8 8 0 0 1-13 6L3 20l1.6-4.5A8 8 0 1 1 21 12z" />
  </svg>
);

export const LogoutIcon = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);

export const HelpIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <path d="M10 9a3 3 0 1 1 5 2.2c-1 .7-2 1.4-2 3" />
    <circle cx="13" cy="18" r="0.8" fill="currentColor" />
  </svg>
);

export const ZapIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M13 2 L4 14h6l-1 8 9-12h-6z" />
  </svg>
);

export const XIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
    <path d="M6 6 L18 18 M18 6 L6 18" />
  </svg>
);

export const ArrowUpIcon = ({ size = 12 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 14l5-5 5 5" />
  </svg>
);

export const ArrowDownIcon = ({ size = 12 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 10l5 5 5-5" />
  </svg>
);

export const CoinIcon = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <defs>
      <radialGradient id="vault-coin-grad" cx="35%" cy="30%">
        <stop offset="0%" stopColor="#FFE7A8" />
        <stop offset="60%" stopColor="#D4A857" />
        <stop offset="100%" stopColor="#9b7330" />
      </radialGradient>
    </defs>
    <circle cx="12" cy="12" r="10" fill="url(#vault-coin-grad)" />
    <circle cx="12" cy="12" r="7" fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" strokeDasharray="0.8 1.2" />
    <text x="12" y="16" textAnchor="middle" fontFamily="Geist Mono, monospace" fontSize="11" fontWeight="700" fill="#3a2810">S</text>
  </svg>
);

export const TrophyIcon = ({ size = 28, color = 'currentColor' }: ColorIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
    <path d="M5 5h2v3a2 2 0 0 1-2 0 2 2 0 0 1-2-2 1 1 0 0 1 1-1z M17 5h2a1 1 0 0 1 1 1 2 2 0 0 1-2 2 2 2 0 0 1-2 0v-3z" />
    <path d="M12 14v3" />
    <path d="M9 20h6" />
  </svg>
);

export const GemIcon = ({ size = 32 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M6 9 L12 3 L18 9 L12 21 Z" fill="#00E082" stroke="#00a560" strokeWidth="0.8" />
    <path d="M6 9 L18 9" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" />
    <path d="M12 3 L9 9 L12 21" stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" fill="none" />
    <path d="M12 3 L15 9" stroke="rgba(255,255,255,0.55)" strokeWidth="0.6" />
  </svg>
);

export const BombIcon = ({ size = 32 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="11" cy="14" r="7" fill="#1a1f28" stroke="#F0445A" strokeWidth="1.5" />
    <path d="M16 9 L18 6 L21 5 L20 8 L17 10" stroke="#F0445A" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <circle cx="9" cy="12" r="1.2" fill="#F0445A" opacity="0.7" />
    <circle cx="20" cy="4" r="1.6" fill="#F6B85D" />
  </svg>
);

// Map keyed by game id, for activity rows etc.
export const gameIcons: Record<string, (props: IconProps) => ReactElement> = {
  roulette: RouletteIcon,
  plinko: PlinkoIcon,
  mines: MinesIcon,
  blackjack: BlackjackIcon,
};
