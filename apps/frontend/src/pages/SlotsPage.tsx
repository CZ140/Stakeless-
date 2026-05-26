import { useShallow } from 'zustand/react/shallow';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PAYLINES, SLOT_SYMBOLS, type SlotGrid, type SlotSymbolId } from '@gambling/shared';
import { AppShell } from '../components/vault/AppShell';
import { BetPanel } from '../components/vault/BetPanel';
import { SlotReel, type SlotReelHandle } from '../components/vault/SlotReel';
import { useSlotsStore } from '../stores/slotsStore';
import { useBalanceStore } from '../stores/balanceStore';
import { useAudioStore } from '../stores/audioStore';
import { sound, type SoundHandle } from '../lib/sound';
import { celebrate, countUp, winTier } from '../lib/juice';
import { prefersReducedMotion } from '../hooks/useReducedMotion';
import { apiClient } from '../api/client';

interface SlotsResponse {
  grid: SlotGrid;
  lines: { line: number; symbol: SlotSymbolId; count: 2 | 3; multiplier: number; payout: number }[];
  totalPayout: number;
  win: boolean;
  profit: number;
  newBalance: number;
}

const GLYPH: Record<SlotSymbolId, string> = {
  cherry: '🍒',
  lemon: '🍋',
  bell: '🔔',
  star: '⭐',
  seven: '7',
  diamond: '💎',
};

// A pleasant, non-winning arrangement shown before the first spin (column-major).
const INITIAL_GRID: SlotGrid = [
  ['cherry', 'seven', 'bell'],
  ['lemon', 'diamond', 'star'],
  ['star', 'bell', 'cherry'],
];

function Glyph({ id }: { id: SlotSymbolId }) {
  if (id === 'seven') return <span className="seven">7</span>;
  return <span>{GLYPH[id]}</span>;
}

export function SlotsPage() {
  const { betAmount, spinning, lastResult, setBetAmount, setSpinning, setLastResult } = useSlotsStore(useShallow((s) => ({ betAmount: s.betAmount, spinning: s.spinning, lastResult: s.lastResult, setBetAmount: s.setBetAmount, setSpinning: s.setSpinning, setLastResult: s.setLastResult })));
  const { muted, toggleMute } = useAudioStore();
  const balance = useBalanceStore((s) => s.balance);
  const [error, setError] = useState<string | null>(null);

  const r0 = useRef<SlotReelHandle>(null);
  const r1 = useRef<SlotReelHandle>(null);
  const r2 = useRef<SlotReelHandle>(null);
  const reelRefs = useMemo(() => [r0, r1, r2], []);
  const gridRef = useRef<HTMLDivElement>(null);
  const payoutRef = useRef<HTMLSpanElement>(null);
  const spinSoundRef = useRef<SoundHandle | null>(null);

  // Tear down a running whir if we leave mid-spin.
  useEffect(() => () => spinSoundRef.current?.stop(0), []);

  // Rows (0..2) per reel that sit on a winning line — only once the reels have stopped.
  const winRowsByReel = useMemo(() => {
    const rows: number[][] = [[], [], []];
    if (lastResult && !spinning) {
      for (const w of lastResult.lines) {
        const pl = PAYLINES.find((p) => p.id === w.line);
        pl?.cells.slice(0, w.count).forEach(([reel, row]) => rows[reel]!.push(row));
      }
    }
    return rows;
  }, [lastResult, spinning]);

  // Count up the payout once the win banner is on screen.
  useEffect(() => {
    if (!lastResult || spinning || !lastResult.win || !payoutRef.current) return;
    countUp(payoutRef.current, 0, lastResult.totalPayout);
  }, [lastResult, spinning]);

  async function handleSpin() {
    if (spinning) return;
    sound.unlock();
    setError(null);
    setSpinning(true);
    setLastResult(null);
    localStorage.setItem('lastBet_slots', String(betAmount));
    sound.bet();

    try {
      const res = await apiClient.post<SlotsResponse>('/games/slots/bet', { betAmount });
      const d = res.data;
      useBalanceStore.getState().setBalance(d.newBalance);
      const reduced = prefersReducedMotion();

      // Near-miss tension: reels 0 & 1 already share a symbol on some payline.
      const suspense =
        !reduced &&
        PAYLINES.some((pl) => d.grid[0]![pl.cells[0]![1]] === d.grid[1]![pl.cells[1]![1]]);

      spinSoundRef.current = sound.reelSpin();

      const reveal = () => {
        spinSoundRef.current?.stop();
        spinSoundRef.current = null;
        setLastResult({
          grid: d.grid,
          lines: d.lines,
          totalPayout: d.totalPayout,
          win: d.win,
          profit: d.profit,
        });
        setSpinning(false);
        if (d.win) {
          celebrate(winTier(d.profit, betAmount), { shakeEl: gridRef.current, originEl: gridRef.current });
        } else {
          celebrate('none');
        }
      };

      for (let i = 0; i < 3; i++) {
        const isLast = i === 2;
        reelRefs[i]!.current?.spin(d.grid[i]!, {
          durationS: reduced ? 0.04 : 0.7 + i * 0.32,
          pitch: 1 + i * 0.12,
          suspense: isLast && suspense,
          onStop: isLast ? reveal : undefined,
        });
      }
    } catch (err: unknown) {
      spinSoundRef.current?.stop(0);
      spinSoundRef.current = null;
      sound.error();
      const ax = err as { response?: { data?: { error?: string }; status?: number } };
      if (ax.response?.status === 402) setError('Insufficient funds.');
      else if (ax.response?.status === 429) setError('Too many spins too fast — slow down.');
      else setError(ax.response?.data?.error ?? 'Something went wrong. Please try again.');
      setSpinning(false);
    }
  }

  // Banner state.
  let bannerColor = 'var(--text-muted)';
  let netLine: string | null = null;
  if (lastResult && !spinning) {
    if (lastResult.win) {
      bannerColor = lastResult.profit > 0 ? 'var(--win)' : 'var(--gold)';
      netLine = `${lastResult.lines.length} line${lastResult.lines.length > 1 ? 's' : ''} · net ${lastResult.profit >= 0 ? '+' : ''}${lastResult.profit.toLocaleString()}`;
    } else {
      bannerColor = 'var(--loss)';
      netLine = `net ${lastResult.profit.toLocaleString()}`;
    }
  }

  return (
    <AppShell>
      <div className="crumb">
        <span>HOME</span>
        <span className="crumb-sep">/</span>
        <span>GAMES</span>
        <span className="crumb-sep">/</span>
        <span style={{ color: 'var(--text-secondary)' }}>SLOTS</span>
      </div>
      <div className="game-page-head">
        <h1 className="h-title">Slots</h1>
        <div className="game-meta-spec">
          <span>3×3 · 5 LINES</span>
          <span className="dot">·</span>
          <span>97% RTP</span>
          <button
            className="icon-btn"
            onClick={toggleMute}
            title={muted ? 'Unmute' : 'Mute'}
            style={{ fontSize: 14 }}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

      {error && (
        <div className="notice loss" style={{ marginBottom: 16, textAlign: 'left' }}>
          {error}
        </div>
      )}

      <div className="game-layout">
        <div className="game-stage">
          <div className="slots-stage">
            <div className="slots-banner" style={{ color: bannerColor }}>
              {spinning ? (
                'SPINNING…'
              ) : lastResult ? (
                lastResult.win ? (
                  <>
                    WON <span ref={payoutRef}>{lastResult.totalPayout.toLocaleString()}</span>
                  </>
                ) : (
                  'NO WIN'
                )
              ) : (
                'SPIN TO PLAY'
              )}
              {netLine && <div className="slots-net">{netLine}</div>}
            </div>

            <div className="slots-grid" ref={gridRef}>
              {reelRefs.map((reelRef, i) => (
                <SlotReel key={i} ref={reelRef} initial={INITIAL_GRID[i]!} winRows={winRowsByReel[i]} />
              ))}
            </div>

            {/* Paytable — per-line multipliers; the bet is split across 5 lines. */}
            <div className="slots-paytable">
              {SLOT_SYMBOLS.map((s) => (
                <div className="pt" key={s.id} title={s.pay2 > 0 ? `Pair pays ${s.pay2}×` : '3-of-a-kind only'}>
                  <span className="g">
                    <Glyph id={s.id} />
                  </span>
                  <span className="m">{s.pay3}×</span>
                </div>
              ))}
            </div>
            <div className="slots-note">🍒 🍋 🔔 also pay on two from the left · multipliers are per line</div>
          </div>
        </div>

        <BetPanel
          amount={betAmount}
          onAmountChange={setBetAmount}
          balance={balance}
          amountLocked={spinning}
          summary={[
            { label: 'Paylines', value: '5' },
            { label: 'Max win', value: '500× bet' },
          ]}
          primaryLabel={spinning ? 'Spinning…' : 'Spin'}
          onPrimary={() => {
            void handleSpin();
          }}
          primaryDisabled={spinning}
        />
      </div>
    </AppShell>
  );
}

export default SlotsPage;
