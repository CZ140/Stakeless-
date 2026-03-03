import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '../components/Header';
import { BlackjackCard } from '../components/BlackjackCard';
import { useBlackjackStore, type BJOutcome, type Card } from '../stores/blackjackStore';
import { useBalanceStore } from '../stores/balanceStore';
import { useGameSounds } from '../hooks/useGameSounds';
import { apiClient } from '../api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DealNormalResponse {
  sessionId: number;
  playerHand: Card[];
  dealerUpCard: Card;
  playerValue: number;
}

interface DealImmediateResponse {
  outcome: BJOutcome;
  profit: number;
  newBalance: number;
  playerHand: Card[];
  dealerHand: Card[];
}

interface HitSafeResponse {
  card: Card;
  playerHand: Card[];
  playerValue: number;
  busted: false;
}

interface HitBustResponse {
  card: Card;
  playerHand: Card[];
  playerValue: number;
  busted: true;
  outcome: 'player_bust';
  newBalance: number;
}

interface StandResponse {
  dealerHand: Card[];
  dealerValue: number;
  outcome: string;
  newBalance: number;
}

interface DoubleResponse {
  card: Card;
  playerHand: Card[];
  dealerHand: Card[];
  outcome: string;
  newBalance: number;
  dealerValue: number;
}

interface ActiveSessionResponse {
  session: null | {
    sessionId: number;
    playerHand: Card[];
    dealerUpCard: Card;
    dealerHand?: Card[];
    playerValue: number;
    phase: string;
    outcome?: BJOutcome;
    newBalance?: number;
  };
}

// ─── How To Play Modal ────────────────────────────────────────────────────────

function BlackjackHowToPlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="bj-htplay-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 200 }}
          />
          <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 201, pointerEvents: 'none' }}>
            <motion.div
              key="bj-htplay-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              style={{ backgroundColor: '#1a1a2e', borderRadius: '16px', padding: '32px', maxWidth: '520px', width: '90vw', maxHeight: '80vh', overflowY: 'auto', pointerEvents: 'auto' }}
            >
              <h2 style={{ color: '#e0d7ff', marginTop: 0, marginBottom: '12px' }}>How to Play Blackjack</h2>
              <p style={{ color: '#718096', fontSize: '0.9rem', marginBottom: '16px' }}>
                Beat the dealer by getting closer to 21 without going over.
                Face cards (J, Q, K) are worth 10. Aces are worth 11 or 1.
              </p>
              <h3 style={{ color: '#e0d7ff', fontSize: '1rem', marginBottom: '8px' }}>Payouts</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '16px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #2d2d4e' }}>
                    <th style={{ color: '#e0d7ff', textAlign: 'left', paddingBottom: '6px' }}>Result</th>
                    <th style={{ color: '#e0d7ff', textAlign: 'right', paddingBottom: '6px' }}>Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { result: 'Natural Blackjack (A + 10-value on deal)', payout: '3:2' },
                    { result: 'Player wins', payout: '1:1' },
                    { result: 'Push (tie)', payout: 'Bet returned' },
                    { result: 'Player busts or dealer wins', payout: 'Bet lost' },
                  ].map(({ result, payout }) => (
                    <tr key={result} style={{ borderBottom: '1px solid #1a1a2e' }}>
                      <td style={{ color: '#e0d7ff', padding: '7px 0', fontSize: '0.85rem' }}>{result}</td>
                      <td style={{ color: '#a78bfa', textAlign: 'right', padding: '7px 0', fontWeight: 700 }}>{payout}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3 style={{ color: '#e0d7ff', fontSize: '1rem', marginBottom: '8px' }}>Rules</h3>
              <ul style={{ color: '#718096', fontSize: '0.85rem', paddingLeft: '18px', marginBottom: '16px' }}>
                <li>Dealer stands on hard 17, hits on soft 17 (Ace + 6)</li>
                <li>Double Down: double your bet, receive exactly one more card</li>
                <li>No split or insurance in v1.0</li>
                <li>One deck, reshuffled each hand</li>
              </ul>
              <button
                onClick={onClose}
                style={{ padding: '10px 24px', backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 }}
              >
                Got It
              </button>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Outcome Banner ───────────────────────────────────────────────────────────

function getOutcomeDisplay(outcome: BJOutcome): { text: string; color: string } {
  switch (outcome) {
    case 'player_blackjack': return { text: 'Blackjack! 3:2 Payout', color: '#f59e0b' };
    case 'player_win':       return { text: 'You Win!',              color: '#22c55e' };
    case 'dealer_bust':      return { text: 'Dealer Busts — You Win!', color: '#22c55e' };
    case 'push':             return { text: 'Push — Bet Returned',   color: '#3b82f6' };
    case 'player_bust':      return { text: 'Bust! Bet Lost',        color: '#ef4444' };
    case 'dealer_win':       return { text: 'Dealer Wins',           color: '#ef4444' };
    default:                 return { text: '',                       color: '#ffffff' };
  }
}

// ─── Style helpers ────────────────────────────────────────────────────────────

function actionBtnStyle(disabled: boolean, color = '#7c3aed'): React.CSSProperties {
  return {
    flex: 1,
    padding: '12px 8px',
    backgroundColor: disabled ? '#4a4a6e' : color,
    color: '#ffffff',
    border: 'none',
    borderRadius: '10px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '0.95rem',
    fontWeight: 700,
    opacity: disabled ? 0.6 : 1,
    transition: 'background-color 0.15s',
  };
}

function chipBtnStyle(active: boolean, disabled: boolean): React.CSSProperties {
  return {
    padding: '5px 10px',
    backgroundColor: active ? '#7c3aed' : '#0d0d1a',
    color: active ? '#ffffff' : '#e0d7ff',
    border: `1px solid ${active ? '#7c3aed' : '#2d2d4e'}`,
    borderRadius: '6px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '0.8rem',
    fontWeight: active ? 700 : 400,
    opacity: disabled ? 0.5 : 1,
  };
}

function halfDoubleBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '6px 14px',
    backgroundColor: '#0d0d1a',
    color: '#e0d7ff',
    border: '1px solid #2d2d4e',
    borderRadius: '6px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '0.9rem',
    opacity: disabled ? 0.5 : 1,
  };
}

// ─── Hand display ─────────────────────────────────────────────────────────────

function HandArea({
  label,
  valueLabel,
  cards,
  showFacedown,
  newCardIndex,
}: {
  label: string;
  valueLabel: string;
  cards: Card[];
  showFacedown?: boolean;   // render an extra face-down card after the real cards
  newCardIndex?: number;    // index of the most-recently-added card (to animate)
}) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ color: '#718096', fontSize: '0.85rem', fontWeight: 600 }}>{label}</span>
        <span
          style={{
            backgroundColor: '#2d2d4e',
            color: '#e0d7ff',
            borderRadius: '999px',
            padding: '2px 10px',
            fontSize: '0.8rem',
            fontWeight: 700,
          }}
        >
          {valueLabel}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {cards.map((card, i) => (
          <BlackjackCard
            key={i}
            card={card}
            animateIn={i === newCardIndex}
          />
        ))}
        {showFacedown && (
          <BlackjackCard card="facedown" animateIn={cards.length === 0} />
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const CHIP_VALUES = [10, 50, 100, 500];

export function BlackjackPage() {
  const store = useBlackjackStore();
  const { playWin, playLoss } = useGameSounds(store.isMuted);
  const balance = useBalanceStore((s) => s.balance);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHowTo, setShowHowTo] = useState(false);
  // Track the index of newly added player card to animate it
  const [newPlayerCardIndex, setNewPlayerCardIndex] = useState<number | undefined>(undefined);

  // Session restore on mount
  useEffect(() => {
    apiClient.get<ActiveSessionResponse>('/games/blackjack/active-session').then((res) => {
      const { session } = res.data;
      if (!session) return;
      if (session.phase === 'settled' && session.outcome) {
        // Disconnected — server auto-completed hand — show result
        store.settleImmediate(session.outcome, session.newBalance ?? 0, session.playerHand, session.dealerHand ?? []);
        if (session.newBalance !== undefined) useBalanceStore.getState().setBalance(session.newBalance);
      } else if (session.phase === 'player_turn') {
        store.dealHand(session.sessionId, session.playerHand, session.dealerUpCard, session.playerValue);
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { betAmount, gamePhase, sessionId, playerHand, dealerUpCard, dealerHand, playerValue, dealerValue, outcome } = store;

  const isBetting = gamePhase === 'betting';
  const isPlayerTurn = gamePhase === 'player_turn';
  const isSettled = gamePhase === 'settled';
  const controlsDisabled = isLoading || !isPlayerTurn;

  // ─── handleDeal ─────────────────────────────────────────────────────────────
  async function handleDeal() {
    if (isLoading) return;
    setError(null);
    setNewPlayerCardIndex(undefined);
    localStorage.setItem('lastBet_blackjack', String(betAmount));
    setIsLoading(true);

    try {
      const res = await apiClient.post<DealNormalResponse | DealImmediateResponse>(
        '/games/blackjack/deal',
        { betAmount },
      );

      const data = res.data as DealNormalResponse & DealImmediateResponse;

      if (data.outcome) {
        // Immediate result (natural blackjack or both blackjack)
        const immediate = data as DealImmediateResponse;
        store.settleImmediate(immediate.outcome, immediate.newBalance, immediate.playerHand, immediate.dealerHand);
        useBalanceStore.getState().setBalance(immediate.newBalance);
        if (immediate.outcome === 'push') {
          playWin();
        } else if (immediate.outcome === 'player_blackjack') {
          playWin();
        } else {
          playLoss();
        }
      } else {
        // Normal deal
        const normal = data as DealNormalResponse;
        store.dealHand(normal.sessionId, normal.playerHand, normal.dealerUpCard, normal.playerValue);
        // Animate both player cards on deal (last one = index 1)
        setNewPlayerCardIndex(1);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number } };
      if (axiosErr.response?.status === 402) {
        setError('Insufficient funds.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  // ─── handleHit ──────────────────────────────────────────────────────────────
  async function handleHit() {
    if (controlsDisabled || sessionId === null) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiClient.post<HitSafeResponse | HitBustResponse>(
        '/games/blackjack/hit',
        { sessionId },
      );

      const data = res.data;
      const newIndex = playerHand.length; // index of the card about to be added
      store.addPlayerCard(data.card, data.playerValue);
      setNewPlayerCardIndex(newIndex);

      if (data.busted) {
        const bust = data as HitBustResponse;
        store.revealDealerHand([], 0, 'player_bust');
        useBalanceStore.getState().setBalance(bust.newBalance);
        playLoss();
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  // ─── handleStand ────────────────────────────────────────────────────────────
  async function handleStand() {
    if (controlsDisabled || sessionId === null) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiClient.post<StandResponse>('/games/blackjack/stand', { sessionId });
      const { dealerHand: dHand, dealerValue: dValue, outcome: result, newBalance } = res.data;

      // Brief pause for drama before revealing
      await new Promise((resolve) => setTimeout(resolve, 300));

      store.revealDealerHand(dHand, dValue, result as BJOutcome);
      useBalanceStore.getState().setBalance(newBalance);

      if (result === 'player_win' || result === 'dealer_bust' || result === 'push' || result === 'player_blackjack') {
        playWin();
      } else {
        playLoss();
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  // ─── handleDouble ───────────────────────────────────────────────────────────
  async function handleDouble() {
    if (controlsDisabled || sessionId === null) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiClient.post<DoubleResponse>('/games/blackjack/double', { sessionId });
      const { card, playerHand: pHand, dealerHand: dHand, outcome: result, newBalance, dealerValue: dValue } = res.data;

      // Add the one extra player card with animation
      const newIndex = playerHand.length;
      store.addPlayerCard(card, 0); // playerValue will be overridden by revealDealerHand
      setNewPlayerCardIndex(newIndex);

      // Pause to show player card before dealer reveal
      await new Promise((resolve) => setTimeout(resolve, 500));

      store.revealDealerHand(dHand, dValue, result as BJOutcome);
      useBalanceStore.getState().setBalance(newBalance);

      if (result === 'player_win' || result === 'dealer_bust' || result === 'push' || result === 'player_blackjack') {
        playWin();
      } else {
        playLoss();
      }

      // Update player hand to reflect final server state
      void pHand; // already reflected via addPlayerCard
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number } };
      if (axiosErr.response?.status === 402) {
        setError('Insufficient funds for double down.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const outcomeDisplay = outcome ? getOutcomeDisplay(outcome) : null;

  // Decide what to show for dealer during player turn vs settled
  const dealerCards: Card[] = isSettled && dealerHand
    ? dealerHand
    : dealerUpCard
      ? [dealerUpCard]
      : [];

  const dealerValueLabel = isSettled && dealerValue !== null
    ? String(dealerValue)
    : '?';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0d0d1a', color: '#ffffff' }}>
      <Header />
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <h1 style={{ margin: 0, color: '#e0d7ff', fontSize: '1.75rem' }}>Blackjack</h1>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={store.toggleMute}
              title={store.isMuted ? 'Unmute' : 'Mute'}
              style={{
                padding: '8px 12px',
                backgroundColor: '#1a1a2e',
                color: '#e0d7ff',
                border: '1px solid #2d2d4e',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              {store.isMuted ? '🔇' : '🔊'}
            </button>
            <button
              onClick={() => setShowHowTo(true)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#1a1a2e',
                color: '#e0d7ff',
                border: '1px solid #2d2d4e',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              ?
            </button>
          </div>
        </div>

        {error && (
          <div style={{ color: '#ef4444', marginBottom: '16px', fontSize: '0.9rem' }}>{error}</div>
        )}

        {/* Card table area — only shown once a hand is in progress or settled */}
        {(isPlayerTurn || isSettled) && (
          <div
            style={{
              backgroundColor: '#1a3a1a',
              borderRadius: '16px',
              padding: '24px',
              border: '2px solid #2d5a2d',
              marginBottom: '24px',
              boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
            }}
          >
            {/* Dealer area */}
            <div style={{ marginBottom: '24px' }}>
              <HandArea
                label="Dealer"
                valueLabel={dealerValueLabel}
                cards={dealerCards}
                showFacedown={isPlayerTurn}
                newCardIndex={undefined}
              />
            </div>

            <div style={{ borderTop: '1px solid #2d5a2d', marginBottom: '24px' }} />

            {/* Player area */}
            <HandArea
              label="Player"
              valueLabel={String(playerValue)}
              cards={playerHand}
              newCardIndex={newPlayerCardIndex}
            />
          </div>
        )}

        {/* Outcome banner */}
        <AnimatePresence>
          {isSettled && outcomeDisplay && (
            <motion.div
              key="bj-outcome"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{
                textAlign: 'center',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: outcomeDisplay.color,
                marginBottom: '20px',
                padding: '16px',
                backgroundColor: '#1a1a2e',
                borderRadius: '12px',
                border: `2px solid ${outcomeDisplay.color}`,
                boxShadow: `0 0 20px ${outcomeDisplay.color}40`,
              }}
            >
              {outcomeDisplay.text}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons — Hit, Stand, Double Down — visible during player turn */}
        {isPlayerTurn && (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            <button
              onClick={() => void handleHit()}
              disabled={controlsDisabled}
              style={actionBtnStyle(controlsDisabled, '#16a34a')}
            >
              Hit
            </button>
            <button
              onClick={() => void handleStand()}
              disabled={controlsDisabled}
              style={actionBtnStyle(controlsDisabled, '#7c3aed')}
            >
              Stand
            </button>
            <button
              onClick={() => void handleDouble()}
              disabled={controlsDisabled}
              style={actionBtnStyle(controlsDisabled, '#b45309')}
            >
              2x {betAmount * 2}
            </button>
          </div>
        )}

        {/* Play Again button — settled phase */}
        {isSettled && (
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <button
              onClick={store.resetToConfig}
              style={{
                padding: '12px 36px',
                backgroundColor: '#7c3aed',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 700,
              }}
            >
              Play Again
            </button>
          </div>
        )}

        {/* Betting panel — shown during betting phase */}
        {isBetting && (
          <div style={{ backgroundColor: '#1a1a2e', borderRadius: '12px', padding: '24px', border: '1px solid #2d2d4e' }}>
            <label style={{ color: '#718096', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '10px' }}>
              BET AMOUNT
            </label>

            {/* Numeric input */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
              <button
                onClick={() => store.setBetAmount(betAmount - 1)}
                style={halfDoubleBtnStyle(false)}
              >
                -
              </button>
              <input
                type="number"
                value={betAmount}
                min={1}
                onChange={(e) => store.setBetAmount(Number(e.target.value))}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  backgroundColor: '#0d0d1a',
                  color: '#e0d7ff',
                  border: '1px solid #2d2d4e',
                  borderRadius: '6px',
                  padding: '8px',
                  fontSize: '1.1rem',
                  fontWeight: 600,
                }}
              />
              <button
                onClick={() => store.setBetAmount(betAmount + 1)}
                style={halfDoubleBtnStyle(false)}
              >
                +
              </button>
            </div>

            {/* Chip quick-select */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
              {CHIP_VALUES.map((v) => (
                <button
                  key={v}
                  onClick={() => store.setBetAmount(v)}
                  style={chipBtnStyle(betAmount === v, false)}
                >
                  {v}
                </button>
              ))}
              <button
                onClick={() => { if (balance !== null) store.setBetAmount(balance); }}
                disabled={balance === null}
                style={chipBtnStyle(false, balance === null)}
              >
                Max
              </button>
            </div>

            {/* Half / Double */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <button onClick={store.halfBet} style={halfDoubleBtnStyle(false)}>
                1/2
              </button>
              <button onClick={store.doubleBet} style={halfDoubleBtnStyle(false)}>
                2x
              </button>
            </div>

            {/* Deal button */}
            <button
              onClick={() => void handleDeal()}
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: isLoading ? '#4a4a6e' : '#7c3aed',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontSize: '1.1rem',
                fontWeight: 700,
                letterSpacing: '0.05em',
                transition: 'background-color 0.15s',
              }}
            >
              {isLoading ? 'Dealing...' : 'Deal'}
            </button>
          </div>
        )}
      </main>

      <BlackjackHowToPlay open={showHowTo} onClose={() => setShowHowTo(false)} />
    </div>
  );
}

export default BlackjackPage;
