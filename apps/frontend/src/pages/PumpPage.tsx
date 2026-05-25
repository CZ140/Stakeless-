import { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import {
  PUMP_DIFFICULTY_IDS,
  PUMP_DIFFICULTIES,
  pumpPopChance,
  pumpMultiplier,
  type PumpDifficulty,
} from '@gambling/shared';
import { AppShell } from '../components/vault/AppShell';
import { BetPanel } from '../components/vault/BetPanel';
import { usePumpStore } from '../stores/pumpStore';
import { useBalanceStore } from '../stores/balanceStore';
import { useAudioStore } from '../stores/audioStore';
import { sound } from '../lib/sound';
import { celebrate, winTier } from '../lib/juice';
import { prefersReducedMotion } from '../hooks/useReducedMotion';
import { apiClient } from '../api/client';

interface StartResponse { sessionId: number; difficulty: PumpDifficulty; pumps: number; multiplier: number; maxPumps: number; newBalance: number }
interface InflateResponse { popped: boolean; pumps: number; multiplier: number; maxedOut: boolean; newBalance?: number }
interface CashoutResponse { payout: number; newBalance: number; multiplier: number; pumps: number }
interface ActiveSessionResponse {
  session: null | { sessionId: number; difficulty: PumpDifficulty; pumps: number; multiplier: number; maxPumps: number; betAmount: number };
}

// The balloon grows from 1× scale (flat) to ~1.85× as it fills toward maxPumps.
function balloonScale(pumps: number, maxPumps: number): number {
  if (maxPumps <= 0) return 1;
  return 1 + (pumps / maxPumps) * 0.85;
}

function Balloon({ scale, popped }: { scale: number; popped: boolean }) {
  return (
    <svg viewBox="0 0 120 150" width="200" height="250" className={popped ? 'pump-balloon popped' : 'pump-balloon'}>
      <g style={{ transform: `scale(${scale})`, transformOrigin: '60px 64px', transition: 'none' }}>
        <ellipse cx="60" cy="60" rx="36" ry="42" fill="url(#pump-grad)" />
        <ellipse cx="46" cy="42" rx="8" ry="5" fill="rgba(255,255,255,0.45)" transform="rotate(-25 46 42)" />
        <path d="M54 100 L66 100 L60 110 Z" fill="#9a3a6e" />
      </g>
      {/* Knot string hangs below — unscaled so it stays pinned to the nozzle. */}
      <path d="M60 112 Q52 126 60 140" stroke="#9a3a6e" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <defs>
        <radialGradient id="pump-grad" cx="38%" cy="32%">
          <stop offset="0%" stopColor="#F6B8DC" />
          <stop offset="55%" stopColor="#E879B6" />
          <stop offset="100%" stopColor="#B23A7E" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function PumpPage() {
  const {
    betAmount, difficulty, phase, sessionId, pumps, multiplier, maxPumps, maxedOut, result,
    setBetAmount, setDifficulty, startRound, applyInflate, applyPop, applyCashout, restoreSession, reset,
  } = usePumpStore();
  const { muted, toggleMute } = useAudioStore();
  const balance = useBalanceStore((s) => s.balance);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const balloonWrapRef = useRef<HTMLDivElement>(null);

  // Resume an open round on mount (and after a 409).
  const resume = useCallback(async () => {
    try {
      const res = await apiClient.get<ActiveSessionResponse>('/games/pump/active-session');
      if (res.data.session) restoreSession(res.data.session);
    } catch {
      /* no active round */
    }
  }, [restoreSession]);

  useEffect(() => { void resume(); }, [resume]);

  // A little squash-and-stretch each time the balloon grows.
  useEffect(() => {
    if (phase !== 'active' || pumps === 0 || !balloonWrapRef.current) return;
    if (prefersReducedMotion()) return;
    gsap.fromTo(balloonWrapRef.current, { scale: 0.94 }, { scale: 1, duration: 0.28, ease: 'back.out(2.4)' });
  }, [pumps, phase]);

  // Auto-clear the result back to betting after a short pause.
  useEffect(() => {
    if (phase !== 'result') return;
    const t = window.setTimeout(() => reset(), 3600);
    return () => window.clearTimeout(t);
  }, [phase, reset]);

  function handleError(err: unknown) {
    sound.error();
    const ax = err as { response?: { data?: { error?: string }; status?: number } };
    const status = ax.response?.status;
    if (status === 402) setError('Insufficient funds.');
    else if (status === 409) { setError('You already have a round in progress.'); void resume(); }
    else if (status === 429) setError('Too fast — slow down.');
    else setError(ax.response?.data?.error ?? 'Something went wrong. Please try again.');
  }

  async function handleStart() {
    if (busy) return;
    sound.unlock();
    sound.cardDeal();
    setError(null);
    setBusy(true);
    localStorage.setItem('lastBet_pump', String(betAmount));
    try {
      const res = await apiClient.post<StartResponse>('/games/pump/start', { betAmount, difficulty });
      useBalanceStore.getState().setBalance(res.data.newBalance);
      startRound({ sessionId: res.data.sessionId, maxPumps: res.data.maxPumps });
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleInflate() {
    if (busy || phase !== 'active' || sessionId == null || maxedOut) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiClient.post<InflateResponse>('/games/pump/inflate', { sessionId });
      const d = res.data;
      if (d.popped) {
        applyPop({ pumps: d.pumps, multiplier: d.multiplier });
        if (d.newBalance != null) useBalanceStore.getState().setBalance(d.newBalance);
        if (!prefersReducedMotion() && balloonWrapRef.current) {
          gsap.timeline()
            .to(balloonWrapRef.current, { scale: 1.25, duration: 0.08, ease: 'power2.in' })
            .set(balloonWrapRef.current, { opacity: 0 })
            .to(stageRef.current, { x: '+=8', duration: 0.05, repeat: 5, yoyo: true, clearProps: 'x' }, '<')
            .set(balloonWrapRef.current, { scale: 1, opacity: 1, delay: 0.3 });
        }
        celebrate('none'); // loss stinger
      } else {
        applyInflate({ pumps: d.pumps, multiplier: d.multiplier, maxedOut: d.maxedOut });
        sound.tick();
      }
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleCashout() {
    if (busy || phase !== 'active' || sessionId == null || pumps < 1) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiClient.post<CashoutResponse>('/games/pump/cashout', { sessionId });
      const d = res.data;
      useBalanceStore.getState().setBalance(d.newBalance);
      applyCashout({ payout: d.payout, multiplier: d.multiplier, pumps: d.pumps });
      celebrate(winTier(d.payout - betAmount, betAmount), { shakeEl: stageRef.current, originEl: balloonWrapRef.current });
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  const isActive = phase === 'active';
  const isBetting = phase === 'betting';
  const profit = Math.max(0, Math.floor(betAmount * multiplier) - betAmount);
  const cfg = PUMP_DIFFICULTIES[difficulty];

  // Live odds for the NEXT pump from the current state.
  const nextPopChance = isActive && !maxedOut ? pumpPopChance(difficulty, pumps) : null;
  const nextMultiplier = isActive && !maxedOut ? pumpMultiplier(difficulty, pumps + 1) : null;

  // BetPanel primary mirrors Mines/Hi-Lo: Place bet → (Cash out | prompt) → Play again.
  let primaryLabel = busy ? 'Starting…' : 'Place bet';
  let onPrimary: () => void = () => { void handleStart(); };
  let primaryDisabled = busy;
  if (isActive) {
    if (pumps > 0) {
      primaryLabel = `Cash out · ${Math.floor(betAmount * multiplier).toLocaleString()} V`;
      onPrimary = () => { void handleCashout(); };
      primaryDisabled = busy;
    } else {
      primaryLabel = 'Pump to begin';
      onPrimary = () => {};
      primaryDisabled = true;
    }
  } else if (phase === 'result') {
    primaryLabel = 'Play again';
    onPrimary = () => { reset(); };
    primaryDisabled = false;
  }

  return (
    <AppShell>
      <div className="crumb">
        <span>HOME</span><span className="crumb-sep">/</span><span>GAMES</span>
        <span className="crumb-sep">/</span><span style={{ color: 'var(--text-secondary)' }}>PUMP</span>
      </div>
      <div className="game-page-head">
        <h1 className="h-title">Pump</h1>
        <div className="game-meta-spec">
          <span>BALLOON LADDER</span><span className="dot">·</span><span>{cfg.label.toUpperCase()}</span><span className="dot">·</span><span>97% RTP</span>
          <button className="icon-btn" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} style={{ fontSize: 14 }}>
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

      {error && <div className="notice loss" style={{ marginBottom: 16, textAlign: 'left' }}>{error}</div>}

      <div className="game-layout">
        <div className="game-stage">
          <div className="pump-stage" ref={stageRef}>
            <div className="dice-stats">
              <div className="col">
                <div className="section-title">Multiplier</div>
                <div className="num v" style={{ color: 'var(--accent)' }}>{multiplier.toFixed(2)}×</div>
              </div>
              <div className="divider" />
              <div className="col">
                <div className="section-title">Pumps</div>
                <div className="num v">{pumps}{maxPumps > 0 ? `/${maxPumps}` : ''}</div>
              </div>
              <div className="divider" />
              <div className="col">
                <div className="section-title">Profit</div>
                <div className="num v" style={{ color: 'var(--win)' }}>+{profit.toLocaleString()}</div>
              </div>
            </div>

            <div className="pump-balloon-wrap" ref={balloonWrapRef}>
              <Balloon scale={balloonScale(pumps, maxPumps || 1)} popped={phase === 'result' && !!result?.popped} />
            </div>

            <div className="hilo-hint">
              {isBetting && 'Pick a difficulty and place a bet to inflate the balloon'}
              {isActive && !maxedOut && (pumps > 0 ? 'Pump for more — or cash out before it pops.' : 'Pump the balloon to start climbing.')}
              {isActive && maxedOut && 'Balloon maxed — cash out now!'}
              {phase === 'result' && result && (result.won
                ? `Cashed out ${result.payout.toLocaleString()} V · ${result.pumps} pump${result.pumps === 1 ? '' : 's'}`
                : `💥 Popped on pump ${result.pumps + 1} — lost ${betAmount.toLocaleString()} V`)}
            </div>

            <div className="pump-actions">
              <button
                type="button"
                className="pump-btn"
                disabled={!isActive || busy || maxedOut}
                onClick={() => { void handleInflate(); }}
              >
                <span className="lbl">▲ PUMP</span>
                {nextPopChance != null && nextMultiplier != null && (
                  <span className="sub">
                    {nextMultiplier.toFixed(2)}× · {(nextPopChance * 100).toFixed(0)}% pop
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        <BetPanel
          amount={betAmount}
          onAmountChange={setBetAmount}
          balance={balance}
          amountLocked={!isBetting}
          multiplier={isActive ? multiplier.toFixed(2) : undefined}
          profitOnWin={isActive && pumps > 0 ? profit : undefined}
          primaryLabel={primaryLabel}
          onPrimary={onPrimary}
          primaryDisabled={primaryDisabled}
        >
          <div>
            <label className="label">Difficulty</label>
            <div className="opt-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {PUMP_DIFFICULTY_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  disabled={!isBetting}
                  className={difficulty === id ? 'active' : ''}
                  onClick={() => setDifficulty(id)}
                >
                  {PUMP_DIFFICULTIES[id].label}
                </button>
              ))}
            </div>
          </div>
        </BetPanel>
      </div>
    </AppShell>
  );
}

export default PumpPage;
