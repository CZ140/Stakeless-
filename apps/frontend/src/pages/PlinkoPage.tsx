import { useShallow } from 'zustand/react/shallow';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppShell } from '../components/vault/AppShell';
import { PlinkoBoard, type PlinkoBoardHandle } from '../components/vault/PlinkoBoard';
import { usePlinkoStore, type RiskLevel } from '../stores/plinkoStore';
import { useBalanceStore } from '../stores/balanceStore';
import { useGameSounds } from '../hooks/useGameSounds';
import { apiClient } from '../api/client';

const FRONTEND_MULTIPLIERS: Record<RiskLevel, Record<number, number[]>> = {
  low: {
    8: [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
    9: [5.6, 2.0, 1.6, 1.0, 0.7, 0.7, 1.0, 1.6, 2.0, 5.6],
    10: [8.9, 3.0, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 3.0, 8.9],
    11: [8.4, 3.0, 1.9, 1.3, 1.0, 0.7, 0.7, 1.0, 1.3, 1.9, 3.0, 8.4],
    12: [14, 4.3, 2, 1.6, 1.4, 0.72, 0.465, 0.72, 1.4, 1.6, 2, 4.3, 14],
    13: [8.8, 4.4, 3.3, 2.1, 1.3, 0.98, 0.548, 0.548, 0.98, 1.3, 2.1, 3.3, 4.4, 8.8],
    14: [8, 4.5, 2.1, 1.6, 1.5, 1.2, 0.79, 0.577, 0.79, 1.2, 1.5, 1.6, 2.1, 4.5, 8],
    15: [16, 8.7, 3.3, 2.2, 1.6, 1.2, 1.1, 0.533, 0.533, 1.1, 1.2, 1.6, 2.2, 3.3, 8.7, 16],
    16: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1.0, 0.5, 1.0, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  },
  medium: {
    8: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    9: [18, 4, 1.7, 0.9, 0.5, 0.5, 0.9, 1.7, 4, 18],
    10: [22, 5, 2.0, 1.4, 0.6, 0.4, 0.6, 1.4, 2.0, 5, 22],
    11: [24, 6, 3.0, 1.8, 0.7, 0.5, 0.5, 0.7, 1.8, 3.0, 6, 24],
    12: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    13: [43, 13, 6, 3, 1.3, 0.7, 0.4, 0.4, 0.7, 1.3, 3, 6, 13, 43],
    14: [57, 15, 6.9, 3.9, 1.9, 0.98, 0.49, 0.268, 0.49, 0.98, 1.9, 3.9, 6.9, 15, 57],
    15: [88, 18, 11, 5, 3, 1.3, 0.5, 0.3, 0.3, 0.5, 1.3, 3, 5, 11, 18, 88],
    16: [110, 41, 10, 5, 3, 1.5, 1.0, 0.5, 0.3, 0.5, 1.0, 1.5, 3, 5, 10, 41, 110],
  },
  high: {
    8: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
    9: [43, 7, 2.0, 0.6, 0.2, 0.2, 0.6, 2.0, 7, 43],
    10: [76, 10, 3.0, 0.9, 0.3, 0.2, 0.3, 0.9, 3.0, 10, 76],
    11: [120, 14, 5.2, 1.4, 0.4, 0.2, 0.2, 0.4, 1.4, 5.2, 14, 120],
    12: [170, 24, 8.1, 2.0, 0.7, 0.2, 0.2, 0.2, 0.7, 2.0, 8.1, 24, 170],
    13: [229, 33, 9.7, 3.5, 1.2, 0.35, 0.193, 0.193, 0.35, 1.2, 3.5, 9.7, 33, 229],
    14: [396, 53, 17, 4.7, 1.9, 0.47, 0.19, 0.175, 0.19, 0.47, 1.9, 4.7, 17, 53, 396],
    15: [620, 83, 27, 8, 3, 0.5, 0.2, 0.2, 0.2, 0.2, 0.5, 3, 8, 27, 83, 620],
    16: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
  expert: {
    8: [37, 4.8, 1.4, 0.14, 0.122, 0.14, 1.4, 4.8, 37],
    9: [55, 8.2, 2.2, 0.38, 0.107, 0.107, 0.38, 2.2, 8.2, 55],
    10: [90, 13, 3.6, 0.67, 0.13, 0.136, 0.13, 0.67, 3.6, 13, 90],
    11: [140, 21, 5.6, 1.4, 0.19, 0.089, 0.089, 0.19, 1.4, 5.6, 21, 140],
    12: [199, 32, 8, 2.4, 0.6, 0.08, 0.061, 0.08, 0.6, 2.4, 8, 32, 199],
    13: [329, 49, 12, 3.3, 1.2, 0.12, 0.115, 0.115, 0.12, 1.2, 3.3, 12, 49, 329],
    14: [379, 76, 19, 5.3, 1.9, 0.38, 0.08, 0.062, 0.08, 0.38, 1.9, 5.3, 19, 76, 379],
    15: [751, 113, 30, 7.5, 3, 0.75, 0.08, 0.072, 0.072, 0.08, 0.75, 3, 7.5, 30, 113, 751],
    16: [2083, 208, 42, 10, 4.2, 1.2, 0.21, 0.08, 0.141, 0.08, 0.21, 1.2, 4.2, 10, 42, 208, 2083],
  },
};

interface PlinkoResponse {
  bucket: number;
  multiplier: number;
  profit: number;
  newBalance: number;
}

interface ResultChip {
  id: number;
  mult: number;
  profit: number;
}

const RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high', 'expert'];
const RISK_LABELS: Record<RiskLevel, string> = { low: 'Low', medium: 'Medium', high: 'High', expert: 'Expert' };
const DROP_INTERVAL_MS = 170; // real spacing between drops (backend rejects <100ms apart)

function PlinkoHowToPlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="plinko-htplay-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 200 }}
          />
          <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 201, pointerEvents: 'none' }}>
            <motion.div
              key="plinko-htplay-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="card"
              style={{ padding: '32px', maxWidth: '520px', width: '90vw', maxHeight: '80vh', overflowY: 'auto', pointerEvents: 'auto' }}
            >
              <h2 style={{ marginTop: 0, marginBottom: '12px' }}>How to play Plinko</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>
                Drop balls from the top centre. Each bounces through the pegs with real physics and settles into a
                bucket, paying that bucket's multiplier on your bet. Drop as many as you like — they fall in parallel.
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>
                Higher risk and more rows push the edge multipliers up and the centre down. Auto mode drops a set number
                of balls for you.
              </p>
              <button className="btn btn-primary" onClick={onClose}>Got it</button>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

export function PlinkoPage() {
  const { betAmount, rows, riskLevel, isMuted, setBetAmount, setRows, setRiskLevel, toggleMute } = usePlinkoStore(useShallow((s) => ({ betAmount: s.betAmount, rows: s.rows, riskLevel: s.riskLevel, isMuted: s.isMuted, setBetAmount: s.setBetAmount, setRows: s.setRows, setRiskLevel: s.setRiskLevel, toggleMute: s.toggleMute })));
  const { playWin, playLoss } = useGameSounds(isMuted);
  const balance = useBalanceStore((s) => s.balance);

  const [showHowTo, setShowHowTo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [autoCount, setAutoCount] = useState(10);
  const [autoRunning, setAutoRunning] = useState(false);
  const [inFlight, setInFlight] = useState(0);
  const [results, setResults] = useState<ResultChip[]>([]);

  // On phones the recent-hits strip is cramped — show only the last few drops.
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 600px)');
    const onChange = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const visibleResults = results.slice(0, isNarrow ? 3 : 12);

  const boardRef = useRef<PlinkoBoardHandle>(null);
  const idRef = useRef(0);
  const queueRef = useRef(0); // drops still to fire
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const multipliers = FRONTEND_MULTIPLIERS[riskLevel][rows] ?? [];

  useEffect(() => () => { if (drainTimerRef.current) clearTimeout(drainTimerRef.current); }, []);

  // Fire one bet: server settles + pushes balance over the socket; the ball is
  // dropped into the board and its result recorded when it lands.
  async function fireDrop(): Promise<boolean> {
    localStorage.setItem('lastBet_plinko', String(betAmount));
    try {
      const res = await apiClient.post<PlinkoResponse>('/games/plinko/bet', { betAmount, rows, riskLevel });
      const { bucket, multiplier, profit, newBalance } = res.data;
      // Apply the server's authoritative balance immediately (response order is
      // monotonic). The socket also pushes this, but relying on it alone meant
      // Plinko stopped updating whenever the socket dropped/reconnected.
      useBalanceStore.getState().setBalance(newBalance);
      const id = ++idRef.current;
      setInFlight((n) => n + 1);
      boardRef.current?.drop(bucket, () => {
        setInFlight((n) => Math.max(0, n - 1));
        setResults((prev) => [{ id, mult: multiplier, profit }, ...prev].slice(0, 12));
        if (profit > 0) playWin();
        else playLoss();
      });
      return true;
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string }; status?: number } };
      if (ax.response?.status === 402) setError('Insufficient funds.');
      else if (ax.response?.status === 429) setError('Whoa — too many drops too fast. Give it a moment and try again.');
      else setError(ax.response?.data?.error ?? 'Something went wrong. Please try again.');
      return false;
    }
  }

  // Single drain loop fires one queued drop every DROP_INTERVAL_MS — guarantees
  // real spacing regardless of how fast the user clicks (no 429 bursts) and
  // drives both manual clicks and auto runs.
  function drainNext() {
    if (queueRef.current <= 0) {
      drainTimerRef.current = null;
      setAutoRunning(false);
      return;
    }
    queueRef.current -= 1;
    void fireDrop().then((ok) => {
      if (!ok) queueRef.current = 0; // stop the queue on error (e.g. insufficient funds)
    });
    drainTimerRef.current = setTimeout(drainNext, DROP_INTERVAL_MS);
  }

  function enqueueDrops(n: number) {
    setError(null);
    queueRef.current += n;
    if (!drainTimerRef.current) drainNext();
  }

  function manualDrop() {
    enqueueDrops(1);
  }

  function startAuto() {
    setAutoRunning(true);
    enqueueDrops(Math.max(1, Math.floor(autoCount)));
  }

  function stopAuto() {
    queueRef.current = 0;
    if (drainTimerRef.current) clearTimeout(drainTimerRef.current);
    drainTimerRef.current = null;
    setAutoRunning(false);
  }

  const canBet = balance !== null && balance >= betAmount;
  const setAmt = (n: number) => setBetAmount(Math.max(1, Math.floor(n)));

  return (
    <AppShell>
      <div className="crumb">
        <span>HOME</span><span className="crumb-sep">/</span><span>GAMES</span>
        <span className="crumb-sep">/</span><span style={{ color: 'var(--text-secondary)' }}>PLINKO</span>
      </div>
      <div className="game-page-head">
        <h1 className="h-title">Plinko</h1>
        <div className="game-meta-spec">
          <span>{rows} ROWS</span><span className="dot">·</span>
          <span style={{ textTransform: 'capitalize' }}>{riskLevel} risk</span>
          <button className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => setShowHowTo(true)}>How to play</button>
          <button className="icon-btn" onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'} style={{ fontSize: 14 }}>{isMuted ? '🔇' : '🔊'}</button>
        </div>
      </div>

      {error && <div className="notice loss" role="alert" style={{ marginBottom: 16, textAlign: 'left' }}>{error}</div>}

      <div className="game-layout">
        <div className="game-stage" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: 'linear-gradient(180deg, var(--bg-inset), #050810)' }}>
          <PlinkoBoard ref={boardRef} rows={rows} multipliers={multipliers} />
          <div className="history-strip" style={{ margin: 0, width: '100%', justifyContent: 'center', background: 'transparent', borderTop: 'none', minHeight: 34 }}>
            <span className="label">recent</span>
            {results.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>No drops yet</span>}
            {visibleResults.map((r) => (
              <span
                key={r.id}
                className="num"
                style={{
                  padding: '4px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                  background: 'var(--bg-elevated)',
                  color: r.profit > 0 ? 'var(--win)' : 'var(--text-muted)',
                  border: `1px solid ${r.profit > 0 ? 'rgba(33,208,122,0.4)' : 'var(--border)'}`,
                }}
              >
                {r.mult}×
              </span>
            ))}
          </div>
        </div>

        {/* Bet panel — custom for multi-ball + auto */}
        <div className="bet-panel">
          <div className="tabs-2">
            <button className={mode === 'manual' ? 'active' : ''} type="button" disabled={autoRunning} onClick={() => setMode('manual')}>Manual</button>
            <button className={mode === 'auto' ? 'active' : ''} type="button" disabled={autoRunning} onClick={() => setMode('auto')}>Auto</button>
          </div>
          <div className="body">
            <div>
              <label className="label">Bet amount</label>
              <div className="amount-row">
                <input className="input" data-mono type="number" min={1} value={betAmount} disabled={autoRunning}
                       onChange={(e) => setAmt(+e.target.value || 0)} />
                <span className="coin-suffix"><span className="dot" /> COINS</span>
              </div>
            </div>
            <div className="quick-bets">
              <button type="button" disabled={autoRunning} onClick={() => setAmt(betAmount / 2)}>½</button>
              <button type="button" disabled={autoRunning} onClick={() => setAmt(betAmount * 2)}>2×</button>
              <button type="button" disabled={autoRunning} onClick={() => setAmt(1)}>MIN</button>
              <button type="button" disabled={autoRunning} onClick={() => setAmt(balance ?? betAmount)}>MAX</button>
            </div>

            <div>
              <label className="label">Risk</label>
              <select className="select" value={riskLevel} disabled={autoRunning} onChange={(e) => setRiskLevel(e.target.value as RiskLevel)}>
                {RISK_LEVELS.map((r) => <option key={r} value={r}>{RISK_LABELS[r]}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Rows · {rows}{inFlight > 0 ? ' (locked while balls drop)' : ''}</label>
              <input type="range" min={8} max={16} step={1} value={rows}
                     disabled={autoRunning || inFlight > 0}
                     onChange={(e) => setRows(Number(e.target.value))}
                     style={{ width: '100%', accentColor: 'var(--accent)', cursor: autoRunning || inFlight > 0 ? 'not-allowed' : 'pointer' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10, marginTop: 2 }}>
                <span>8</span><span>16</span>
              </div>
            </div>

            {mode === 'auto' && (
              <div>
                <label className="label">Number of bets</label>
                <input className="input" data-mono type="number" min={1} max={500} value={autoCount} disabled={autoRunning}
                       onChange={(e) => setAutoCount(Math.max(1, Math.min(500, Math.floor(+e.target.value || 1))))} />
              </div>
            )}

            {mode === 'manual' ? (
              <button className="btn btn-primary place-bet" type="button" disabled={!canBet} onClick={manualDrop}>
                Drop ball{inFlight > 0 ? ` · ${inFlight} in play` : ''}
              </button>
            ) : autoRunning ? (
              <button className="btn btn-ghost place-bet" type="button" onClick={stopAuto}>Stop auto</button>
            ) : (
              <button className="btn btn-primary place-bet" type="button" disabled={!canBet} onClick={startAuto}>
                Start auto · {autoCount}
              </button>
            )}
          </div>
        </div>
      </div>

      <PlinkoHowToPlay open={showHowTo} onClose={() => setShowHowTo(false)} />
    </AppShell>
  );
}

export default PlinkoPage;
