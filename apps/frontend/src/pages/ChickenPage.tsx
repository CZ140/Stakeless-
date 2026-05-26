import { useShallow } from 'zustand/react/shallow';
import { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import {
  CHICKEN,
  CHICKEN_DIFFICULTY_IDS,
  CHICKEN_DIFFICULTIES,
  chickenConfig,
  chickenHazardRate,
  chickenNextDeathChance,
  chickenMultiplier,
  chickenMaxLanes,
  type ChickenDifficulty,
} from '@gambling/shared';
import { AppShell } from '../components/vault/AppShell';
import { BetPanel } from '../components/vault/BetPanel';
import { CoinIcon } from '../components/vault/icons';
import { useChickenStore } from '../stores/chickenStore';
import { useBalanceStore } from '../stores/balanceStore';
import { useAudioStore } from '../stores/audioStore';
import { sound } from '../lib/sound';
import { celebrate, winTier } from '../lib/juice';
import { prefersReducedMotion } from '../hooks/useReducedMotion';
import { apiClient } from '../api/client';

interface StartResponse { sessionId: number; difficulty: ChickenDifficulty; lane: number; multiplier: number; maxLanes: number; newBalance: number }
interface StepResponse { dead: boolean; lane: number; multiplier: number; crossed: boolean; newBalance?: number }
interface CashoutResponse { payout: number; newBalance: number; multiplier: number; lane: number }
interface ActiveSessionResponse {
  session: null | { sessionId: number; difficulty: ChickenDifficulty; lane: number; multiplier: number; maxLanes: number; betAmount: number };
}

// Lane column / curb widths — kept in sync with the .chk-lane / .chk-curb CSS so
// the absolutely-positioned chicken lines up with its lane.
const LANE_W = 94;
const CURB_W = 38;

// Player-facing hazard rate as the real game shows it: "N in 25".
function hazardRate(d: ChickenDifficulty): string {
  return `${chickenConfig(d).deadly} in ${CHICKEN.TILES}`;
}

// ── Dusk skyline backdrop ─────────────────────────────────────────────
const BUILDING_HEIGHTS = [34, 22, 48, 18, 28, 42, 26, 56, 30, 20, 36, 24, 50, 28];
function Skyline() {
  return (
    <div className="chk-sky">
      <div className="chk-sun" />
      <div className="chk-stars">
        {Array.from({ length: 28 }, (_, i) => (
          <span key={i} style={{
            left: `${(i * 37) % 100}%`,
            top: `${(i * 19) % 60}%`,
            opacity: 0.25 + ((i * 7) % 60) / 100,
            width: i % 5 === 0 ? 2 : 1,
            height: i % 5 === 0 ? 2 : 1,
          }} />
        ))}
      </div>
      <div className="chk-skyline">
        {BUILDING_HEIGHTS.map((h, i) => (
          <div key={i} className="chk-building" style={{ height: h, flex: i % 3 === 0 ? 1.4 : 1 }}>
            <div className="chk-windows">
              {Array.from({ length: Math.floor(h / 10) }, (_, w) => (
                <span key={w} style={{ opacity: (i * w * 7) % 5 === 0 ? 0.9 : 0.2 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChickenSprite() {
  return (
    <svg width="50" height="50" viewBox="0 0 64 64" fill="none" style={{ display: 'block' }}>
      <line x1="26" y1="48" x2="26" y2="56" stroke="#F6B85D" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="36" y1="48" x2="36" y2="56" stroke="#F6B85D" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M 23 56 L 23 58 L 28 58" stroke="#F6B85D" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M 33 56 L 33 58 L 38 58" stroke="#F6B85D" strokeWidth="2" strokeLinecap="round" fill="none" />
      <ellipse cx="32" cy="38" rx="14" ry="12" fill="#FFFFFF" />
      <ellipse cx="32" cy="38" rx="14" ry="12" fill="url(#chk-body-grad)" opacity="0.5" />
      <path d="M 24 36 Q 22 42 26 46 Q 30 44 32 40 Z" fill="#E6E9EF" />
      <circle cx="40" cy="26" r="9" fill="#FFFFFF" />
      <path d="M 36 17 L 38 13 L 40 17 L 42 13 L 44 17 L 46 14 Z" fill="#C8364B" />
      <path d="M 48 26 L 53 25 L 48 29 Z" fill="#F6B85D" />
      <circle cx="42" cy="24" r="1.6" fill="#1a0a0d" />
      <circle cx="42.5" cy="23.5" r="0.5" fill="#fff" />
      <ellipse cx="46" cy="30" rx="2" ry="2.5" fill="#C8364B" />
      <defs>
        <linearGradient id="chk-body-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#D0D5DB" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// The hazard that hits the chicken — only shown on the fatal lane after a death.
function Truck() {
  return (
    <svg width="44" height="86" viewBox="0 0 60 120" fill="none" style={{ display: 'block' }}>
      <ellipse cx="30" cy="118" rx="24" ry="3" fill="#000" opacity="0.45" />
      <rect x="8" y="34" width="44" height="62" rx="3" fill="#D6453B" />
      <rect x="8" y="34" width="44" height="62" rx="3" fill="url(#truck-shade)" opacity="0.35" />
      <rect x="10" y="36" width="40" height="58" rx="2" fill="none" stroke="rgba(0,0,0,0.25)" />
      <line x1="10" y1="50" x2="50" y2="50" stroke="rgba(0,0,0,0.18)" />
      <line x1="10" y1="64" x2="50" y2="64" stroke="rgba(0,0,0,0.18)" />
      <line x1="10" y1="78" x2="50" y2="78" stroke="rgba(0,0,0,0.18)" />
      <rect x="10" y="14" width="40" height="22" rx="4" fill="#D6453B" />
      <rect x="10" y="14" width="40" height="22" rx="4" fill="url(#truck-shade)" opacity="0.35" />
      <rect x="14" y="18" width="32" height="10" rx="2" fill="#A8C7E8" />
      <rect x="12" y="12" width="6" height="3" rx="1" fill="#FFE89A" />
      <rect x="42" y="12" width="6" height="3" rx="1" fill="#FFE89A" />
      <rect x="3" y="40" width="6" height="14" rx="2" fill="#0a0a0a" />
      <rect x="51" y="40" width="6" height="14" rx="2" fill="#0a0a0a" />
      <rect x="3" y="78" width="6" height="14" rx="2" fill="#0a0a0a" />
      <rect x="51" y="78" width="6" height="14" rx="2" fill="#0a0a0a" />
      <defs>
        <linearGradient id="truck-shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.4" />
          <stop offset="0.5" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.4" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function ChickenPage() {
  const {
    betAmount, difficulty, phase, sessionId, lane, multiplier, maxLanes, crossed, deadLane, result, recent,
    setBetAmount, setDifficulty, startRound, applyAdvance, applyDeath, applyCashout, restoreSession, reset,
  } = useChickenStore(useShallow((s) => ({ betAmount: s.betAmount, difficulty: s.difficulty, phase: s.phase, sessionId: s.sessionId, lane: s.lane, multiplier: s.multiplier, maxLanes: s.maxLanes, crossed: s.crossed, deadLane: s.deadLane, result: s.result, recent: s.recent, setBetAmount: s.setBetAmount, setDifficulty: s.setDifficulty, startRound: s.startRound, applyAdvance: s.applyAdvance, applyDeath: s.applyDeath, applyCashout: s.applyCashout, restoreSession: s.restoreSession, reset: s.reset })));
  const { muted, toggleMute } = useAudioStore();
  const balance = useBalanceStore((s) => s.balance);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const roadRef = useRef<HTMLDivElement>(null);
  const chickenRef = useRef<HTMLDivElement>(null);

  const roadLanes = phase === 'betting' ? chickenMaxLanes(difficulty) : maxLanes;
  // Which lane the chicken stands on: 0 = the START sidewalk; otherwise the last
  // lane it crossed (or the fatal lane on a death).
  const chickenLane = result?.dead ? (deadLane ?? 0) + 1 : lane;
  // Lane 0 → stand on the START sidewalk (curb), nudged right so it isn't clipped.
  const chickenLeft = chickenLane === 0 ? CURB_W / 2 + 7 : CURB_W + (chickenLane - 0.5) * LANE_W;

  const resume = useCallback(async () => {
    try {
      const res = await apiClient.get<ActiveSessionResponse>('/games/chicken/active-session');
      if (res.data.session) restoreSession(res.data.session);
    } catch {
      /* no active round */
    }
  }, [restoreSession]);

  useEffect(() => { void resume(); }, [resume]);

  // Keep the chicken scrolled into view as it advances. (Its idle bob is a CSS
  // animation; GSAP only owns the death shake + the win celebrate.)
  useEffect(() => {
    const el = roadRef.current;
    if (!el) return;
    el.scrollTo({ left: chickenLeft - el.clientWidth / 2, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [chickenLeft]);

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
    localStorage.setItem('lastBet_chicken', String(betAmount));
    try {
      const res = await apiClient.post<StartResponse>('/games/chicken/start', { betAmount, difficulty });
      useBalanceStore.getState().setBalance(res.data.newBalance);
      startRound({ sessionId: res.data.sessionId, maxLanes: res.data.maxLanes });
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleStep() {
    if (busy || phase !== 'active' || sessionId == null || crossed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiClient.post<StepResponse>('/games/chicken/step', { sessionId });
      const d = res.data;
      if (d.dead) {
        applyDeath({ lane: d.lane, multiplier: d.multiplier });
        if (d.newBalance != null) useBalanceStore.getState().setBalance(d.newBalance);
        if (!prefersReducedMotion() && stageRef.current) {
          gsap.fromTo(stageRef.current, { x: -9 }, { x: 0, duration: 0.05, repeat: 6, yoyo: true, clearProps: 'x' });
        }
        celebrate('none'); // loss stinger
      } else {
        applyAdvance({ lane: d.lane, multiplier: d.multiplier, crossed: d.crossed });
        sound.tick();
      }
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleCashout() {
    if (busy || phase !== 'active' || sessionId == null || lane < 1) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiClient.post<CashoutResponse>('/games/chicken/cashout', { sessionId });
      const d = res.data;
      useBalanceStore.getState().setBalance(d.newBalance);
      applyCashout({ payout: d.payout, multiplier: d.multiplier, lane: d.lane });
      celebrate(winTier(d.payout - betAmount, betAmount), { shakeEl: stageRef.current, originEl: chickenRef.current });
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  const isActive = phase === 'active';
  const isBetting = phase === 'betting';
  const profit = Math.max(0, Math.floor(betAmount * multiplier) - betAmount);
  const cfg = CHICKEN_DIFFICULTIES[difficulty];
  const nextMultiplier = isActive && !crossed ? chickenMultiplier(difficulty, lane + 1) : null;
  const nextRisk = isActive && !crossed ? chickenNextDeathChance(difficulty, lane) : null;
  const canStep = isActive && !crossed && !busy;

  let primaryLabel = busy ? 'Starting…' : 'Place bet';
  let onPrimary: () => void = () => { void handleStart(); };
  let primaryDisabled = busy;
  if (isActive) {
    if (lane > 0) {
      primaryLabel = `Cash out · ${Math.floor(betAmount * multiplier).toLocaleString()} coins`;
      onPrimary = () => { void handleCashout(); };
      primaryDisabled = busy;
    } else {
      primaryLabel = 'Cross a lane to cash';
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
        <span className="crumb-sep">/</span><span style={{ color: 'var(--text-secondary)' }}>CHICKEN ROAD</span>
      </div>
      <div className="game-page-head">
        <h1 className="h-title">
          Chicken Road
          <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 14, marginLeft: 8 }}>Cash out before a truck hits</span>
        </h1>
        <div className="game-meta-spec">
          <span>{cfg.label.toUpperCase()}</span><span className="dot">·</span>
          <span>{Math.round(chickenHazardRate(difficulty) * 100)}% START RISK</span><span className="dot">·</span>
          <span>97% RTP</span>
          <button className="icon-btn" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} style={{ fontSize: 14 }}>
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

      {error && <div className="notice loss" role="alert" style={{ marginBottom: 16, textAlign: 'left' }}>{error}</div>}

      <div className="game-layout">
        <div className="game-stage chicken-stage" ref={stageRef}>
          <Skyline />

          <div className="chk-road-scroll" ref={roadRef}>
            <div className="chk-road">
              <div className="chk-curb chk-curb-l"><div className="chk-curb-label">START</div></div>

              {Array.from({ length: roadLanes }, (_, idx) => {
                const i = idx + 1; // 1-based display lane
                const isPast = !isBetting && i <= lane;
                const isHere = isActive && !crossed && i === lane + 1;
                const isDead = !!result?.dead && deadLane != null && i === deadLane + 1;
                const pinCls = 'chk-tile-pin' + (isPast ? ' past' : '') + (isHere ? ' here' : '') + (isDead ? ' dead' : '');
                return (
                  <div key={i} className="chk-lane">
                    <div className={pinCls}>
                      <span className="chk-mult">{chickenMultiplier(difficulty, i).toFixed(2)}×</span>
                      <span className="chk-lane-no">Lane {i}</span>
                    </div>
                    <div className="chk-marker">
                      {isPast && !isDead && <div className="chk-tile-check">✓</div>}
                      {isHere && <div className="chk-tile-pulse" />}
                    </div>
                  </div>
                );
              })}

              <div className="chk-curb chk-curb-r">
                <div className="chk-curb-label">PAYOUT</div>
                <div className="chk-curb-coin"><CoinIcon size={18} /></div>
              </div>

              {/* The chicken (and, on a death, the truck that hit it) float over the
                  road, positioned by lane so they line up with the lane columns. */}
              {result?.dead && <div className="chk-truck" style={{ left: chickenLeft }}><Truck /></div>}
              <div className={'chk-chicken' + (result?.dead ? ' hit' : '')} ref={chickenRef} style={{ left: chickenLeft }}>
                <ChickenSprite />
                <div className="chk-chicken-shadow" />
              </div>
            </div>
          </div>

          <div className="chk-hud">
            <div className="chk-hud-cell">
              <div className="section-title">Step</div>
              <div className="num chk-hud-v">{lane} <span className="chk-hud-sub">/ {roadLanes}</span></div>
            </div>
            <div className="chk-hud-divider" />
            <div className="chk-hud-cell">
              <div className="section-title">Current multiplier</div>
              <div className="num chk-hud-v" style={{ color: 'var(--gold)' }}>{multiplier.toFixed(2)}×</div>
            </div>
            <div className="chk-hud-divider" />
            <div className="chk-hud-cell">
              <div className="section-title">Cash out value</div>
              <div className="num chk-hud-v" style={{ color: 'var(--win)' }}>+{profit.toLocaleString()}</div>
            </div>
            <div className="chk-hud-divider" />
            <div className="chk-hud-cell">
              <div className="section-title">Next lane</div>
              <div className="num chk-hud-v">{nextMultiplier != null ? `${nextMultiplier.toFixed(2)}×` : '—'}</div>
            </div>
          </div>
        </div>

        <BetPanel
          amount={betAmount}
          onAmountChange={setBetAmount}
          balance={balance}
          amountLocked={!isBetting}
          summary={[
            { label: 'Difficulty', value: cfg.label },
            { label: 'Hazard rate', value: hazardRate(difficulty) },
            { label: 'Lanes ahead', value: `${Math.max(0, roadLanes - lane)} / ${roadLanes}` },
          ]}
          primaryLabel={primaryLabel}
          onPrimary={onPrimary}
          primaryDisabled={primaryDisabled}
        >
          <div>
            <label className="label">Difficulty</label>
            <div className="chk-diff-grid">
              {CHICKEN_DIFFICULTY_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  disabled={!isBetting}
                  className={'chk-diff' + (difficulty === id ? ' active' : '')}
                  onClick={() => setDifficulty(id)}
                >
                  <span className="chk-diff-label">{CHICKEN_DIFFICULTIES[id].label}</span>
                  <span className="chk-diff-hint">{hazardRate(id)}</span>
                </button>
              ))}
            </div>
          </div>

          {isActive && (
            <div className="chk-step-card">
              <button
                type="button"
                className="chk-step-btn"
                disabled={!canStep}
                onClick={() => { void handleStep(); }}
              >
                {crossed ? 'Across the road!' : 'Next lane'} <span className="chk-step-arrow">→</span>
                {nextMultiplier != null && nextRisk != null && (
                  <span className="chk-step-next">{nextMultiplier.toFixed(2)}× · {Math.round(nextRisk * 100)}% risk</span>
                )}
              </button>
            </div>
          )}
        </BetPanel>
      </div>

      {recent.length > 0 && (
        <div className="chk-history-strip">
          <span className="label">recent rounds</span>
          {recent.map((h, i) => (
            <span key={i} className={'num chk-hist ' + (h.won ? 'win' : 'loss')}>
              {h.won ? `${h.multiplier.toFixed(2)}×` : 'BUST'}
              <small>{h.lanes}L</small>
            </span>
          ))}
        </div>
      )}
    </AppShell>
  );
}

export default ChickenPage;
