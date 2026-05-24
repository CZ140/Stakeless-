import { useEffect, useRef, useState } from 'react';
import { crashMultiplierAt, crashTimeToReachMs } from '@gambling/shared';
import { AppShell } from '../components/vault/AppShell';
import { BetPanel } from '../components/vault/BetPanel';
import { useCrashStore } from '../stores/crashStore';
import { useBalanceStore } from '../stores/balanceStore';
import { useGameSounds } from '../hooks/useGameSounds';
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

// Curve chart in a 0–100 viewBox. Sampled from the shared multiplier curve so the
// shape matches the server's settlement exactly. x spans a rolling ≥5s window, y
// auto-zooms to keep the head in frame; both freeze when the round settles.
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
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const area = `${line} L${head[0].toFixed(2)} 100 L0 100 Z`;
  return (
    <svg className="crash-curve" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="crash-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#crash-fill)" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={head[0]} cy={head[1]} r="1.6" fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function CrashPage() {
  const {
    betAmount, autoEnabled, autoValue, isMuted, phase, lastResult, history,
    setBetAmount, setAutoEnabled, setAutoValue, toggleMute, startRunning, settle, resetToIdle,
  } = useCrashStore();
  const { playWin, playLoss } = useGameSounds(isMuted);
  const balance = useBalanceStore((s) => s.balance);
  const [error, setError] = useState<string | null>(null);
  const [mult, setMult] = useState(1.0);

  const anchorRef = useRef<{ elapsedMs: number; perf: number }>({ elapsedMs: 0, perf: 0 });
  const rafRef = useRef<number | null>(null);

  function stopLoop() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
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
    rafRef.current = requestAnimationFrame(tick);
  }

  function beginRound(sessionId: number, startedAt: number, serverNow: number) {
    anchorRef.current = { elapsedMs: Math.max(0, serverNow - startedAt), perf: performance.now() };
    setMult(crashMultiplierAt(anchorRef.current.elapsedMs));
    startRunning(sessionId);
    stopLoop();
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
    return () => stopLoop();
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
      playLoss();
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
      playWin();
    }
    socket.on('crash:bust', onBust);
    socket.on('crash:cashout', onCashout);
    return () => {
      socket.off('crash:bust', onBust);
      socket.off('crash:cashout', onCashout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playWin, playLoss]);

  async function handleStart() {
    const st = useCrashStore.getState();
    if (st.phase === 'running') return;
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
        playWin();
      } else {
        const cp = d.crashPoint ?? mult;
        setMult(cp);
        settle({ win: false, multiplier: cp, payout: 0, profit: -st.betAmount, auto: false });
        playLoss();
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
          <button className="icon-btn" onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'} style={{ fontSize: 14 }}>
            {isMuted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

      {error && <div className="notice loss" style={{ marginBottom: 16, textAlign: 'left' }}>{error}</div>}

      <div className="game-layout">
        <div className="game-stage">
          <div className="crash-stage">
            <div className={`crash-board ${phase}`}>
              <CrashCurve mult={mult} color={curveColor} />
              <div className="crash-readout">
                <div className="crash-mult" style={{ color: multColor }}>{mult.toFixed(2)}×</div>
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
