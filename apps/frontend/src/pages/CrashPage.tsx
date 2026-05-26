import { useShallow } from 'zustand/react/shallow';
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { crashMultiplierAt, crashTimeToReachMs } from '@gambling/shared';
import { AppShell } from '../components/vault/AppShell';
import { BetPanel } from '../components/vault/BetPanel';
import { useCrashStore } from '../stores/crashStore';
import { useBalanceStore } from '../stores/balanceStore';
import { useAudioStore } from '../stores/audioStore';
import { sound, type SoundHandle } from '../lib/sound';
import { celebrate, flash, screenShake, winTier } from '../lib/juice';
import { prefersReducedMotion } from '../hooks/useReducedMotion';
import { apiClient } from '../api/client';
import { socket } from '../socket';

interface StartResponse {
  sessionId: number;
  startedAt: number;
  autoCashout: number | null;
  serverNow: number;
  newBalance: number;
}
interface CashoutResponse {
  win: boolean;
  multiplier?: number;
  payout?: number;
  crashPoint?: number;
  newBalance?: number;
  alreadySettled?: boolean;
}
interface ActiveResponse {
  session: null | { sessionId: number; startedAt: number; autoCashout: number | null; serverNow: number };
}

// Build a smooth path through points via a Catmull-Rom spline converted to cubic
// béziers, so the curve reads as one fluid line instead of faceted segments.
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0]![0]} ${pts[0]![1]}` : '';
  let d = `M${pts[0]![0].toFixed(2)} ${pts[0]![1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

// Curve chart in a 0–100 viewBox. Sampled from the shared multiplier curve so the
// shape matches the server's settlement exactly. x spans a rolling ≥5s window, y
// auto-zooms to keep the head in frame (camera follow); both freeze on settle.
function CrashCurve({ mult, color }: { mult: number; color: string }) {
  const tEnd = crashTimeToReachMs(mult);
  const xMax = Math.max(tEnd, 5000);
  const yMax = Math.max(mult * 1.1, 2);
  const N = 56;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * tEnd;
    const m = crashMultiplierAt(t);
    const x = (t / xMax) * 100;
    const y = 100 - ((m - 1) / (yMax - 1)) * 100;
    pts.push([x, y]);
  }
  const head = pts[pts.length - 1]!;
  const line = smoothPath(pts);
  const area = `${line} L${head[0].toFixed(2)} 100 L0 100 Z`;
  return (
    <svg className="crash-curve" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="crash-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <filter id="crash-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.1" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path d={area} fill="url(#crash-fill)" />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        filter="url(#crash-glow)"
      />
      {/* Glowing, pulsing head */}
      <circle className="crash-head-halo" cx={head[0]} cy={head[1]} r="3.4" fill={color} opacity="0.3" />
      <circle cx={head[0]} cy={head[1]} r="1.7" fill={color} vectorEffect="non-scaling-stroke" filter="url(#crash-glow)" />
    </svg>
  );
}

export function CrashPage() {
  const {
    betAmount, autoEnabled, autoValue, phase, lastResult, history,
    setBetAmount, setAutoEnabled, setAutoValue, startRunning, settle, resetToIdle,
  } = useCrashStore(useShallow((s) => ({ betAmount: s.betAmount, autoEnabled: s.autoEnabled, autoValue: s.autoValue, phase: s.phase, lastResult: s.lastResult, history: s.history, setBetAmount: s.setBetAmount, setAutoEnabled: s.setAutoEnabled, setAutoValue: s.setAutoValue, startRunning: s.startRunning, settle: s.settle, resetToIdle: s.resetToIdle })));
  const { muted, toggleMute } = useAudioStore();
  const balance = useBalanceStore((s) => s.balance);
  const [error, setError] = useState<string | null>(null);
  const [mult, setMult] = useState(1.0);

  const anchorRef = useRef<{ elapsedMs: number; perf: number }>({ elapsedMs: 0, perf: 0 });
  const rafRef = useRef<number | null>(null);
  const toneRef = useRef<SoundHandle | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const multRef = useRef<HTMLDivElement>(null);

  function stopLoop() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  function stopTone(fadeMs = 80) {
    toneRef.current?.stop(fadeMs);
    toneRef.current = null;
  }

  // Win flourish: green flash + multiplier pop + tiered confetti/shake (own ka-ching).
  function winFx(multiplier: number, profit: number) {
    stopTone(120);
    sound.cashout(multiplier);
    flash('#21D07A', 0.18);
    if (!prefersReducedMotion() && multRef.current) {
      gsap.fromTo(multRef.current, { scale: 1.3 }, { scale: 1, duration: 0.7, ease: 'elastic.out(1, 0.4)' });
    }
    celebrate(winTier(profit, betAmount), { shakeEl: boardRef.current, originEl: boardRef.current, silent: true });
  }

  // Bust: cut the tone, slam the explosion — shake + red flash.
  function bustFx() {
    stopTone(40);
    sound.bust();
    flash('#F0445A', 0.22);
    screenShake(boardRef.current, 12, 0.5);
  }

  function tick() {
    const st = useCrashStore.getState();
    if (st.phase !== 'running') return;
    const elapsed = anchorRef.current.elapsedMs + (performance.now() - anchorRef.current.perf);
    let m = crashMultiplierAt(elapsed);
    // Hold the visual at the auto target while we wait for the server's crash:cashout
    // confirmation, so the curve never overshoots a target that's about to fire.
    if (st.autoEnabled && m >= st.autoValue) m = st.autoValue;
    setMult(m);
    // Rising tension: pitch the tone up with the multiplier.
    toneRef.current?.setRate?.(Math.min(8, 1 + (m - 1) * 0.5));
    rafRef.current = requestAnimationFrame(tick);
  }

  function beginRound(sessionId: number, startedAt: number, serverNow: number) {
    anchorRef.current = { elapsedMs: Math.max(0, serverNow - startedAt), perf: performance.now() };
    setMult(crashMultiplierAt(anchorRef.current.elapsedMs));
    startRunning(sessionId);
    stopLoop();
    stopTone(0);
    toneRef.current = sound.crashTone();
    rafRef.current = requestAnimationFrame(tick);
  }

  // Resume an in-progress round on mount (refresh / navigation back).
  useEffect(() => {
    apiClient
      .get<ActiveResponse>('/games/crash/active-session')
      .then((res) => {
        const s = res.data.session;
        if (!s) return;
        if (s.autoCashout != null) useCrashStore.setState({ autoEnabled: true, autoValue: s.autoCashout });
        beginRound(s.sessionId, s.startedAt, s.serverNow);
      })
      .catch(() => {
        /* no active round */
      });
    return () => {
      stopLoop();
      stopTone(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Server-driven settlement: bust + auto-cash-out arrive over the socket.
  useEffect(() => {
    function onBust({ sessionId, crashPoint }: { sessionId: number; crashPoint: number }) {
      const st = useCrashStore.getState();
      if (st.phase !== 'running' || (st.sessionId !== null && st.sessionId !== sessionId)) return;
      stopLoop();
      setMult(crashPoint);
      settle({ win: false, multiplier: crashPoint, payout: 0, profit: -st.betAmount, auto: false });
      bustFx();
    }
    function onCashout({
      sessionId, multiplier, payout, newBalance, auto,
    }: { sessionId: number; multiplier: number; payout: number; newBalance?: number; auto?: boolean }) {
      const st = useCrashStore.getState();
      if (st.phase !== 'running' || (st.sessionId !== null && st.sessionId !== sessionId)) return;
      stopLoop();
      setMult(multiplier);
      if (typeof newBalance === 'number') useBalanceStore.getState().setBalance(newBalance);
      settle({ win: true, multiplier, payout, profit: payout - st.betAmount, auto: !!auto });
      winFx(multiplier, payout - st.betAmount);
    }
    socket.on('crash:bust', onBust);
    socket.on('crash:cashout', onCashout);
    return () => {
      socket.off('crash:bust', onBust);
      socket.off('crash:cashout', onCashout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStart() {
    const st = useCrashStore.getState();
    if (st.phase === 'running') return;
    sound.unlock();
    sound.bet();
    setError(null);
    resetToIdle();
    localStorage.setItem('lastBet_crash', String(st.betAmount));
    try {
      const res = await apiClient.post<StartResponse>('/games/crash/start', {
        betAmount: st.betAmount,
        autoCashout: st.autoEnabled ? st.autoValue : null,
      });
      const d = res.data;
      useBalanceStore.getState().setBalance(d.newBalance);
      beginRound(d.sessionId, d.startedAt, d.serverNow);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string; session?: ActiveResponse['session'] }; status?: number } };
      if (ax.response?.status === 402) setError('Insufficient funds.');
      else if (ax.response?.status === 409 && ax.response.data?.session) {
        const s = ax.response.data.session;
        beginRound(s.sessionId, s.startedAt, s.serverNow);
      } else if (ax.response?.status === 429) setError('Too fast — slow down.');
      else setError(ax.response?.data?.error ?? 'Something went wrong. Please try again.');
    }
  }

  async function handleCashout() {
    const st = useCrashStore.getState();
    if (st.phase !== 'running' || st.sessionId == null) return;
    try {
      const res = await apiClient.post<CashoutResponse>('/games/crash/cashout', { sessionId: st.sessionId });
      const d = res.data;
      if (useCrashStore.getState().phase !== 'running') return; // a socket event already settled it
      stopLoop();
      if (d.win) {
        const m = d.multiplier ?? mult;
        setMult(m);
        if (typeof d.newBalance === 'number') useBalanceStore.getState().setBalance(d.newBalance);
        settle({ win: true, multiplier: m, payout: d.payout ?? 0, profit: (d.payout ?? 0) - st.betAmount, auto: false });
        winFx(m, (d.payout ?? 0) - st.betAmount);
      } else {
        const cp = d.crashPoint ?? mult;
        setMult(cp);
        settle({ win: false, multiplier: cp, payout: 0, profit: -st.betAmount, auto: false });
        bustFx();
      }
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string }; status?: number } };
      setError(ax.response?.data?.error ?? 'Something went wrong.');
    }
  }

  const running = phase === 'running';
  const curveColor =
    phase === 'busted' ? 'var(--loss)' : phase === 'cashed' ? 'var(--win)' : 'var(--accent)';
  const multColor = running ? 'var(--text)' : curveColor;

  let caption: string | null = null;
  if (phase === 'cashed' && lastResult) {
    // Show the amount cashed out (gross return) — matches the Mines convention.
    caption = `CASHED OUT${lastResult.auto ? ' (AUTO)' : ''} · ${lastResult.payout.toLocaleString()}`;
  } else if (phase === 'busted') {
    caption = 'BUSTED';
  } else if (phase === 'idle') {
    caption = 'PLACE A BET';
  }

  let primaryLabel = 'Bet';
  let onPrimary: () => void = () => void handleStart();
  if (running) {
    primaryLabel = `Cash out · ${Math.floor(betAmount * mult).toLocaleString()}`;
    onPrimary = () => void handleCashout();
  }

  return (
    <AppShell>
      <div className="crumb">
        <span>HOME</span><span className="crumb-sep">/</span><span>GAMES</span>
        <span className="crumb-sep">/</span><span style={{ color: 'var(--text-secondary)' }}>CRASH</span>
      </div>
      <div className="game-page-head">
        <h1 className="h-title">Crash</h1>
        <div className="game-meta-spec">
          <span>RISE &amp; CASH OUT</span><span className="dot">·</span><span>97% RTP</span>
          <button className="icon-btn" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} style={{ fontSize: 14 }}>
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

      {error && <div className="notice loss" role="alert" style={{ marginBottom: 16, textAlign: 'left' }}>{error}</div>}

      <div className="game-layout">
        <div className="game-stage">
          <div className="crash-stage">
            <div className={`crash-board ${phase}`} ref={boardRef}>
              <CrashCurve mult={mult} color={curveColor} />
              <div className="crash-readout">
                <div className="crash-mult" ref={multRef} style={{ color: multColor }}>{mult.toFixed(2)}×</div>
                {caption && <div className="crash-caption" style={{ color: curveColor }}>{caption}</div>}
              </div>
            </div>

            <div className="crash-history">
              {history.length === 0 && <span className="crash-hist-empty">No rounds yet</span>}
              {history.map((h, i) => (
                <span key={i} className={`crash-chip ${h.win ? 'win' : 'loss'}`}>{h.value.toFixed(2)}×</span>
              ))}
            </div>
          </div>
        </div>

        <BetPanel
          amount={betAmount}
          onAmountChange={setBetAmount}
          balance={balance}
          amountLocked={running}
          multiplier={running ? mult.toFixed(2) : undefined}
          profitOnWin={running ? Math.floor(betAmount * mult) - betAmount : undefined}
          primaryLabel={primaryLabel}
          onPrimary={onPrimary}
        >
          <div>
            <label className="label">Auto cash-out</label>
            <div className="crash-auto">
              <button
                type="button"
                className={`crash-auto-toggle${autoEnabled ? ' on' : ''}`}
                onClick={() => setAutoEnabled(!autoEnabled)}
                disabled={running}
              >
                {autoEnabled ? 'ON' : 'OFF'}
              </button>
              <div className="amount-row" style={{ flex: 1 }}>
                <input
                  className="input"
                  data-mono
                  type="number"
                  min={1.01}
                  step={0.1}
                  value={autoValue}
                  disabled={!autoEnabled || running}
                  onChange={(e) => setAutoValue(+e.target.value || 1.01)}
                />
                <span className="coin-suffix">× CASH</span>
              </div>
            </div>
          </div>
        </BetPanel>
      </div>
    </AppShell>
  );
}

export default CrashPage;
