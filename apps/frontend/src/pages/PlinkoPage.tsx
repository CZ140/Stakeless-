import { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '../components/Header';
import { usePlinkoStore, type RiskLevel } from '../stores/plinkoStore';
import { useBalanceStore } from '../stores/balanceStore';
import { useGameSounds } from '../hooks/useGameSounds';
import { apiClient } from '../api/client';

// ─── Frontend multiplier table (mirrors backend) ─────────────────────────────
// Used to label bucket columns on the board.
const FRONTEND_MULTIPLIERS: Record<RiskLevel, Record<number, number[]>> = {
  low: {
    8:  [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
    9:  [5.6, 2.0, 1.6, 1.0, 0.7, 0.7, 1.0, 1.6, 2.0, 5.6],
    10: [8.9, 3.0, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 3.0, 8.9],
    11: [8.4, 3.0, 1.9, 1.3, 1.0, 0.7, 0.7, 1.0, 1.3, 1.9, 3.0, 8.4],
    12: [10, 3, 1.4, 1.1, 1.0, 0.5, 0.3, 0.5, 1.0, 1.1, 1.4, 3, 10],
    13: [8.1, 4.0, 3.0, 1.9, 1.2, 0.9, 0.5, 0.5, 0.9, 1.2, 1.9, 3.0, 4.0, 8.1],
    14: [7.1, 4.0, 1.9, 1.4, 1.3, 1.1, 0.7, 0.5, 0.7, 1.1, 1.3, 1.4, 1.9, 4.0, 7.1],
    15: [15, 8.0, 3.0, 2.0, 1.5, 1.1, 1.0, 0.5, 0.5, 1.0, 1.1, 1.5, 2.0, 3.0, 8.0, 15],
    16: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1.0, 0.5, 1.0, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  },
  medium: {
    8:  [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    9:  [18, 4, 1.7, 0.9, 0.5, 0.5, 0.9, 1.7, 4, 18],
    10: [22, 5, 2.0, 1.4, 0.6, 0.4, 0.6, 1.4, 2.0, 5, 22],
    11: [24, 6, 3.0, 1.8, 0.7, 0.5, 0.5, 0.7, 1.8, 3.0, 6, 24],
    12: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    13: [43, 13, 6, 3, 1.3, 0.7, 0.4, 0.4, 0.7, 1.3, 3, 6, 13, 43],
    14: [58, 15, 7, 4, 1.9, 1.0, 0.5, 0.3, 0.5, 1.0, 1.9, 4, 7, 15, 58],
    15: [88, 18, 11, 5, 3, 1.3, 0.5, 0.3, 0.3, 0.5, 1.3, 3, 5, 11, 18, 88],
    16: [110, 41, 10, 5, 3, 1.5, 1.0, 0.5, 0.3, 0.5, 1.0, 1.5, 3, 5, 10, 41, 110],
  },
  high: {
    8:  [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
    9:  [43, 7, 2.0, 0.6, 0.2, 0.2, 0.6, 2.0, 7, 43],
    10: [76, 10, 3.0, 0.9, 0.3, 0.2, 0.3, 0.9, 3.0, 10, 76],
    11: [120, 14, 5.2, 1.4, 0.4, 0.2, 0.2, 0.4, 1.4, 5.2, 14, 120],
    12: [170, 24, 8.1, 2.0, 0.7, 0.2, 0.2, 0.2, 0.7, 2.0, 8.1, 24, 170],
    13: [260, 37, 11, 4, 1.4, 0.4, 0.2, 0.2, 0.4, 1.4, 4, 11, 37, 260],
    14: [420, 56, 18, 5, 2.0, 0.5, 0.2, 0.2, 0.2, 0.5, 2.0, 5, 18, 56, 420],
    15: [620, 83, 27, 8, 3, 0.5, 0.2, 0.2, 0.2, 0.2, 0.5, 3, 8, 27, 83, 620],
    16: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
  expert: {
    8:  [76, 10, 3, 0.3, 0.2, 0.3, 3, 10, 76],
    9:  [100, 15, 4, 0.7, 0.2, 0.2, 0.7, 4, 15, 100],
    10: [200, 30, 8, 1.5, 0.3, 0.2, 0.3, 1.5, 8, 30, 200],
    11: [300, 45, 12, 3, 0.4, 0.2, 0.2, 0.4, 3, 12, 45, 300],
    12: [500, 80, 20, 6, 1.5, 0.2, 0.2, 0.2, 1.5, 6, 20, 80, 500],
    13: [800, 120, 30, 8, 3, 0.3, 0.2, 0.2, 0.3, 3, 8, 30, 120, 800],
    14: [1000, 200, 50, 14, 5, 1.0, 0.2, 0.2, 0.2, 1.0, 5, 14, 50, 200, 1000],
    15: [2000, 300, 80, 20, 8, 2, 0.2, 0.2, 0.2, 0.2, 2, 8, 20, 80, 300, 2000],
    16: [5000, 500, 100, 25, 10, 3, 0.5, 0.2, 0.2, 0.2, 0.5, 3, 10, 25, 100, 500, 5000],
  },
};

interface PlinkoResponse {
  bucket: number;
  multiplier: number;
  profit: number;
  newBalance: number;
}

// ─── Peg Board SVG ────────────────────────────────────────────────────────────

const BOARD_WIDTH = 480;
const BOARD_HEIGHT = 420;
const PEG_RADIUS = 5;
const BALL_RADIUS = 8;
const BUCKET_HEIGHT = 40;
const BOARD_PADDING = 32;

/**
 * Computes peg positions for the given row count.
 * Row r (0-indexed) has (r + 3) pegs centred horizontally.
 */
function computePegs(rows: number) {
  const pegs: Array<{ cx: number; cy: number }> = [];
  const boardInner = BOARD_WIDTH - BOARD_PADDING * 2;
  const rowHeight = (BOARD_HEIGHT - BUCKET_HEIGHT - BOARD_PADDING * 2) / (rows + 1);

  for (let r = 0; r < rows; r++) {
    const pegCount = r + 3;
    const spacing = boardInner / (pegCount - 1);
    const cy = BOARD_PADDING + rowHeight * (r + 1);
    for (let p = 0; p < pegCount; p++) {
      const cx = BOARD_PADDING + spacing * p;
      pegs.push({ cx, cy });
    }
  }
  return pegs;
}

/**
 * Pre-computes a deterministic path from top-centre to the target bucket.
 * Returns an array of (cx, cy) waypoints — one per row of pegs.
 *
 * Algorithm:
 * - The ball needs to end at `targetBucket` (0-indexed, total buckets = rows+1)
 * - At each row, the ball can go left (L) or right (R)
 * - Number of R decisions = targetBucket (standard Galton board mapping)
 * - We distribute R decisions as randomly as possible while satisfying the constraint.
 */
function computeBallPath(rows: number, targetBucket: number): Array<{ cx: number; cy: number }> {
  const boardInner = BOARD_WIDTH - BOARD_PADDING * 2;
  const rowHeight = (BOARD_HEIGHT - BUCKET_HEIGHT - BOARD_PADDING * 2) / (rows + 1);

  // Build decision sequence: exactly targetBucket R's, rest L's, shuffled
  const decisions: boolean[] = [];
  for (let i = 0; i < rows; i++) {
    decisions.push(i < targetBucket);
  }
  // Fisher-Yates shuffle using seeded-ish approach based on bucket
  for (let i = decisions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [decisions[i], decisions[j]] = [decisions[j]!, decisions[i]!];
  }

  const path: Array<{ cx: number; cy: number }> = [];
  let currentCol = 0; // column index in the leftmost peg for each row

  for (let r = 0; r < rows; r++) {
    const pegCount = r + 3;
    const spacing = boardInner / (pegCount - 1);
    // Ball lands on peg at currentCol in this row
    const cx = BOARD_PADDING + spacing * currentCol;
    const cy = BOARD_PADDING + rowHeight * (r + 1);
    path.push({ cx, cy });

    if (decisions[r]) {
      currentCol++; // go right
    }
    // else go left (currentCol stays)
  }

  return path;
}

function getBucketColor(multiplier: number): string {
  if (multiplier >= 10) return '#ef4444'; // red — extreme payout
  if (multiplier >= 3) return '#f59e0b';  // amber — high payout
  if (multiplier >= 1) return '#22c55e';  // green — positive
  return '#6b7280';                       // gray — loss
}

interface PegBoardProps {
  rows: number;
  riskLevel: RiskLevel;
  ballPosition: { cx: number; cy: number } | null;
  winningBucket: number | null;
}

function PegBoard({ rows, riskLevel, ballPosition, winningBucket }: PegBoardProps) {
  const pegs = computePegs(rows);
  const bucketCount = rows + 1;
  const multipliers = FRONTEND_MULTIPLIERS[riskLevel][rows] ?? [];
  const boardInner = BOARD_WIDTH - BOARD_PADDING * 2;
  const bucketWidth = boardInner / bucketCount;
  const bucketY = BOARD_HEIGHT - BUCKET_HEIGHT - 4;

  return (
    <svg
      width={BOARD_WIDTH}
      height={BOARD_HEIGHT}
      style={{ display: 'block', background: '#0d0d1a', borderRadius: '12px', border: '1px solid #2d2d4e' }}
    >
      {/* Pegs */}
      {pegs.map(({ cx, cy }, i) => (
        <circle key={i} cx={cx} cy={cy} r={PEG_RADIUS} fill="#4a4a6e" />
      ))}

      {/* Buckets */}
      {Array.from({ length: bucketCount }, (_, b) => {
        const x = BOARD_PADDING + bucketWidth * b;
        const mult = multipliers[b] ?? 0;
        const isWinner = winningBucket === b;
        return (
          <g key={b}>
            <rect
              x={x + 1}
              y={bucketY}
              width={bucketWidth - 2}
              height={BUCKET_HEIGHT}
              fill={isWinner ? '#7c3aed' : '#1a1a2e'}
              stroke={isWinner ? '#a78bfa' : '#2d2d4e'}
              strokeWidth={1}
              rx={4}
            />
            <text
              x={x + bucketWidth / 2}
              y={bucketY + BUCKET_HEIGHT / 2 + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={isWinner ? '#ffffff' : getBucketColor(mult)}
              fontSize={bucketWidth > 36 ? 10 : 8}
              fontWeight={isWinner ? 700 : 600}
            >
              {mult}×
            </text>
          </g>
        );
      })}

      {/* Ball */}
      {ballPosition && (
        <circle
          cx={ballPosition.cx}
          cy={ballPosition.cy}
          r={BALL_RADIUS}
          fill="#a78bfa"
          style={{ filter: 'drop-shadow(0 0 6px #7c3aed)' }}
        />
      )}
    </svg>
  );
}

// ─── How To Play content for Plinko ──────────────────────────────────────────

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
              style={{ backgroundColor: '#1a1a2e', borderRadius: '16px', padding: '32px', maxWidth: '520px', width: '90vw', maxHeight: '80vh', overflowY: 'auto', pointerEvents: 'auto' }}
            >
              <h2 style={{ color: '#e0d7ff', marginTop: 0, marginBottom: '12px' }}>How to Play Plinko</h2>
              <p style={{ color: '#718096', fontSize: '0.9rem', marginBottom: '16px' }}>
                Drop a ball from the top. It bounces through pegs and lands in a bucket. Each bucket pays a multiplier of your bet.
              </p>
              <h3 style={{ color: '#e0d7ff', fontSize: '1rem', marginBottom: '8px' }}>Risk Levels</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '16px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #2d2d4e' }}>
                    <th style={{ color: '#e0d7ff', textAlign: 'left', paddingBottom: '6px' }}>Level</th>
                    <th style={{ color: '#e0d7ff', textAlign: 'left', paddingBottom: '6px' }}>Distribution</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { level: 'Low', desc: 'Gentle curve — most buckets near 1×, small edge boost' },
                    { level: 'Medium', desc: 'Steeper — center near 0.3×, edges reach 33×+' },
                    { level: 'High', desc: 'Extreme edges — center is 0.2×, edges can be 1000×' },
                    { level: 'Expert', desc: 'Maximum variance — edges up to 5000×, center 0.2×' },
                  ].map(({ level, desc }) => (
                    <tr key={level} style={{ borderBottom: '1px solid #1a1a2e' }}>
                      <td style={{ color: '#a78bfa', padding: '7px 0', fontWeight: 600 }}>{level}</td>
                      <td style={{ color: '#718096', padding: '7px 8px' }}>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3 style={{ color: '#e0d7ff', fontSize: '1rem', marginBottom: '8px' }}>Row Count (8–16)</h3>
              <p style={{ color: '#718096', fontSize: '0.85rem', marginBottom: '16px' }}>
                More rows = more buckets = finer distribution. High row counts emphasise the risk level more.
                The ball path shown is for display only — the outcome is determined server-side securely.
              </p>
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

// ─── Main Page ────────────────────────────────────────────────────────────────

const CHIP_VALUES = [10, 50, 100, 500];
const RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high', 'expert'];
const RISK_LABELS: Record<RiskLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  expert: 'Expert',
};

export function PlinkoPage() {
  const {
    betAmount, rows, riskLevel, gamePhase, isMuted, lastResult,
    setBetAmount, setRows, setRiskLevel, halfBet, doubleBet,
    setGamePhase, toggleMute, setLastResult,
  } = usePlinkoStore();

  const { playWin, playLoss } = useGameSounds(isMuted);
  const [showHowTo, setShowHowTo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ballPosition, setBallPosition] = useState<{ cx: number; cy: number } | null>(null);
  const [winningBucket, setWinningBucket] = useState<number | null>(null);
  const animationRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const balance = useBalanceStore((s) => s.balance);
  const isDropping = gamePhase === 'dropping';
  const isResult = gamePhase === 'result';

  // Cleanup animation timers on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) clearTimeout(animationRef.current);
    };
  }, []);

  const animateBall = useCallback(
    (path: Array<{ cx: number; cy: number }>, targetBucket: number, onComplete: () => void) => {
      const boardInner = BOARD_WIDTH - BOARD_PADDING * 2;
      const bucketCount = rows + 1;
      const bucketWidth = boardInner / bucketCount;
      const bucketCx = BOARD_PADDING + bucketWidth * targetBucket + bucketWidth / 2;
      const bucketCy = BOARD_HEIGHT - BUCKET_HEIGHT / 2 - 4;

      let step = 0;

      const advance = () => {
        if (step < path.length) {
          setBallPosition(path[step]!);
          step++;
          animationRef.current = setTimeout(advance, 80);
        } else {
          // Land in bucket
          setBallPosition({ cx: bucketCx, cy: bucketCy });
          animationRef.current = setTimeout(() => {
            onComplete();
          }, 300);
        }
      };

      advance();
    },
    [rows],
  );

  async function handleDrop() {
    if (isDropping || isResult) return;
    setError(null);
    setWinningBucket(null);
    setBallPosition(null);
    setGamePhase('dropping');
    localStorage.setItem('lastBet_plinko', String(betAmount));

    try {
      const res = await apiClient.post<PlinkoResponse>('/games/plinko/bet', {
        betAmount,
        rows,
        riskLevel,
      });

      const { bucket, multiplier, profit, newBalance } = res.data;

      // Pre-compute display-only ball path that ends at the server-determined bucket
      const path = computeBallPath(rows, bucket);

      animateBall(path, bucket, () => {
        setWinningBucket(bucket);
        setLastResult({ bucket, multiplier, profit });
        useBalanceStore.getState().setBalance(newBalance);
        if (profit > 0) playWin();
        else playLoss();
        setGamePhase('result');
      });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number } };
      if (axiosErr.response?.status === 402) {
        setError('Insufficient funds.');
      } else {
        setError('Something went wrong. Please try again.');
      }
      setBallPosition(null);
      setGamePhase('betting');
    }
  }

  function handlePlayAgain() {
    setWinningBucket(null);
    setBallPosition(null);
    setLastResult(null);
    setGamePhase('betting');
  }

  const netProfit = lastResult?.profit ?? 0;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0d0d1a', color: '#ffffff' }}>
      <Header />
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px' }}>
        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <h1 style={{ margin: 0, color: '#e0d7ff', fontSize: '1.75rem' }}>Plinko</h1>
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

        {/* Two-column layout */}
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Left: Peg board */}
          <div style={{ flex: '0 0 auto', position: 'relative' }}>
            <PegBoard
              rows={rows}
              riskLevel={riskLevel}
              ballPosition={ballPosition}
              winningBucket={isResult ? winningBucket : null}
            />

            {/* Result banner below board */}
            {isResult && lastResult && (
              <div style={{
                marginTop: '12px',
                padding: '16px 24px',
                backgroundColor: '#1a1a2e',
                border: `2px solid ${netProfit > 0 ? '#7c3aed' : '#4a4a6e'}`,
                borderRadius: '12px',
                textAlign: 'center',
                boxShadow: netProfit > 0 ? '0 0 24px rgba(124,58,237,0.3)' : 'none',
              }}>
                <div style={{ fontSize: '0.85rem', color: '#718096', marginBottom: '4px' }}>
                  {lastResult.multiplier}× multiplier
                </div>
                <div style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: netProfit > 0 ? '#a78bfa' : netProfit === 0 ? '#e0d7ff' : '#ef4444',
                  marginBottom: '12px',
                }}>
                  {netProfit > 0 ? `+${netProfit}` : netProfit === 0 ? '+/-0' : `${netProfit}`} coins
                </div>
                <button
                  onClick={handlePlayAgain}
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

          {/* Right: Controls panel */}
          <div style={{ flex: 1, minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Bet amount */}
            <div style={{ backgroundColor: '#1a1a2e', borderRadius: '12px', padding: '16px', border: '1px solid #2d2d4e' }}>
              <label style={{ color: '#718096', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                BET AMOUNT
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                <button
                  onClick={() => setBetAmount(betAmount - 1)}
                  disabled={isDropping}
                  style={btnStyle(isDropping)}
                >
                  -
                </button>
                <input
                  type="number"
                  value={betAmount}
                  min={1}
                  onChange={(e) => setBetAmount(Number(e.target.value))}
                  disabled={isDropping}
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
                  disabled={isDropping}
                  style={btnStyle(isDropping)}
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
                    disabled={isDropping}
                    style={{
                      ...chipBtnStyle(betAmount === v, isDropping),
                    }}
                  >
                    {v}
                  </button>
                ))}
                <button
                  onClick={() => { if (balance !== null) setBetAmount(balance); }}
                  disabled={isDropping || balance === null}
                  style={chipBtnStyle(false, isDropping || balance === null)}
                >
                  Max
                </button>
              </div>

              {/* Half / Double */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={halfBet} disabled={isDropping} style={{ ...btnStyle(isDropping), flex: 1 }}>
                  1/2
                </button>
                <button onClick={doubleBet} disabled={isDropping} style={{ ...btnStyle(isDropping), flex: 1 }}>
                  2×
                </button>
              </div>
            </div>

            {/* Row count */}
            <div style={{ backgroundColor: '#1a1a2e', borderRadius: '12px', padding: '16px', border: '1px solid #2d2d4e' }}>
              <label style={{ color: '#718096', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                ROWS: {rows}
              </label>
              <input
                type="range"
                min={8}
                max={16}
                step={1}
                value={rows}
                disabled={isDropping}
                onChange={(e) => setRows(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#7c3aed', cursor: isDropping ? 'not-allowed' : 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#718096', fontSize: '0.75rem', marginTop: '4px' }}>
                <span>8</span>
                <span>16</span>
              </div>
            </div>

            {/* Risk level */}
            <div style={{ backgroundColor: '#1a1a2e', borderRadius: '12px', padding: '16px', border: '1px solid #2d2d4e' }}>
              <label style={{ color: '#718096', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                RISK LEVEL
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {RISK_LEVELS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRiskLevel(r)}
                    disabled={isDropping}
                    style={{
                      padding: '8px',
                      backgroundColor: riskLevel === r ? '#7c3aed' : '#0d0d1a',
                      color: riskLevel === r ? '#ffffff' : '#e0d7ff',
                      border: `1px solid ${riskLevel === r ? '#7c3aed' : '#2d2d4e'}`,
                      borderRadius: '8px',
                      cursor: isDropping ? 'not-allowed' : 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: riskLevel === r ? 700 : 400,
                      opacity: isDropping ? 0.6 : 1,
                      transition: 'all 0.15s',
                    }}
                  >
                    {RISK_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>

            {/* Drop button */}
            <button
              onClick={() => void handleDrop()}
              disabled={isDropping}
              style={{
                padding: '14px',
                backgroundColor: isDropping ? '#4a4a6e' : '#7c3aed',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                cursor: isDropping ? 'not-allowed' : 'pointer',
                fontSize: '1.1rem',
                fontWeight: 700,
                letterSpacing: '0.05em',
                transition: 'background-color 0.15s',
              }}
            >
              {isDropping ? 'Dropping...' : 'Drop Ball'}
            </button>
          </div>
        </div>
      </main>

      <PlinkoHowToPlay open={showHowTo} onClose={() => setShowHowTo(false)} />
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

export default PlinkoPage;
