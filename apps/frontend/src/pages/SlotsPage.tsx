import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PAYLINES,
  SLOT_SYMBOLS,
  type SlotGrid,
  type SlotSymbolId,
  type SlotLineWin,
} from '@gambling/shared';
import { AppShell } from '../components/vault/AppShell';
import { BetPanel } from '../components/vault/BetPanel';
import { useSlotsStore } from '../stores/slotsStore';
import { useBalanceStore } from '../stores/balanceStore';
import { useGameSounds } from '../hooks/useGameSounds';
import { apiClient } from '../api/client';

interface SlotsResponse {
  grid: SlotGrid;
  lines: SlotLineWin[];
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

const IDS: SlotSymbolId[] = SLOT_SYMBOLS.map((s) => s.id);
const randSym = (): SlotSymbolId => IDS[Math.floor(Math.random() * IDS.length)]!;
const randReel = (): SlotSymbolId[] => [randSym(), randSym(), randSym()];

// A pleasant, non-winning arrangement shown before the first spin.
const INITIAL_GRID: SlotGrid = [
  ['cherry', 'seven', 'bell'],
  ['lemon', 'diamond', 'star'],
  ['star', 'bell', 'cherry'],
];

// Stagger (ms after the response) at which each reel locks to its final symbols.
const REEL_STOP = [260, 520, 820];

function Glyph({ id }: { id: SlotSymbolId }) {
  if (id === 'seven') return <span className="seven">7</span>;
  return <span>{GLYPH[id]}</span>;
}

export function SlotsPage() {
  const { betAmount, isMuted, spinning, lastResult, setBetAmount, toggleMute, setSpinning, setLastResult } =
    useSlotsStore();
  const { playWin, playLoss } = useGameSounds(isMuted);
  const balance = useBalanceStore((s) => s.balance);
  const [error, setError] = useState<string | null>(null);

  // Visible grid (scrambles during a spin), and which reels have locked.
  const [display, setDisplay] = useState<SlotGrid>(INITIAL_GRID);
  const [reelStopped, setReelStopped] = useState<boolean[]>([true, true, true]);

  const stoppedRef = useRef<boolean[]>([true, true, true]); // read by the scramble tick
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Tear down timers if we leave mid-spin.
  useEffect(
    () => () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      timeoutsRef.current.forEach(clearTimeout);
    },
    [],
  );

  // Cells that sit on a winning line (only the matched portion: 2 or 3 from left).
  const winningCells = useMemo(() => {
    const set = new Set<string>();
    if (lastResult && !spinning) {
      for (const w of lastResult.lines) {
        const pl = PAYLINES.find((p) => p.id === w.line);
        pl?.cells.slice(0, w.count).forEach(([reel, row]) => set.add(`${reel}-${row}`));
      }
    }
    return set;
  }, [lastResult, spinning]);

  function stopAllTimers() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }

  async function handleSpin() {
    if (spinning) return;
    setError(null);
    setSpinning(true);
    setLastResult(null);
    localStorage.setItem('lastBet_slots', String(betAmount));

    // Begin the visual scramble — the tick only randomises reels that haven't locked.
    stopAllTimers();
    stoppedRef.current = [false, false, false];
    setReelStopped([false, false, false]);
    intervalRef.current = setInterval(() => {
      setDisplay((prev) => prev.map((reel, i) => (stoppedRef.current[i] ? reel : randReel())));
    }, 70);

    try {
      const res = await apiClient.post<SlotsResponse>('/games/slots/bet', { betAmount });
      const d = res.data;
      useBalanceStore.getState().setBalance(d.newBalance);

      const lockReel = (i: number) => {
        stoppedRef.current[i] = true;
        setReelStopped((prev) => {
          const n = [...prev];
          n[i] = true;
          return n;
        });
        setDisplay((prev) => {
          const n = prev.map((r) => [...r]);
          n[i] = d.grid[i]!;
          return n;
        });
      };

      // Lock reels left → right, then reveal the outcome.
      REEL_STOP.forEach((ms, i) => {
        timeoutsRef.current.push(setTimeout(() => lockReel(i), ms));
      });
      timeoutsRef.current.push(
        setTimeout(() => {
          stopAllTimers();
          setLastResult({
            grid: d.grid,
            lines: d.lines,
            totalPayout: d.totalPayout,
            win: d.win,
            profit: d.profit,
          });
          setSpinning(false);
          if (d.win) playWin();
          else playLoss();
        }, REEL_STOP[REEL_STOP.length - 1]! + 140),
      );
    } catch (err: unknown) {
      stopAllTimers();
      stoppedRef.current = [true, true, true];
      setReelStopped([true, true, true]);
      const ax = err as { response?: { data?: { error?: string }; status?: number } };
      if (ax.response?.status === 402) setError('Insufficient funds.');
      else if (ax.response?.status === 429) setError('Too many spins too fast — slow down.');
      else setError(ax.response?.data?.error ?? 'Something went wrong. Please try again.');
      setSpinning(false);
    }
  }

  // Result banner: the amount returned (slot convention) plus the true net.
  let bannerText = 'SPIN TO PLAY';
  let bannerColor = 'var(--text-muted)';
  let netLine: string | null = null;
  if (spinning) {
    bannerText = 'SPINNING…';
  } else if (lastResult) {
    if (lastResult.win) {
      bannerText = `WON ${lastResult.totalPayout.toLocaleString()}`;
      bannerColor = lastResult.profit > 0 ? 'var(--win)' : 'var(--gold)';
      netLine = `${lastResult.lines.length} line${lastResult.lines.length > 1 ? 's' : ''} · net ${lastResult.profit >= 0 ? '+' : ''}${lastResult.profit.toLocaleString()}`;
    } else {
      bannerText = 'NO WIN';
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
            title={isMuted ? 'Unmute' : 'Mute'}
            style={{ fontSize: 14 }}
          >
            {isMuted ? '🔇' : '🔊'}
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
              {bannerText}
              {netLine && <div className="slots-net">{netLine}</div>}
            </div>

            <div className="slots-grid">
              {display.map((reel, r) => (
                <div className={`slots-reel${reelStopped[r] ? '' : ' spinning'}`} key={r}>
                  {reel.map((sym, row) => (
                    <div
                      key={row}
                      className={`slots-cell${reelStopped[r] ? '' : ' spinning'}${winningCells.has(`${r}-${row}`) ? ' win' : ''}`}
                    >
                      <Glyph id={sym} />
                    </div>
                  ))}
                </div>
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
