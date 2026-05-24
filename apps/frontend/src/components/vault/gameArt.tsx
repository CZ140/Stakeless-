// Per-game banner artwork — geometric SVGs sized for the dashboard game tiles.
// Ported from the design handoff (GameArt in screens.jsx).
import type { ReactElement } from 'react';

const RouletteArt = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
    <circle cx="32" cy="32" r="26" fill="#0a1f15" stroke="#00E082" strokeWidth="1.5" />
    <circle cx="32" cy="32" r="20" fill="none" stroke="rgba(0,224,130,0.4)" strokeWidth="0.8" strokeDasharray="2 3" />
    <circle cx="32" cy="32" r="8" fill="#D4A857" />
    <text x="32" y="35" textAnchor="middle" fontFamily="Geist Mono" fontSize="9" fontWeight="700" fill="#2a1e08">17</text>
    <line x1="32" y1="6" x2="32" y2="14" stroke="#00E082" strokeWidth="1.5" />
    <line x1="32" y1="50" x2="32" y2="58" stroke="rgba(0,224,130,0.5)" strokeWidth="1.2" />
    <line x1="6" y1="32" x2="14" y2="32" stroke="rgba(0,224,130,0.5)" strokeWidth="1.2" />
    <line x1="50" y1="32" x2="58" y2="32" stroke="rgba(0,224,130,0.5)" strokeWidth="1.2" />
  </svg>
);

const PlinkoArt = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
    {([[32, 12], [22, 22], [42, 22], [12, 32], [32, 32], [52, 32], [18, 42], [32, 42], [46, 42]] as const).map(
      ([x, y], i) => <circle key={i} cx={x} cy={y} r="2.2" fill="#5B8DEF" />,
    )}
    <path d="M8 54 L56 54" stroke="#5B8DEF" strokeWidth="2" />
    <circle cx="32" cy="4" r="2.6" fill="#fff" />
    <path d="M32 4 Q34 24 36 42" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" strokeDasharray="1 2" fill="none" />
    <circle cx="36" cy="48" r="3" fill="#fff" />
  </svg>
);

const MinesArt = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
    {[0, 1, 2, 3].map((r) =>
      [0, 1, 2, 3].map((c) => (
        <rect
          key={`${r}-${c}`}
          x={8 + c * 12}
          y={8 + r * 12}
          width="10"
          height="10"
          rx="1.5"
          fill={r === 1 && c === 2 ? '#F0445A' : 'rgba(255,255,255,0.06)'}
          stroke={r === 1 && c === 2 ? '#F0445A' : 'rgba(255,255,255,0.18)'}
          strokeWidth="0.8"
        />
      )),
    )}
    <circle cx="44" cy="26" r="3" fill="#1a0a0d" />
    <path d="M46 23 L48 21 M44 22 L44 20" stroke="#F6B85D" strokeWidth="0.8" strokeLinecap="round" />
  </svg>
);

const BlackjackArt = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
    <rect x="14" y="14" width="22" height="32" rx="3" fill="#fff" transform="rotate(-12 25 30)" />
    <rect x="28" y="14" width="22" height="32" rx="3" fill="#fff" stroke="rgba(0,0,0,0.1)" transform="rotate(8 39 30)" />
    <text x="37" y="28" fontFamily="Georgia, serif" fontSize="14" fontWeight="600" fill="#0a0f15" transform="rotate(8 39 30)">A</text>
    <text x="42" y="40" fontFamily="serif" fontSize="11" fill="#0a0f15" transform="rotate(8 39 30)">♠</text>
    <text x="20" y="28" fontFamily="Georgia, serif" fontSize="14" fontWeight="600" fill="#C8364B" transform="rotate(-12 25 30)">K</text>
    <text x="25" y="40" fontFamily="serif" fontSize="11" fill="#C8364B" transform="rotate(-12 25 30)">♥</text>
  </svg>
);

const DiceArt = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
    {/* back die — showing 2 */}
    <g transform="rotate(10 42 24)">
      <rect x="30" y="12" width="24" height="24" rx="5" fill="#241a0c" stroke="#D4A857" strokeWidth="1.5" />
      <circle cx="37" cy="19" r="2.2" fill="#F5D68A" />
      <circle cx="47" cy="29" r="2.2" fill="#F5D68A" />
    </g>
    {/* front die — showing 5 */}
    <g transform="rotate(-8 23 39)">
      <rect x="10" y="26" width="26" height="26" rx="5" fill="#1a1208" stroke="#D4A857" strokeWidth="1.5" />
      <circle cx="17" cy="33" r="2.4" fill="#F5D68A" />
      <circle cx="29" cy="33" r="2.4" fill="#F5D68A" />
      <circle cx="23" cy="39" r="2.4" fill="#F5D68A" />
      <circle cx="17" cy="45" r="2.4" fill="#F5D68A" />
      <circle cx="29" cy="45" r="2.4" fill="#F5D68A" />
    </g>
  </svg>
);

const SlotsArt = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
    <rect x="8" y="12" width="48" height="36" rx="5" fill="#241a0c" stroke="#D4A857" strokeWidth="1.5" />
    {/* three reel windows */}
    {[14, 27, 40].map((x, i) => (
      <rect key={i} x={x} y="20" width="10" height="20" rx="2" fill="#1a1208" stroke="rgba(212,168,87,0.5)" strokeWidth="0.8" />
    ))}
    {/* a winning row of sevens */}
    <text x="19" y="33" textAnchor="middle" fontFamily="Geist Mono" fontSize="11" fontWeight="800" fill="#F5D68A">7</text>
    <text x="32" y="33" textAnchor="middle" fontFamily="Geist Mono" fontSize="11" fontWeight="800" fill="#F5D68A">7</text>
    <text x="45" y="33" textAnchor="middle" fontFamily="Geist Mono" fontSize="11" fontWeight="800" fill="#F5D68A">7</text>
    {/* lever */}
    <line x1="56" y1="22" x2="56" y2="32" stroke="#D4A857" strokeWidth="1.5" />
    <circle cx="56" cy="20" r="2.6" fill="#F0445A" />
  </svg>
);

export const gameArt: Record<string, () => ReactElement> = {
  roulette: RouletteArt,
  plinko: PlinkoArt,
  mines: MinesArt,
  blackjack: BlackjackArt,
  dice: DiceArt,
  slots: SlotsArt,
};
