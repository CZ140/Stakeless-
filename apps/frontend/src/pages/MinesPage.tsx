import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '../components/Header';
import { useMinesStore } from '../stores/minesStore';
import { useBalanceStore } from '../stores/balanceStore';
import { useGameSounds } from '../hooks/useGameSounds';
import { apiClient } from '../api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StartResponse {
  sessionId: number;
}

interface TileHitFalse {
  hit: false;
  gem: true;
  currentMultiplier: number;
  tilesRevealed: number;
}

interface TileHitTrue {
  hit: true;
  mineGrid: boolean[];
}

type TileResponse = TileHitFalse | TileHitTrue;

interface CashoutResponse {
  payout: number;
  newBalance: number;
  mineGrid: boolean[];
}

interface ActiveSessionResponse {
  session: null | {
    sessionId: number;
    tilesRevealed: number;
    revealed: number[];
    mineCount: number;
    multiplier: number;
    betAmount: number;
  };
}

// ─── How To Play modal ────────────────────────────────────────────────────────

function MinesHowToPlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="mines-htplay-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 200 }}
          />
          <div
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 201,
              pointerEvents: 'none',
            }}
          >
            <motion.div
              key="mines-htplay-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              style={{
                backgroundColor: '#1a1a2e',
                borderRadius: '16px',
                padding: '32px',
                maxWidth: '520px',
                width: '90vw',
                maxHeight: '80vh',
                overflowY: 'auto',
                pointerEvents: 'auto',
              }}
            >
              <h2 style={{ color: '#e0d7ff', marginTop: 0, marginBottom: '12px' }}>How to Play Mines</h2>
              <p style={{ color: '#718096', fontSize: '0.9rem', marginBottom: '16px' }}>
                A 5x5 grid hides mines. Click tiles to reveal gems — each safe tile increases your
                multiplier. Cash out any time to lock in your winnings. Hit a mine and lose your bet.
              </p>
              <h3 style={{ color: '#e0d7ff', fontSize: '1rem', marginBottom: '8px' }}>Mine Count</h3>
              <p style={{ color: '#718096', fontSize: '0.85rem', marginBottom: '16px' }}>
                Choose 1–24 mines. More mines = higher multiplier per safe tile, but greater risk.
                The mine layout is determined server-side — you never know where mines are until
                you reveal them or cash out.
              </p>
              <h3 style={{ color: '#e0d7ff', fontSize: '1rem', marginBottom: '8px' }}>Cash Out</h3>
              <p style={{ color: '#718096', fontSize: '0.85rem', marginBottom: '16px' }}>
                The Cash Out button shows your current multiplier. Click it any time after revealing at
                least one gem to collect your winnings. The full grid reveals on cashout so you can
                see where the mines were hidden.
              </p>
              <button
                onClick={onClose}
                style={{
                  padding: '10px 24px',
                  backgroundColor: '#7c3aed',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                }}
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

// ─── Tile Grid ────────────────────────────────────────────────────────────────

interface TileGridProps {
  revealed: number[];
  mineGrid: boolean[] | null;
  gamePhase: 'betting' | 'active' | 'result';
  isLoading: boolean;
  onTileClick: (row: number, col: number) => void;
}

function TileGrid({ revealed, mineGrid, gamePhase, isLoading, onTileClick }: TileGridProps) {
  const disabled = isLoading || gamePhase !== 'active';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '6px',
        padding: '16px',
        backgroundColor: '#0d0d1a',
        borderRadius: '12px',
        border: '1px solid #2d2d4e',
        width: '320px',
      }}
    >
      {Array.from({ length: 25 }, (_, i) => {
        const row = Math.floor(i / 5);
        const col = i % 5;
        const isRevealed = revealed.includes(i);
        const isMine = mineGrid != null && mineGrid[i] === true;

        let bgColor = '#1a1a2e';
        let label = '';
        let glowStyle = '';

        if (isRevealed) {
          bgColor = '#22c55e';
          label = '♦';
        } else if (isMine) {
          bgColor = '#ef4444';
          label = '💣';
        }

        return (
          <button
            key={i}
            onClick={() => !disabled && !isRevealed && !isMine && onTileClick(row, col)}
            disabled={disabled || isRevealed || isMine}
            title={!isRevealed && !isMine && !disabled ? '?' : undefined}
            style={{
              width: '52px',
              height: '52px',
              backgroundColor: bgColor,
              border: `2px solid ${isRevealed ? '#16a34a' : isMine ? '#b91c1c' : '#2d2d4e'}`,
              borderRadius: '8px',
              cursor: disabled || isRevealed || isMine ? 'default' : 'pointer',
              fontSize: isRevealed ? '1.25rem' : '1rem',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s, box-shadow 0.15s',
              boxShadow: isRevealed
                ? '0 0 8px rgba(34, 197, 94, 0.6)'
                : isMine
                ? '0 0 8px rgba(239, 68, 68, 0.6)'
                : 'none',
              opacity: disabled && !isRevealed && !isMine ? 0.7 : 1,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
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

const CHIP_VALUES = [10, 50, 100, 500];
const MINE_PRESETS = [1, 3, 5, 10, 24];

// ─── Main Page ────────────────────────────────────────────────────────────────

export function MinesPage() {
  const {
    betAmount,
    mineCount,
    gamePhase,
    sessionId,
    revealed,
    tilesRevealed,
    multiplier,
    isMuted,
    result,
    mineGrid,
    setBetAmount,
    setMineCount,
    halfBet,
    doubleBet,
    startRound,
    revealTile,
    setResult,
    restoreSession,
    resetToConfig,
    toggleMute,
  } = useMinesStore();

  const { playWin, playLoss } = useGameSounds(isMuted);
  const [showHowTo, setShowHowTo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const balance = useBalanceStore((s) => s.balance);

  // Session restore on mount
  useEffect(() => {
    apiClient
      .get<ActiveSessionResponse>('/games/mines/active-session')
      .then((res) => {
        const { session } = res.data;
        if (session) {
          restoreSession(session);
        }
      })
      .catch(() => {
        // No active session — stay in betting phase
      });
  }, []);

  async function handleStart() {
    setError(null);
    localStorage.setItem('lastBet_mines', String(betAmount));
    try {
      const res = await apiClient.post<StartResponse>('/games/mines/start', {
        betAmount,
        mineCount,
      });
      startRound(res.data.sessionId);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number } };
      if (axiosErr.response?.status === 402) {
        setError('Insufficient funds.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    }
  }

  async function handleTileClick(row: number, col: number) {
    if (!sessionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.post<TileResponse>('/games/mines/tile', {
        sessionId,
        row,
        col,
      });
      const data = res.data;
      if (!data.hit) {
        const tileIndex = row * 5 + col;
        revealTile(tileIndex, data.currentMultiplier);
      } else {
        setResult({ won: false, payout: 0, mineGrid: data.mineGrid });
        playLoss();
        // Balance not updated: bet was already deducted on start, no payout on mine hit
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number } };
      setError(axiosErr.response?.status === 400 ? 'Invalid tile selection.' : 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCashOut() {
    if (!sessionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.post<CashoutResponse>('/games/mines/cashout', { sessionId });
      setResult({ won: true, payout: res.data.payout, mineGrid: res.data.mineGrid });
      useBalanceStore.getState().setBalance(res.data.newBalance);
      playWin();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number } };
      setError(axiosErr.response?.status === 400 ? 'Cannot cash out yet.' : 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  }

  const isConfigPhase = gamePhase === 'betting';
  const isActivePhase = gamePhase === 'active';
  const isResultPhase = gamePhase === 'result';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0d0d1a', color: '#ffffff' }}>
      <Header />
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px' }}>
        {/* Page header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '24px',
          }}
        >
          <h1 style={{ margin: 0, color: '#e0d7ff', fontSize: '1.75rem' }}>Mines</h1>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={toggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
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
              {isMuted ? '🔇' : '🔊'}
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
              How to Play
            </button>
          </div>
        </div>

        {error && (
          <div style={{ color: '#ef4444', marginBottom: '16px', fontSize: '0.9rem' }}>{error}</div>
        )}

        {/* Two-column layout: left = grid + cashout; right = config/stats */}
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* Left: Tile grid + Cash Out button */}
          <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <TileGrid
              revealed={revealed}
              mineGrid={mineGrid}
              gamePhase={gamePhase}
              isLoading={isLoading}
              onTileClick={(row, col) => void handleTileClick(row, col)}
            />

            {/* Cash Out button (active phase, at least one tile revealed) */}
            {isActivePhase && tilesRevealed > 0 && (
              <button
                onClick={() => void handleCashOut()}
                disabled={isLoading}
                style={{
                  padding: '16px',
                  backgroundColor: '#7c3aed',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  fontSize: '1.15rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  boxShadow: '0 0 20px #7c3aed',
                  transition: 'opacity 0.15s',
                  opacity: isLoading ? 0.7 : 1,
                  width: '320px',
                }}
              >
                Cash Out {multiplier.toFixed(2)}x
              </button>
            )}

            {/* Result banner */}
            {isResultPhase && result && (
              <div
                style={{
                  padding: '20px',
                  backgroundColor: '#1a1a2e',
                  border: `2px solid ${result.won ? '#7c3aed' : '#ef4444'}`,
                  borderRadius: '12px',
                  textAlign: 'center',
                  boxShadow: result.won ? '0 0 24px rgba(124,58,237,0.3)' : '0 0 24px rgba(239,68,68,0.15)',
                  width: '320px',
                }}
              >
                {result.won ? (
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#22c55e', marginBottom: '12px' }}>
                    Cashed out for {result.payout} coins!
                  </div>
                ) : (
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ef4444', marginBottom: '12px' }}>
                    You hit a mine! Bet lost.
                  </div>
                )}
                <button
                  onClick={resetToConfig}
                  style={{
                    padding: '10px 28px',
                    backgroundColor: '#7c3aed',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                  }}
                >
                  Play Again
                </button>
              </div>
            )}
          </div>

          {/* Right: Config panel or Stats panel */}
          <div style={{ flex: 1, minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Bet amount */}
            <div
              style={{
                backgroundColor: '#1a1a2e',
                borderRadius: '12px',
                padding: '16px',
                border: '1px solid #2d2d4e',
              }}
            >
              <label
                style={{
                  color: '#718096',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  display: 'block',
                  marginBottom: '8px',
                }}
              >
                BET AMOUNT
              </label>
              <div
                style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}
              >
                <button
                  onClick={() => setBetAmount(betAmount - 1)}
                  disabled={!isConfigPhase}
                  style={btnStyle(!isConfigPhase)}
                >
                  -
                </button>
                <input
                  type="number"
                  value={betAmount}
                  min={1}
                  onChange={(e) => setBetAmount(Number(e.target.value))}
                  disabled={!isConfigPhase}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    backgroundColor: '#0d0d1a',
                    color: '#e0d7ff',
                    border: '1px solid #2d2d4e',
                    borderRadius: '6px',
                    padding: '6px',
                    fontSize: '1rem',
                    fontWeight: 600,
                  }}
                />
                <button
                  onClick={() => setBetAmount(betAmount + 1)}
                  disabled={!isConfigPhase}
                  style={btnStyle(!isConfigPhase)}
                >
                  +
                </button>
              </div>

              {/* Chip quick-select */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                {CHIP_VALUES.map((v) => (
                  <button
                    key={v}
                    onClick={() => setBetAmount(v)}
                    disabled={!isConfigPhase}
                    style={chipBtnStyle(betAmount === v, !isConfigPhase)}
                  >
                    {v}
                  </button>
                ))}
                <button
                  onClick={() => { if (balance !== null) setBetAmount(balance); }}
                  disabled={!isConfigPhase || balance === null}
                  style={chipBtnStyle(false, !isConfigPhase || balance === null)}
                >
                  Max
                </button>
              </div>

              {/* Half / Double */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={halfBet}
                  disabled={!isConfigPhase}
                  style={{ ...btnStyle(!isConfigPhase), flex: 1 }}
                >
                  1/2
                </button>
                <button
                  onClick={doubleBet}
                  disabled={!isConfigPhase}
                  style={{ ...btnStyle(!isConfigPhase), flex: 1 }}
                >
                  2x
                </button>
              </div>
            </div>

            {/* Mine count */}
            <div
              style={{
                backgroundColor: '#1a1a2e',
                borderRadius: '12px',
                padding: '16px',
                border: '1px solid #2d2d4e',
              }}
            >
              <label
                style={{
                  color: '#718096',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  display: 'block',
                  marginBottom: '8px',
                }}
              >
                MINES: {mineCount}
              </label>
              <div
                style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}
              >
                <button
                  onClick={() => setMineCount(mineCount - 1)}
                  disabled={!isConfigPhase || mineCount <= 1}
                  style={btnStyle(!isConfigPhase || mineCount <= 1)}
                >
                  -
                </button>
                <input
                  type="number"
                  value={mineCount}
                  min={1}
                  max={24}
                  onChange={(e) => setMineCount(Number(e.target.value))}
                  disabled={!isConfigPhase}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    backgroundColor: '#0d0d1a',
                    color: '#e0d7ff',
                    border: '1px solid #2d2d4e',
                    borderRadius: '6px',
                    padding: '6px',
                    fontSize: '1rem',
                    fontWeight: 600,
                  }}
                />
                <button
                  onClick={() => setMineCount(mineCount + 1)}
                  disabled={!isConfigPhase || mineCount >= 24}
                  style={btnStyle(!isConfigPhase || mineCount >= 24)}
                >
                  +
                </button>
              </div>

              {/* Mine count presets */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {MINE_PRESETS.map((v) => (
                  <button
                    key={v}
                    onClick={() => setMineCount(v)}
                    disabled={!isConfigPhase}
                    style={chipBtnStyle(mineCount === v, !isConfigPhase)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Stats (active / result phase) */}
            {(isActivePhase || isResultPhase) && (
              <div
                style={{
                  backgroundColor: '#1a1a2e',
                  borderRadius: '12px',
                  padding: '16px',
                  border: '1px solid #2d2d4e',
                }}
              >
                <div
                  style={{
                    color: '#718096',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    marginBottom: '12px',
                  }}
                >
                  ROUND STATS
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <StatRow label="Bet" value={`${betAmount} coins`} />
                  <StatRow
                    label="Multiplier"
                    value={`${multiplier.toFixed(2)}x`}
                    highlight={multiplier > 1}
                  />
                  <StatRow label="Tiles Safe" value={String(tilesRevealed)} />
                  <StatRow label="Mines" value={String(mineCount)} />
                </div>
              </div>
            )}

            {/* Start Round button */}
            {isConfigPhase && (
              <button
                onClick={() => void handleStart()}
                style={{
                  padding: '14px',
                  backgroundColor: '#7c3aed',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  transition: 'background-color 0.15s',
                }}
              >
                Start Round
              </button>
            )}
          </div>
        </div>
      </main>

      <MinesHowToPlay open={showHowTo} onClose={() => setShowHowTo(false)} />
    </div>
  );
}

// ─── Stat row helper ──────────────────────────────────────────────────────────

function StatRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: '#718096', fontSize: '0.85rem' }}>{label}</span>
      <span
        style={{
          color: highlight ? '#a78bfa' : '#e0d7ff',
          fontSize: '0.9rem',
          fontWeight: highlight ? 700 : 400,
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default MinesPage;
