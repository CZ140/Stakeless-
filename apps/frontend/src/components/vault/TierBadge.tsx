import { tierByLevel } from '@gambling/shared';

// Per-tier accent colours, tuned to read on the dark Vault theme. Indexed by
// tier level (0 Bronze … 5 Obsidian). The shared TIERS table owns names and
// thresholds; colour is a purely cosmetic frontend concern, so it lives here.
export const TIER_COLOR: readonly string[] = [
  '#c0814f', // Bronze
  '#b9c2cf', // Silver
  '#e8b54d', // Gold
  '#5fd6c8', // Platinum
  '#5aa9ff', // Diamond
  '#b06bff', // Obsidian
];

export function tierColor(level: number): string {
  return TIER_COLOR[Math.max(0, Math.min(TIER_COLOR.length - 1, level))]!;
}

// A small faceted-gem glyph, coloured per tier.
function GemGlyph({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M6 3h12l4 6-10 12L2 9z" opacity="0.95" />
      <path d="M6 3h12l4 6H2z" opacity="0.45" fill="#fff" />
    </svg>
  );
}

interface Props {
  level: number;
  /** Show the tier name beside the gem. */
  label?: boolean;
  size?: number;
  className?: string;
}

// Tier flair used across leaderboard rows, the balance chip and profile. Compact
// by default (just the coloured gem); pass `label` to include the tier name.
export function TierBadge({ level, label = false, size = 13, className }: Props) {
  const tier = tierByLevel(level);
  const color = tierColor(level);
  return (
    <span
      className={'tier-badge' + (className ? ' ' + className : '')}
      style={{ ['--tier-color' as string]: color }}
      title={`${tier.name} tier`}
    >
      <GemGlyph size={size} color={color} />
      {label && <span className="tier-badge-name">{tier.name}</span>}
    </span>
  );
}
