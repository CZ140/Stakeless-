// Shared "game juice" — celebrations, count-ups, screen shake, and flashes.
// Every effect honors prefers-reduced-motion (reduce/skip decorative motion) and
// scales with how big a win is via `winTier`. Built on GSAP + canvas-confetti.

import gsap from 'gsap';
import confetti from 'canvas-confetti';
import { prefersReducedMotion } from '../hooks/useReducedMotion';
import { sound } from './sound';

export type WinTier = 'none' | 'small' | 'med' | 'big' | 'jackpot';

/** Single source of truth for "how big a deal is this win" (net profit vs stake). */
export function winTier(profit: number, bet: number): WinTier {
  if (profit <= 0) return 'none';
  const ratio = bet > 0 ? profit / bet : profit;
  if (ratio < 2) return 'small';
  if (ratio < 5) return 'med';
  if (ratio < 20) return 'big';
  return 'jackpot';
}

const GOLD = ['#D4A857', '#F6C24A', '#FFE9A8'];
const GREEN = ['#00E082', '#21D07A', '#8FD64F'];

/** Animate a numeric element from→to. Returns the tween (or null if instant). */
export function countUp(
  el: HTMLElement,
  from: number,
  to: number,
  opts: { duration?: number; format?: (v: number) => string } = {},
): gsap.core.Tween | null {
  const format = opts.format ?? ((v: number) => Math.round(v).toLocaleString());
  if (prefersReducedMotion()) {
    el.textContent = format(to);
    return null;
  }
  const obj = { v: from };
  return gsap.to(obj, {
    v: to,
    duration: opts.duration ?? 0.8,
    ease: 'power2.out',
    onUpdate: () => {
      el.textContent = format(obj.v);
    },
  });
}

/** Random eased jitter on an element. Skipped under reduced-motion. */
export function screenShake(el: HTMLElement | null, intensity = 8, dur = 0.4): void {
  if (!el || prefersReducedMotion()) return;
  gsap.to(el, {
    duration: 0.05,
    x: () => gsap.utils.random(-intensity, intensity),
    y: () => gsap.utils.random(-intensity, intensity),
    repeat: Math.round(dur / 0.05),
    repeatRefresh: true,
    ease: 'none',
    onComplete: () => {
      gsap.set(el, { x: 0, y: 0 });
    },
  });
}

/** Full-screen color flash (wins, bust). Skipped under reduced-motion. */
export function flash(color = '#ffffff', opacity = 0.3): void {
  if (prefersReducedMotion()) return;
  const div = document.createElement('div');
  Object.assign(div.style, {
    position: 'fixed',
    inset: '0',
    background: color,
    opacity: String(opacity),
    pointerEvents: 'none',
    zIndex: '9998',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(div);
  gsap.to(div, { opacity: 0, duration: 0.4, ease: 'power2.out', onComplete: () => div.remove() });
}

/** Pulse an element's glow/scale briefly (local win feedback). */
export function pulse(el: HTMLElement | null, color = '#00E082'): void {
  if (!el) return;
  if (prefersReducedMotion()) return;
  gsap.fromTo(
    el,
    { boxShadow: `0 0 0 0 ${color}00` },
    {
      boxShadow: `0 0 24px 4px ${color}`,
      scale: 1.04,
      duration: 0.18,
      yoyo: true,
      repeat: 1,
      ease: 'sine.inOut',
      clearProps: 'scale,boxShadow',
    },
  );
}

/** Button press/release micro-interaction (mechanical feel). */
export function pressFx(el: HTMLElement | null): void {
  if (!el) return;
  gsap.to(el, { scale: 0.94, duration: 0.08, ease: 'power2.in' });
}
export function releaseFx(el: HTMLElement | null): void {
  if (!el) return;
  gsap.to(el, { scale: 1, duration: 0.35, ease: 'back.out(2.5)' });
}

function confettiBurst(particleCount: number, colors: string[], origin?: { x: number; y: number }): void {
  void confetti({
    particleCount,
    spread: 70,
    startVelocity: 38,
    gravity: 0.9,
    ticks: 180,
    colors,
    origin: origin ?? { x: 0.5, y: 0.55 },
    disableForReducedMotion: true,
  });
}

/**
 * Celebrate a win, scaled to its tier. Fires confetti + shake (visual) and, unless
 * `silent`, the matching win stinger. Games with a bespoke stinger pass silent:true
 * and play their own sound. `originEl` aims the confetti at a specific element.
 */
export function celebrate(
  tier: WinTier,
  opts: { shakeEl?: HTMLElement | null; originEl?: HTMLElement | null; silent?: boolean } = {},
): void {
  if (tier === 'none') {
    if (!opts.silent) sound.lose();
    return;
  }

  let origin: { x: number; y: number } | undefined;
  if (opts.originEl) {
    const r = opts.originEl.getBoundingClientRect();
    origin = { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight };
  }

  if (!opts.silent) {
    if (tier === 'small') sound.winSmall();
    else if (tier === 'med') sound.winMed();
    else sound.winBig();
  }

  if (prefersReducedMotion()) return;

  switch (tier) {
    case 'small':
      confettiBurst(28, GREEN, origin);
      break;
    case 'med':
      confettiBurst(70, [...GREEN, ...GOLD], origin);
      screenShake(opts.shakeEl ?? null, 5, 0.25);
      break;
    case 'big':
      confettiBurst(120, GOLD, origin);
      window.setTimeout(() => confettiBurst(80, GREEN, origin), 180);
      screenShake(opts.shakeEl ?? null, 9, 0.4);
      flash('#D4A857', 0.18);
      break;
    case 'jackpot':
      confettiBurst(160, GOLD, origin);
      window.setTimeout(() => confettiBurst(120, [...GOLD, ...GREEN], { x: 0.3, y: 0.5 }), 150);
      window.setTimeout(() => confettiBurst(120, [...GOLD, ...GREEN], { x: 0.7, y: 0.5 }), 300);
      screenShake(opts.shakeEl ?? null, 14, 0.6);
      flash('#FFE9A8', 0.28);
      break;
  }
}
