import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import gsap from 'gsap';
import { SLOT_SYMBOLS, type SlotSymbolId } from '@gambling/shared';
import { sound } from '../../lib/sound';
import { prefersReducedMotion } from '../../hooks/useReducedMotion';

// One spinning reel: an overflow-hidden window over a tall vertical strip that GSAP
// translates. The strip ends in the 3 server-decided result symbols, so the reel
// always travels with momentum, overshoots, and snaps to rest on the true outcome.
//
// CELL/GAP/STEP must stay in sync with the .slots-* CSS so the strip lands aligned.

const CELL = 84; // px, must match --slot-cell
const GAP = 8; // px, must match --slot-gap
const STEP = CELL + GAP;
const LEAD = 22; // random symbols scrolled past before the result
const TARGET_Y = -LEAD * STEP; // strip offset that shows the result rows in the window

const IDS: SlotSymbolId[] = SLOT_SYMBOLS.map((s) => s.id);
const randSym = (): SlotSymbolId => IDS[Math.floor(Math.random() * IDS.length)]!;
const randCells = (n: number): SlotSymbolId[] => Array.from({ length: n }, randSym);

const GLYPH: Record<SlotSymbolId, string> = {
  cherry: '🍒',
  lemon: '🍋',
  bell: '🔔',
  star: '⭐',
  seven: '7',
  diamond: '💎',
};
function Glyph({ id }: { id: SlotSymbolId }) {
  if (id === 'seven') return <span className="seven">7</span>;
  return <span>{GLYPH[id]}</span>;
}

export interface SpinOptions {
  /** Travel time in seconds (later reels get more → left-to-right stop cascade). */
  durationS: number;
  /** Pitch shift for the reel-stop thunk (per reel). */
  pitch?: number;
  /** Add an anticipation creep before the snap (near-miss tension). */
  suspense?: boolean;
  /** Fired when the reel comes to rest. */
  onStop?: () => void;
}

export interface SlotReelHandle {
  spin: (finals: SlotSymbolId[], opts: SpinOptions) => void;
  setStatic: (finals: SlotSymbolId[]) => void;
}

interface SlotReelProps {
  initial: SlotSymbolId[];
  /** Rows (0..2) on this reel that sit on a winning line — highlighted at rest. */
  winRows?: number[];
}

interface PendingSpin {
  finals: SlotSymbolId[];
  opts: SpinOptions;
}

export const SlotReel = forwardRef<SlotReelHandle, SlotReelProps>(function SlotReel(
  { initial, winRows = [] },
  ref,
) {
  const [strip, setStrip] = useState<SlotSymbolId[]>(() => [...randCells(LEAD), ...initial]);
  const stripElRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<PendingSpin | null>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const [token, setToken] = useState(0);

  // Rest position shows the result rows; set on mount and kept after each spin.
  useEffect(() => {
    if (stripElRef.current) gsap.set(stripElRef.current, { y: TARGET_Y });
    return () => {
      tlRef.current?.kill();
      if (stripElRef.current) gsap.killTweensOf(stripElRef.current);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    spin: (finals, opts) => {
      pendingRef.current = { finals, opts };
      setStrip([...randCells(LEAD), ...finals]);
      setToken((t) => t + 1); // run the timeline after the new cells commit
    },
    setStatic: (finals) => {
      pendingRef.current = null;
      setStrip([...randCells(LEAD), ...finals]);
      setToken((t) => t + 1);
    },
  }));

  // Runs after the strip's DOM has committed, so the result cells exist before we tween.
  useEffect(() => {
    if (token === 0) return;
    const el = stripElRef.current;
    if (!el) return;
    const req = pendingRef.current;

    tlRef.current?.kill();
    gsap.killTweensOf(el);

    // No active spin (setStatic / reduced-motion landing): just rest on the result.
    if (!req || prefersReducedMotion()) {
      gsap.set(el, { y: TARGET_Y });
      el.classList.remove('is-spinning');
      if (req) {
        sound.reelStop(req.opts.pitch);
        req.opts.onStop?.();
      }
      return;
    }

    const { opts } = req;
    el.classList.add('is-spinning');
    const tl = gsap.timeline();
    tlRef.current = tl;

    tl.set(el, { y: 0 })
      .to(el, { y: TARGET_Y * 0.12, duration: 0.14, ease: 'power2.in' }) // ramp up
      .to(el, { y: TARGET_Y + STEP * 0.6, duration: opts.durationS, ease: 'none' }); // steady travel

    if (opts.suspense) {
      tl.to(el, { y: TARGET_Y + STEP * 0.25, duration: 0.6, ease: 'power2.out' }); // tension creep
    }

    tl.to(el, {
      y: TARGET_Y - STEP * 0.4, // overshoot past the rest point
      duration: 0.24,
      ease: 'power2.out',
      onStart: () => el.classList.remove('is-spinning'),
    }).to(el, {
      y: TARGET_Y,
      duration: 0.46,
      ease: 'back.out(2.2)',
      onStart: () => {
        sound.reelStop(opts.pitch);
        opts.onStop?.();
      },
    });
  }, [token]);

  return (
    <div className="slots-reel-window">
      <div className="slots-strip" ref={stripElRef}>
        {strip.map((sym, i) => {
          const row = i - LEAD;
          const isWin = row >= 0 && winRows.includes(row);
          return (
            <div className={`slots-cell${isWin ? ' win' : ''}`} key={i}>
              <Glyph id={sym} />
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default SlotReel;
