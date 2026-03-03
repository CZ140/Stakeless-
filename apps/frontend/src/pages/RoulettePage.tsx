import { useState } from 'react';
import { Header } from '../components/Header';
import { RouletteWheel } from '../components/RouletteWheel';
import { RouletteTable } from '../components/RouletteTable';
import { ChipRack } from '../components/ChipRack';
import { ResultOverlay } from '../components/ResultOverlay';
import { HowToPlayModal } from '../components/HowToPlayModal';
import { useRouletteStore } from '../stores/rouletteStore';
import { useBalanceStore } from '../stores/balanceStore';
import { useGameSounds } from '../hooks/useGameSounds';
import { apiClient } from '../api/client';

interface RouletteResponse {
  winningPocket: number;
  profit: number;
  newBalance: number;
}

export function RoulettePage() {
  const { placedChips, gamePhase, isMuted, setGamePhase, clearAll } = useRouletteStore();
  const { playWin, playLoss } = useGameSounds(isMuted);
  const [winningPocket, setWinningPocket] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<{ winningPocket: number; netAmount: number } | null>(null);
  const [showHowTo, setShowHowTo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingBalance, setPendingBalance] = useState<number | null>(null);

  // Suppress unused import warning - useBalanceStore used in getState().setBalance
  void useBalanceStore;

  const totalBet = placedChips.reduce((sum, c) => sum + c.amount, 0);
  const isSpinning = gamePhase === 'spinning';
  const isResult = gamePhase === 'result';

  async function handleSpin() {
    // If result overlay is showing, dismiss it and return to betting phase first.
    // User can then adjust bets and spin again.
    if (isResult) {
      handlePlayAgain();
      return;
    }
    if (totalBet === 0 || isSpinning) return;
    setError(null);
    setGamePhase('spinning');

    try {
      const res = await apiClient.post<RouletteResponse>('/games/roulette/bet', {
        bets: placedChips,
      });
      const { winningPocket: pocket, profit, newBalance } = res.data;

      // Save last bet for Rebet button BEFORE clearing chips
      localStorage.setItem('lastBet_roulette', JSON.stringify(placedChips));

      // Calculate net amount: profit - totalBet
      // (deductBet removed totalBet; profit is pure winnings added back)
      const netAmount = profit - totalBet;

      setWinningPocket(pocket);
      setLastResult({ winningPocket: pocket, netAmount });
      // gamePhase stays 'spinning' - RouletteWheel's onSettled transitions to 'result'
      // Balance update deferred to onSettled to sync with animation end
      setPendingBalance(newBalance);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string }; status?: number } };
      if (axiosErr.response?.status === 402) {
        setError('Insufficient funds to place this bet.');
      } else {
        setError('Something went wrong. Please try again.');
      }
      setGamePhase('betting');
    }
  }

  function handleWheelSettled() {
    // Animation complete - now show result and play sound
    if (pendingBalance !== null) {
      useBalanceStore.getState().setBalance(pendingBalance);
    }
    const net = lastResult?.netAmount ?? 0;
    if (net > 0) playWin();
    else playLoss();
    setGamePhase('result');
    clearAll();
  }

  function handlePlayAgain() {
    setWinningPocket(null);
    setLastResult(null);
    setGamePhase('betting');
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0d0d1a', color: '#ffffff' }}>
      <Header />
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <h1 style={{ margin: 0, color: '#e0d7ff', fontSize: '1.75rem' }}>Roulette</h1>
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

        {error && (
          <div style={{ color: '#ef4444', marginBottom: '16px', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Left: Wheel */}
          <div style={{ position: 'relative', flex: '0 0 auto' }}>
            <RouletteWheel
              winningPocket={winningPocket}
              onSettled={handleWheelSettled}
            />
            <ResultOverlay
              visible={isResult}
              winningPocket={lastResult?.winningPocket ?? null}
              netAmount={lastResult?.netAmount ?? 0}
            />
          </div>

          {/* Right: Table + Controls */}
          <div style={{ flex: 1, minWidth: '300px' }}>
            <RouletteTable disabled={isSpinning || isResult} />
            <div style={{ marginTop: '20px' }}>
              <ChipRack
                onSpin={() => void handleSpin()}
                disabled={isSpinning || isResult}
                spinDisabled={isSpinning}
                showingResult={isResult}
                totalBet={totalBet}
              />
            </div>
          </div>
        </div>
      </main>

      <HowToPlayModal open={showHowTo} onClose={() => setShowHowTo(false)} />
    </div>
  );
}
