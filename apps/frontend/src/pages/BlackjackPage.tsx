import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AppShell } from '../components/vault/AppShell';
import {
  useBlackjackStore,
  type Card,
  type BJOutcome,
  type BJHandView,
  type BJSessionView,
} from '../stores/blackjackStore';
import { useBalanceStore } from '../stores/balanceStore';
import { useAudioStore } from '../stores/audioStore';
import { sound } from '../lib/sound';
import { celebrate, winTier } from '../lib/juice';
import { prefersReducedMotion } from '../hooks/useReducedMotion';
import { apiClient } from '../api/client';

// A snappy back-out overshoot for cards settling into place.
const CARD_EASE: [number, number, number, number] = [0.34, 1.56, 0.64, 1];

const SUIT_SYMBOLS: Record<string, string> = { hearts: '♥', diamonds: '♦', spades: '♠', clubs: '♣' };
const RED_SUITS = new Set(['hearts', 'diamonds']);
const CHIP_VALUES = [10, 50, 100, 500];

// ─── Cards ──────────────────────────────────────────────────────────────────────

function CardFace({ card }: { card: Card | 'facedown' }) {
  if (card === 'facedown') return <div className="playing-card back" />;
  const symbol = SUIT_SYMBOLS[card.suit] ?? card.suit;
  const red = RED_SUITS.has(card.suit);
  return (
    <div className={`playing-card ${red ? 'red' : 'black'}`}>
      <div className="corner tl">
        <div className="rank">{card.rank}</div>
        <div className="suit-sm">{symbol}</div>
      </div>
      <div className="center-suit">{symbol}</div>
      <div className="corner tr">
        <div className="rank">{card.rank}</div>
        <div className="suit-sm">{symbol}</div>
      </div>
    </div>
  );
}

// A card that deals in from the shoe (top-right) with a staggered, overshooting
// settle — or flips in 3D on reveal. Plays a deal/flip cue timed to its stagger.
function DealtCard({ card, flip = false, index = 0 }: { card: Card | 'facedown'; flip?: boolean; index?: number }) {
  const reduced = prefersReducedMotion();
  useEffect(() => {
    const id = window.setTimeout(() => (flip ? sound.cardFlip() : sound.cardDeal()), reduced ? 0 : index * 90);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <motion.div
      initial={flip ? { rotateY: 90, opacity: 0 } : { opacity: 0, y: -52, x: 64, rotate: 9 }}
      animate={{ rotateY: 0, opacity: 1, y: 0, x: 0, rotate: 0 }}
      transition={{ duration: reduced ? 0 : 0.42, ease: CARD_EASE, delay: reduced ? 0 : index * 0.09 }}
      style={{ transformStyle: 'preserve-3d' }}
    >
      <CardFace card={card} />
    </motion.div>
  );
}

function outcomeBadge(outcome: BJOutcome): { text: string; cls: string } | null {
  switch (outcome) {
    case 'player_blackjack': return { text: 'Blackjack 3:2', cls: 'win' };
    case 'player_win': return { text: 'Win', cls: 'win' };
    case 'dealer_bust': return { text: 'Dealer bust', cls: 'win' };
    case 'push': return { text: 'Push', cls: 'push' };
    case 'player_bust': return { text: 'Bust', cls: 'loss' };
    case 'dealer_win': return { text: 'Lose', cls: 'loss' };
    default: return null;
  }
}

function handNet(h: BJHandView): number {
  const effectiveBet = h.bet * (h.isDoubled ? 2 : 1);
  return (h.profit ?? 0) - effectiveBet;
}

// A single player hand (cards + footer with value / bet / outcome).
function PlayerHand({ hand, index, active, settled }: { hand: BJHandView; index: number; active: boolean; settled: boolean }) {
  const badge = settled ? outcomeBadge(hand.outcome) : null;
  const valClass = hand.status === 'bust' ? 'bust' : hand.status === 'blackjack' ? 'bj' : '';
  return (
    <div className={`bj-hand${active ? ' active' : ''}${settled ? ' done' : ''}`}>
      <div className="cards-row">
        {hand.cards.map((c, i) => (
          <DealtCard key={`${index}-${i}-${c.suit}-${c.rank}`} card={c} index={i} />
        ))}
      </div>
      <div className="bj-hand-foot">
        <span className={`bj-val ${valClass}`}>{hand.value}</span>
        <span>{hand.bet}{hand.isDoubled ? '×2' : ''} coins</span>
      </div>
      {badge ? <span className={`bj-outcome ${badge.cls}`}>{badge.text}</span> : null}
    </div>
  );
}

export function BlackjackPage() {
  const store = useBlackjackStore();
  const { muted, toggleMute } = useAudioStore();
  const balance = useBalanceStore((s) => s.balance);
  const feltRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { betAmount, handCount, phase, sessionId, hands, activeHandIndex, dealer, canSplit, canDouble } = store;
  const isBetting = phase === 'betting';
  const isPlayerTurn = phase === 'player_turn';
  const isSettled = phase === 'settled';

  // Resume an open hand on mount.
  useEffect(() => {
    apiClient
      .get<{ session: BJSessionView | null }>('/games/blackjack/active-session')
      .then((res) => {
        if (res.data.session) store.applyView(res.data.session);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function celebrateSettle(view: BJSessionView) {
    if (view.phase !== 'settled') return;
    const net = view.hands.reduce((s, h) => s + handNet(h), 0);
    const stake = view.hands.reduce((s, h) => s + h.bet * (h.isDoubled ? 2 : 1), 0);
    // The dealer's hole card flips first; let the win flourish land just after.
    window.setTimeout(() => {
      if (net > 0) celebrate(winTier(net, stake), { shakeEl: feltRef.current, originEl: feltRef.current });
      else if (net < 0) celebrate('none');
      // net === 0 (push): no sound.
    }, prefersReducedMotion() ? 0 : 420);
  }

  function applySettled(view: BJSessionView) {
    store.applyView(view);
    if (view.newBalance !== undefined) useBalanceStore.getState().setBalance(view.newBalance);
    celebrateSettle(view);
  }

  async function handleDeal() {
    if (isLoading) return;
    sound.unlock();
    sound.chip();
    setError(null);
    localStorage.setItem('lastBet_blackjack', String(betAmount));
    setIsLoading(true);
    try {
      const bets = Array.from({ length: handCount }, () => betAmount);
      const res = await apiClient.post<BJSessionView>('/games/blackjack/deal', { bets });
      if (res.data.phase === 'settled') applySettled(res.data);
      else store.applyView(res.data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string }; status?: number } };
      if (axiosErr.response?.status === 402) setError('Insufficient funds for that total bet.');
      else setError(axiosErr.response?.data?.error ?? 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  async function act(action: 'hit' | 'stand' | 'double' | 'split') {
    if (isLoading || sessionId === null || !isPlayerTurn) return;
    if (action === 'double' || action === 'split') sound.chip();
    else sound.uiClick();
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.post<BJSessionView>('/games/blackjack/action', { sessionId, action });
      if (res.data.phase === 'settled') applySettled(res.data);
      else store.applyView(res.data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string }; status?: number } };
      if (axiosErr.response?.status === 402) setError('Insufficient funds for that action.');
      else setError(axiosErr.response?.data?.error ?? 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  // Dealer cards to render per phase.
  const dealerCards: (Card | 'facedown')[] = isBetting
    ? ['facedown', 'facedown']
    : isSettled && dealer.hand
      ? dealer.hand
      : dealer.upCard
        ? [dealer.upCard, 'facedown']
        : ['facedown', 'facedown'];
  const dealerTotal = isSettled && dealer.value !== null ? String(dealer.value) : isBetting ? '—' : '?';

  const activeBet = hands[activeHandIndex]?.bet ?? betAmount;
  const totalStake = betAmount * handCount;
  const netTotal = isSettled ? hands.reduce((s, h) => s + handNet(h), 0) : 0;
  const netClass = netTotal > 0 ? 'win' : netTotal < 0 ? 'loss' : 'flat';

  // Betting-phase placeholder hands.
  const placeholders = Array.from({ length: handCount }, (_, i) => i);

  const quickBet = (n: number) => store.setBetAmount(Math.max(1, Math.floor(n)));

  return (
    <AppShell>
      <div className="crumb">
        <span>HOME</span><span className="crumb-sep">/</span><span>GAMES</span>
        <span className="crumb-sep">/</span><span style={{ color: 'var(--text-secondary)' }}>BLACKJACK</span>
      </div>
      <div className="game-page-head">
        <h1 className="h-title">Blackjack</h1>
        <div className="game-meta-spec">
          <span>SINGLE DECK</span><span className="dot">·</span><span>BJ PAYS 3:2</span><span className="dot">·</span><span>DEALER STANDS 17</span>
          <button className="icon-btn" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} style={{ fontSize: 14 }}>{muted ? '🔇' : '🔊'}</button>
        </div>
      </div>

      {error && <div className="notice loss" role="alert" style={{ marginBottom: 16, textAlign: 'left' }}>{error}</div>}

      <div className="game-layout">
        <div className="game-stage" style={{ padding: 14 }}>
          <div className="felt" ref={feltRef}>
            <div className="felt-label">STAKELESS · BLACKJACK</div>

            {/* Dealer */}
            <div className="hand-row">
              <div className="hand-label">
                <span>DEALER</span>
                <span className="total">{dealerTotal}</span>
              </div>
              <div className="cards-row">
                {dealerCards.map((c, i) => (
                  <DealtCard key={`dealer-${phase}-${i}`} card={c} index={i} flip={isSettled && i === 1} />
                ))}
              </div>
            </div>

            {/* Settlement banner */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 32 }}>
              {isSettled && (
                <div
                  style={{
                    padding: '8px 22px', borderRadius: 8,
                    fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, letterSpacing: '0.12em',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  }}
                >
                  RESULT&nbsp;&nbsp;
                  <span className={`bj-net ${netClass}`}>
                    {netTotal > 0 ? '+' : netTotal < 0 ? '−' : ''}{Math.abs(netTotal).toLocaleString()} coins
                  </span>
                </div>
              )}
            </div>

            {/* Player hands */}
            <div className="player-hands">
              {isBetting
                ? placeholders.map((i) => (
                    <div className="bj-hand" key={`ph-${i}`}>
                      <div className="cards-row">
                        <CardFace card="facedown" />
                        <CardFace card="facedown" />
                      </div>
                      <div className="bj-hand-foot">
                        <span className="bj-val">—</span>
                        <span>{betAmount} coins</span>
                      </div>
                    </div>
                  ))
                : hands.map((h, i) => (
                    <PlayerHand
                      key={`hand-${i}`}
                      hand={h}
                      index={i}
                      active={isPlayerTurn && i === activeHandIndex}
                      settled={isSettled}
                    />
                  ))}
            </div>
          </div>
        </div>

        {/* Bet / action panel */}
        <div className="bet-panel">
          <div className="tabs-2">
            <button className="active" type="button">Manual</button>
            <button type="button" disabled style={{ opacity: 0.4, cursor: 'not-allowed' }}>Auto</button>
          </div>
          <div className="body">
            {isBetting && (
              <>
                <div>
                  <label className="label">Bet per hand</label>
                  <div className="amount-row">
                    <input
                      className="input"
                      data-mono
                      type="number"
                      min={1}
                      value={betAmount}
                      onChange={(e) => store.setBetAmount(Math.max(1, Math.floor(+e.target.value || 0)))}
                    />
                    <span className="coin-suffix"><span className="dot" /> COINS</span>
                  </div>
                </div>

                <div className="quick-bets">
                  <button type="button" onClick={() => quickBet(betAmount / 2)}>½</button>
                  <button type="button" onClick={() => quickBet(betAmount * 2)}>2×</button>
                  <button type="button" onClick={() => quickBet(1)}>MIN</button>
                  <button type="button" onClick={() => quickBet(balance ?? betAmount)}>MAX</button>
                </div>

                <div className="quick-bets">
                  {CHIP_VALUES.map((v) => (
                    <button key={v} type="button" className={betAmount === v ? 'active' : ''} onClick={() => store.setBetAmount(v)} style={betAmount === v ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}>
                      {v}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="label">Hands</label>
                  <div className="hand-stepper">
                    <button type="button" onClick={store.decHands} disabled={handCount <= 1} aria-label="Fewer hands">−</button>
                    <span className="count">{handCount}</span>
                    <button type="button" onClick={store.incHands} disabled={handCount >= 3} aria-label="More hands">+</button>
                    <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      TOTAL {totalStake.toLocaleString()} coins
                    </span>
                  </div>
                </div>

                <button className="btn btn-primary place-bet" disabled={isLoading} onClick={() => void handleDeal()} type="button">
                  {isLoading ? 'Dealing…' : `Deal · ${totalStake.toLocaleString()} coins`}
                </button>
              </>
            )}

            {isPlayerTurn && (
              <>
                <div className="bet-summary">
                  <div className="row">
                    <span>Hand</span>
                    <span className="mono">{activeHandIndex + 1} of {hands.length}</span>
                  </div>
                  <div className="row">
                    <span>Hand value</span>
                    <span className="mono">{hands[activeHandIndex]?.value ?? '—'}</span>
                  </div>
                  <div className="row">
                    <span>Bet</span>
                    <span className="mono">{activeBet} coins</span>
                  </div>
                </div>

                <div className="card-inset" style={{ padding: 12 }}>
                  <div className="section-title" style={{ marginBottom: 10 }}>Actions</div>
                  <div className="action-row">
                    <button className="btn btn-ghost" disabled={isLoading} onClick={() => void act('hit')}>Hit</button>
                    <button className="btn btn-ghost" disabled={isLoading} onClick={() => void act('stand')}>Stand</button>
                    <button className="btn btn-ghost" disabled={isLoading || !canDouble} onClick={() => void act('double')}>
                      Double · {activeBet}
                    </button>
                    <button className="btn btn-ghost" disabled={isLoading || !canSplit} onClick={() => void act('split')}>Split</button>
                  </div>
                </div>
              </>
            )}

            {isSettled && (
              <>
                <div className="bet-summary">
                  {hands.map((h, i) => {
                    const net = handNet(h);
                    const cls = net > 0 ? 'win' : net < 0 ? 'loss' : 'flat';
                    return (
                      <div className="row" key={i}>
                        <span>Hand {i + 1}{h.isDoubled ? ' (2×)' : ''}</span>
                        <span className={`mono bj-net ${cls}`}>{net > 0 ? '+' : net < 0 ? '−' : ''}{Math.abs(net).toLocaleString()} coins</span>
                      </div>
                    );
                  })}
                  <div className="row" style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                    <span>Net</span>
                    <span className={`mono bj-net ${netClass}`}>{netTotal > 0 ? '+' : netTotal < 0 ? '−' : ''}{Math.abs(netTotal).toLocaleString()} coins</span>
                  </div>
                </div>
                <button className="btn btn-primary place-bet" onClick={store.reset} type="button">
                  Play again
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default BlackjackPage;
