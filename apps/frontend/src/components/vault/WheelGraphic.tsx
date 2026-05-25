// Shared roulette wheel artwork (pure SVG, no behaviour). Used decoratively on the
// auth screens (AuthWheel) and as the real, GSAP-spun wheel face on the Roulette
// game page (RouletteWheel). Geometry is centred at (800,800) in a -40..1640 viewBox
// with segment 0 at 12 o'clock running clockwise — matching the game's pocket-angle
// math so the ball still lands on the server-decided pocket.

import type { CSSProperties } from 'react';

const SEQUENCE = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
  10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function polar(cx: number, cy: number, angle: number, r: number) {
  return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
}

interface SvgProps {
  className?: string;
  style?: CSSProperties;
}

export function WheelFaceSvg({ className, style }: SvgProps) {
  const cx = 800, cy = 800;
  const rimOuter = 790;
  const pocketOuter = 720;
  const pocketInner = 550;
  const innerRing = 540;
  const hubOuter = 460;
  const hubInner = 90;
  const N = SEQUENCE.length;

  // 8-point star for the hub centre. Rotation-symmetric and echoes the 8 hub spokes.
  const starPath = (() => {
    const points = 8;
    const outerR = 50;
    const innerR = 20;
    let d = '';
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const { x, y } = polar(cx, cy, a, r);
      d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)} `;
    }
    return `${d}Z`;
  })();

  const segs = SEQUENCE.map((num, idx) => {
    const a1 = (idx / N) * Math.PI * 2 - Math.PI / 2;
    const a2 = ((idx + 1) / N) * Math.PI * 2 - Math.PI / 2;
    const mid = (a1 + a2) / 2;
    const numR = (pocketOuter + pocketInner) / 2;
    const nx = cx + Math.cos(mid) * numR;
    const ny = cy + Math.sin(mid) * numR;
    const numRot = (mid * 180) / Math.PI + 90;
    const color = num === 0 ? '#0e8a4d' : REDS.has(num) ? '#9a1f2e' : '#0a0d12';
    const p1 = polar(cx, cy, a1, pocketInner);
    const p2 = polar(cx, cy, a1, pocketOuter);
    const p3 = polar(cx, cy, a2, pocketOuter);
    const p4 = polar(cx, cy, a2, pocketInner);
    const d = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${pocketOuter} ${pocketOuter} 0 0 1 ${p3.x} ${p3.y} L ${p4.x} ${p4.y} A ${pocketInner} ${pocketInner} 0 0 0 ${p1.x} ${p1.y} Z`;
    return { num, color, d, nx, ny, numRot };
  });

  return (
    <svg className={className} style={style} viewBox="-40 -40 1680 1680" overflow="visible" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="aw-rim-outer" cx="50%" cy="50%" r="50%">
          <stop offset="86%" stopColor="#1a120a" />
          <stop offset="92%" stopColor="#3a2a14" />
          <stop offset="95%" stopColor="#d4a857" />
          <stop offset="97%" stopColor="#f5d68a" />
          <stop offset="99%" stopColor="#8b6a2f" />
          <stop offset="100%" stopColor="#1a1208" />
        </radialGradient>
        <radialGradient id="aw-rim-wood" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#2a1f12" />
          <stop offset="100%" stopColor="#10090a" />
        </radialGradient>
        <radialGradient id="aw-hub-gold" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#f5d68a" />
          <stop offset="50%" stopColor="#d4a857" />
          <stop offset="100%" stopColor="#7a5a25" />
        </radialGradient>
        <radialGradient id="aw-hub-dark" cx="35%" cy="25%" r="80%">
          <stop offset="0%" stopColor="#3a3340" />
          <stop offset="60%" stopColor="#161b23" />
          <stop offset="100%" stopColor="#06080c" />
        </radialGradient>
        <linearGradient id="aw-spoke" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(212,168,87,0)" />
          <stop offset="50%" stopColor="rgba(212,168,87,0.7)" />
          <stop offset="100%" stopColor="rgba(212,168,87,0)" />
        </linearGradient>
      </defs>

      <circle cx={cx} cy={cy} r={rimOuter + 30} fill="url(#aw-rim-outer)" />
      <circle cx={cx} cy={cy} r={rimOuter} fill="url(#aw-rim-wood)" />

      <g>{segs.map((s) => <path key={s.num} d={s.d} fill={s.color} />)}</g>

      <g stroke="#d4a857" strokeWidth="2" opacity="0.55">
        {Array.from({ length: N }).map((_, i) => {
          const a = (i / N) * Math.PI * 2 - Math.PI / 2;
          const p1 = polar(cx, cy, a, pocketInner);
          const p2 = polar(cx, cy, a, pocketOuter);
          return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />;
        })}
      </g>
      <circle cx={cx} cy={cy} r={pocketOuter} fill="none" stroke="#d4a857" strokeWidth="4" opacity="0.85" />
      <circle cx={cx} cy={cy} r={pocketOuter + 6} fill="none" stroke="#7a5a25" strokeWidth="1.5" opacity="0.7" />
      <circle cx={cx} cy={cy} r={pocketInner} fill="none" stroke="#d4a857" strokeWidth="4" opacity="0.85" />
      <circle cx={cx} cy={cy} r={pocketInner - 6} fill="none" stroke="#7a5a25" strokeWidth="1.5" opacity="0.7" />

      <g fontFamily="'Geist Mono', monospace" fontSize="42" fontWeight="700" fill="#F2F4F7" textAnchor="middle">
        {segs.map((s) => (
          <text key={s.num} x={s.nx} y={s.ny + 14} transform={`rotate(${s.numRot} ${s.nx} ${s.ny})`}>{s.num}</text>
        ))}
      </g>

      <circle cx={cx} cy={cy} r={innerRing} fill="#1a1208" />
      <circle cx={cx} cy={cy} r={innerRing - 4} fill="none" stroke="#d4a857" strokeWidth="2" opacity="0.4" />

      <circle cx={cx} cy={cy} r={hubOuter} fill="url(#aw-hub-dark)" />
      <circle cx={cx} cy={cy} r={hubOuter} fill="none" stroke="#d4a857" strokeWidth="3" opacity="0.55" />
      <circle cx={cx} cy={cy} r={hubOuter - 14} fill="none" stroke="rgba(212,168,87,0.18)" strokeWidth="1" />

      <g>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
          const a = (deg * Math.PI) / 180;
          const p1 = polar(cx, cy, a, hubInner + 20);
          const p2 = polar(cx, cy, a, hubOuter - 8);
          return <line key={deg} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="url(#aw-spoke)" strokeWidth="6" strokeLinecap="round" />;
        })}
      </g>

      <circle cx={cx} cy={cy} r={hubInner + 10} fill="#06080c" />
      <circle cx={cx} cy={cy} r={hubInner + 4} fill="url(#aw-hub-gold)" />
      <circle cx={cx} cy={cy} r={hubInner - 6} fill="#0a0d12" />
      <path d={starPath} fill="#d4a857" />
      <circle cx={cx} cy={cy} r={pocketOuter + 30} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="40" />
    </svg>
  );
}

export function WheelShineSvg({ className, style }: SvgProps) {
  return (
    <svg className={className} style={style} viewBox="-40 -40 1680 1680" overflow="visible" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="aw-shine-hi" cx="22%" cy="18%" r="55%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
          <stop offset="35%" stopColor="rgba(255,255,255,0.05)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <radialGradient id="aw-shine-lo" cx="78%" cy="85%" r="60%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.55)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        <radialGradient id="aw-rim-light" cx="50%" cy="50%" r="50%">
          <stop offset="92%" stopColor="rgba(255,255,255,0)" />
          <stop offset="96%" stopColor="rgba(255,255,255,0.08)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <clipPath id="aw-disc-clip">
          <circle cx="800" cy="800" r="820" />
        </clipPath>
      </defs>
      <g clipPath="url(#aw-disc-clip)">
        <rect x="-40" y="-40" width="1680" height="1680" fill="url(#aw-shine-hi)" />
        <rect x="-40" y="-40" width="1680" height="1680" fill="url(#aw-shine-lo)" />
      </g>
      <rect x="-40" y="-40" width="1680" height="1680" fill="url(#aw-rim-light)" />
    </svg>
  );
}
