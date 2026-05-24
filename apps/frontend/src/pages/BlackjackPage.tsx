import { useEffect, useState } from 'react';
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
import { useGameSounds } from '../hooks/useGameSounds';
import { apiClient } from '../api/client';

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

// A card that slides+flips in when it first appears.
function DealtCard({ card, flip = false }: { card: Card | 'facedown'; flip?: boolean }) {
  return (
    <motion.div
      initial={flip ? { rotateY: 90, opacity: 0 } : { opacity: 0, y: -28, x: 18, rotate: -7 }}
      animate={{ rotateY: 0, opacity: 1, y: 0, x: 0, rotate: 0 }}
      transition={{ duration: 0.32, ease: 'easeOut' }}
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
          <DealtCard key={`${index}-${i}-${c.suit}-${c.rank}`} card={c} />
        ))}
      </div>
      <div className="bj-hand-foot">
        <span className={`bj-val ${valClass}`}>{hand.value}</span>
        <span>{hand.bet}{hand.isDoubled ? '×2' : ''} V</span>
      </div>
      {badge ? <span className={`bj-outcome ${badge.cls}`}>{badge.text}</span> : null}
    </div>
  );
}

export function BlackjackPage() {
  const store = useBlackjackStore();
  const { playWin, playLoss } = useGameSounds(store.isMuted);
  const balance = useBalanceStore((s) => s.balance);

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

  function playSettleSound(view: BJSessionView) {
    if (view.phase !== 'settled') return;
    const net = view.hands.reduce((s, h) => s + handNet(h), 0);
    if (net > 0) playWin();
    else if (net < 0) playLoss();
  }

  function applySettled(view: BJSessionView) {
    store.applyView(view);
    if (view.newBalance !== undefined) useBalanceStore.getState().setBalance(view.newBalance);
    playSettleSound(view);
  }

  async function handleDeal() {
    if (isLoading) return;
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
          <button className="icon-btn" onClick={store.toggleMute} title={store.isMuted ? 'Unmute' : 'Mute'} style={{ fontSize: 14 }}>{store.isMuted ? '🔇' : '🔊'}</button>
        </div>
      </div>

      {error && <div className="notice loss" style={{ marginBottom: 16, textAlign: 'left' }}>{error}</div>}

      <div className="game-layout">
        <div className="game-stage" style={{ padding: 14 }}>
          <div className="felt">
            <div className="felt-label">STAKELESS · BLACKJACK</div>

            {/* Dealer */}
            <div className="hand-row">
              <div className="hand-label">
                <span>DEALER</span>
                <span className="total">{dealerTotal}</span>
              </div>
              <div className="cards-row">
                {dealerCards.map((c, i) => (
                  <DealtCard key={`dealer-${phase}-${i}`} card={c} flip={isSettled && i === 1} />
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
                    {netTotal > 0 ? '+' : netTotal < 0 ? '−' : ''}{Math.abs(netTotal).toLocaleString()} V
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
                        <span>{betAmount} V</span>
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
                      TOTAL {totalStake.toLocaleString()} V
                    </span>
                  </div>
                </div>

                <button className="btn btn-primary place-bet" disabled={isLoading} onClick={() => void handleDeal()} type="button">
                  {isLoading ? 'Dealing…' : `Deal · ${totalStake.toLocaleString()} V`}
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
                    <span className="mono">{activeBet} V</span>
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
                        <span className={`mono bj-net ${cls}`}>{net > 0 ? '+' : net < 0 ? '−' : ''}{Math.abs(net).toLocaleString()} V</span>
                      </div>
                    );
                  })}
                  <div className="row" style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                    <span>Net</span>
                    <span className={`mono bj-net ${netClass}`}>{netTotal > 0 ? '+' : netTotal < 0 ? '−' : ''}{Math.abs(netTotal).toLocaleString()} V</span>
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
