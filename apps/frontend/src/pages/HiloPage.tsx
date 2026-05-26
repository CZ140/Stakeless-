import { useShallow } from 'zustand/react/shallow';
import { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import {
  hiloWinChance,
  hiloStepMultiplier,
  hiloDirectionAvailable,
  type HiloDirection,
  type HiloCard,
  type CardSuit,
} from '@gambling/shared';
import { AppShell } from '../components/vault/AppShell';
import { BetPanel } from '../components/vault/BetPanel';
import { useHiloStore } from '../stores/hiloStore';
import { useBalanceStore } from '../stores/balanceStore';
import { useAudioStore } from '../stores/audioStore';
import { sound } from '../lib/sound';
import { celebrate, pulse, winTier } from '../lib/juice';
import { prefersReducedMotion } from '../hooks/useReducedMotion';
import { apiClient } from '../api/client';

interface StartResponse { sessionId: number; currentCard: HiloCard; streak: number; multiplier: number; newBalance: number }
interface GuessResponse { nextCard: HiloCard; win: boolean; busted: boolean; streak: number; multiplier: number; newBalance?: number }
interface CashoutResponse { payout: number; newBalance: number; multiplier: number; streak: number }
interface ActiveSessionResponse {
  session: null | { sessionId: number; currentCard: HiloCard; history: HiloCard[]; streak: number; multiplier: number; betAmount: number };
}

const SUIT_SYMBOLS: Record<CardSuit, string> = { hearts: '♥', diamonds: '♦', spades: '♠', clubs: '♣' };
const RED_SUITS = new Set<CardSuit>(['hearts', 'diamonds']);

function rankLabel(rank: number): string {
  return rank === 14 ? 'A' : rank === 13 ? 'K' : rank === 12 ? 'Q' : rank === 11 ? 'J' : String(rank);
}

function CardFace({ card, variant }: { card: HiloCard; variant?: 'hero' | 'mini' }) {
  const symbol = SUIT_SYMBOLS[card.suit];
  const cls = `playing-card ${RED_SUITS.has(card.suit) ? 'red' : 'black'}${variant === 'hero' ? ' hilo-hero-card' : ''}${variant === 'mini' ? ' hilo-mini-card' : ''}`;
  return (
    <div className={cls}>
      <div className="corner tl"><div className="rank">{rankLabel(card.rank)}</div><div className="suit-sm">{symbol}</div></div>
      <div className="center-suit">{symbol}</div>
      <div className="corner tr"><div className="rank">{rankLabel(card.rank)}</div><div className="suit-sm">{symbol}</div></div>
    </div>
  );
}

export function HiloPage() {
  const {
    betAmount, phase, sessionId, currentCard, history, streak, multiplier, result,
    setBetAmount, startRound, applyWin, applyBust, applyCashout, restoreSession, reset,
  } = useHiloStore(useShallow((s) => ({ betAmount: s.betAmount, phase: s.phase, sessionId: s.sessionId, currentCard: s.currentCard, history: s.history, streak: s.streak, multiplier: s.multiplier, result: s.result, setBetAmount: s.setBetAmount, startRound: s.startRound, applyWin: s.applyWin, applyBust: s.applyBust, applyCashout: s.applyCashout, restoreSession: s.restoreSession, reset: s.reset })));
  const { muted, toggleMute } = useAudioStore();
  const balance = useBalanceStore((s) => s.balance);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Resume an open round on mount (and after a 409).
  const resume = useCallback(async () => {
    try {
      const res = await apiClient.get<ActiveSessionResponse>('/games/hilo/active-session');
      if (res.data.session) restoreSession(res.data.session);
    } catch {
      /* no active round */
    }
  }, [restoreSession]);

  useEffect(() => { void resume(); }, [resume]);

  // Flip the hero card whenever it changes (new reveal).
  const cardKey = currentCard ? `${currentCard.rank}-${currentCard.suit}` : 'none';
  useEffect(() => {
    if (!currentCard || !cardRef.current) return;
    const reduced = prefersReducedMotion();
    gsap.fromTo(
      cardRef.current,
      { rotationY: reduced ? 0 : 90, opacity: reduced ? 1 : 0 },
      { rotationY: 0, opacity: 1, duration: reduced ? 0 : 0.34, ease: 'power3.out' },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey]);

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
    localStorage.setItem('lastBet_hilo', String(betAmount));
    try {
      const res = await apiClient.post<StartResponse>('/games/hilo/start', { betAmount });
      useBalanceStore.getState().setBalance(res.data.newBalance);
      startRound({ sessionId: res.data.sessionId, currentCard: res.data.currentCard });
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleGuess(dir: HiloDirection) {
    if (busy || phase !== 'active' || sessionId == null) return;
    setBusy(true);
    setError(null);
    sound.cardFlip();
    try {
      const res = await apiClient.post<GuessResponse>('/games/hilo/guess', { sessionId, direction: dir });
      const d = res.data;
      if (d.busted) {
        applyBust({ nextCard: d.nextCard, multiplier: d.multiplier, streak: d.streak });
        if (d.newBalance != null) useBalanceStore.getState().setBalance(d.newBalance);
        celebrate('none'); // plays the loss stinger
      } else {
        applyWin({ nextCard: d.nextCard, multiplier: d.multiplier, streak: d.streak });
        sound.tick();
        pulse(cardRef.current, '#00E082');
      }
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleCashout() {
    if (busy || phase !== 'active' || sessionId == null || streak < 1) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiClient.post<CashoutResponse>('/games/hilo/cashout', { sessionId });
      const d = res.data;
      useBalanceStore.getState().setBalance(d.newBalance);
      applyCashout({ payout: d.payout, multiplier: d.multiplier, streak: d.streak });
      celebrate(winTier(d.payout - betAmount, betAmount), { shakeEl: stageRef.current, originEl: cardRef.current });
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  const isActive = phase === 'active';
  const isBetting = phase === 'betting';
  const rank = currentCard?.rank ?? null;
  const canGuess = isActive && !busy;
  const profit = Math.max(0, Math.floor(betAmount * multiplier) - betAmount);

  // Live per-direction odds for the current base card.
  const dirs = (['hi', 'lo'] as const).map((dir) => ({
    dir,
    available: rank != null && hiloDirectionAvailable(rank, dir),
    chance: rank != null ? hiloWinChance(rank, dir) : 0,
    mult: rank != null ? hiloStepMultiplier(rank, dir) : 0,
  }));

  // BetPanel primary mirrors Mines: Deal → (Cash out | guess prompt) → Play again.
  let primaryLabel = busy ? 'Dealing…' : 'Deal card';
  let onPrimary: () => void = () => { void handleStart(); };
  let primaryDisabled = busy;
  if (isActive) {
    if (streak > 0) {
      primaryLabel = `Cash out · ${Math.floor(betAmount * multiplier).toLocaleString()} coins`;
      onPrimary = () => { void handleCashout(); };
      primaryDisabled = busy;
    } else {
      primaryLabel = 'Guess higher or lower';
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
        <span className="crumb-sep">/</span><span style={{ color: 'var(--text-secondary)' }}>HI-LO</span>
      </div>
      <div className="game-page-head">
        <h1 className="h-title">Hi-Lo</h1>
        <div className="game-meta-spec">
          <span>52-CARD DECK</span><span className="dot">·</span><span>TIES LOSE</span><span className="dot">·</span><span>97% RTP</span>
          <button className="icon-btn" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} style={{ fontSize: 14 }}>
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

      {error && <div className="notice loss" role="alert" style={{ marginBottom: 16, textAlign: 'left' }}>{error}</div>}

      <div className="game-layout">
        <div className="game-stage">
          <div className="hilo-stage" ref={stageRef}>
            <div className="dice-stats">
              <div className="col">
                <div className="section-title">Multiplier</div>
                <div className="num v" style={{ color: 'var(--accent)' }}>{multiplier.toFixed(2)}×</div>
              </div>
              <div className="divider" />
              <div className="col">
                <div className="section-title">Streak</div>
                <div className="num v">{streak}</div>
              </div>
              <div className="divider" />
              <div className="col">
                <div className="section-title">Profit</div>
                <div className="num v" style={{ color: 'var(--win)' }}>+{profit.toLocaleString()}</div>
              </div>
            </div>

            {/* Hero card */}
            <div className="hilo-hero" ref={cardRef}>
              {currentCard ? <CardFace card={currentCard} variant="hero" /> : <div className="playing-card back hilo-hero-card" />}
            </div>

            <div className="hilo-hint">
              {isBetting && 'Place a bet to draw your first card'}
              {isActive && (streak > 0 ? 'Higher or lower? Cash out any time.' : 'Will the next card be higher or lower?')}
              {phase === 'result' && result && (result.won
                ? `Cashed out ${result.payout.toLocaleString()} coins · ${result.streak} in a row`
                : `Busted on ${currentCard ? rankLabel(currentCard.rank) : '—'} — lost ${betAmount.toLocaleString()} coins`)}
            </div>

            {/* Higher / Lower */}
            <div className="hilo-guesses">
              {dirs.map(({ dir, available, chance, mult }) => (
                <button
                  key={dir}
                  type="button"
                  className={`hilo-guess ${dir}`}
                  disabled={!canGuess || !available}
                  onClick={() => { void handleGuess(dir); }}
                >
                  <span className="dir">{dir === 'hi' ? '▲ Higher' : '▼ Lower'}</span>
                  <span className="sub">
                    {rank == null ? '—' : available ? `${dir === 'hi' ? '>' : '<'} ${rankLabel(rank)}` : 'not possible'}
                  </span>
                  <span className="mult">{available ? `${mult.toFixed(2)}×` : '—'}</span>
                  <span className="chance">{available ? `${(chance * 100).toFixed(0)}%` : ''}</span>
                </button>
              ))}
            </div>

            {/* Climbed-cards history */}
            {history.length > 0 && (
              <div className="hilo-history">
                {history.map((c, i) => (
                  <CardFace key={`${i}-${c.rank}-${c.suit}`} card={c} variant="mini" />
                ))}
              </div>
            )}
          </div>
        </div>

        <BetPanel
          amount={betAmount}
          onAmountChange={setBetAmount}
          balance={balance}
          amountLocked={!isBetting}
          multiplier={isActive ? multiplier.toFixed(2) : undefined}
          profitOnWin={isActive && streak > 0 ? profit : undefined}
          primaryLabel={primaryLabel}
          onPrimary={onPrimary}
          primaryDisabled={primaryDisabled}
        />
      </div>
    </AppShell>
  );
}

export default HiloPage;
