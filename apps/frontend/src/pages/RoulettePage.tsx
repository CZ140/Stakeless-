import { useShallow } from 'zustand/react/shallow';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '../components/vault/AppShell';
import { RouletteWheel } from '../components/RouletteWheel';
import { ResultOverlay } from '../components/ResultOverlay';
import { HowToPlayModal } from '../components/HowToPlayModal';
import { useRouletteStore, getPocketColor, type BetZone, type PlacedChip } from '../stores/rouletteStore';
import { useBalanceStore } from '../stores/balanceStore';
import { useAudioStore } from '../stores/audioStore';
import { sound } from '../lib/sound';
import { celebrate, winTier } from '../lib/juice';
import { apiClient } from '../api/client';
import { XIcon } from '../components/vault/icons';

interface RouletteResponse {
  winningPocket: number;
  profit: number;
  newBalance: number;
}

const CHIP_AMOUNTS = [10, 50, 100, 500] as const;

function zoneLabel(zone: string): string {
  if (zone.startsWith('number_')) return zone.slice(7);
  if (zone.startsWith('dozen_')) return ['1st 12', '2nd 12', '3rd 12'][+zone.slice(6) - 1] ?? zone;
  if (zone.startsWith('col_')) return `Col ${zone.slice(4)}`;
  return zone.charAt(0).toUpperCase() + zone.slice(1);
}

export function RoulettePage() {
  const {
    placedChips, selectedChip, setSelectedChip, placeChip,
    undoLast, clearAll, halfBet, doubleBet, rebet,
    gamePhase, setGamePhase, addToHistory, history,
  } = useRouletteStore(useShallow((s) => ({ placedChips: s.placedChips, selectedChip: s.selectedChip, setSelectedChip: s.setSelectedChip, placeChip: s.placeChip, undoLast: s.undoLast, clearAll: s.clearAll, halfBet: s.halfBet, doubleBet: s.doubleBet, rebet: s.rebet, gamePhase: s.gamePhase, setGamePhase: s.setGamePhase, addToHistory: s.addToHistory, history: s.history })));
  const balance = useBalanceStore((s) => s.balance);
  const { muted, toggleMute } = useAudioStore();
  const stageRef = useRef<HTMLDivElement>(null);

  const [winningPocket, setWinningPocket] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<{ winningPocket: number; netAmount: number; wager: number; bets: PlacedChip[] } | null>(null);
  const [showHowTo, setShowHowTo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingBalance, setPendingBalance] = useState<number | null>(null);

  const totalBet = placedChips.reduce((sum, c) => sum + c.amount, 0);
  const isSpinning = gamePhase === 'spinning';
  const isResult = gamePhase === 'result';
  const locked = isSpinning || isResult;

  const chipsByZone = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of placedChips) map[c.zone] = (map[c.zone] ?? 0) + c.amount;
    return map;
  }, [placedChips]);

  function place(zone: BetZone) {
    if (locked) return;
    sound.unlock();
    sound.chip();
    placeChip(zone);
  }

  async function handleSpin() {
    if (isResult) {
      handlePlayAgain();
      return;
    }
    if (totalBet === 0 || isSpinning) return;
    sound.unlock();
    sound.bet();
    setError(null);
    setGamePhase('spinning');
    try {
      const res = await apiClient.post<RouletteResponse>('/games/roulette/bet', { bets: placedChips });
      const { winningPocket: pocket, profit, newBalance } = res.data;
      localStorage.setItem('lastBet_roulette', JSON.stringify(placedChips));
      const netAmount = profit - totalBet;
      setWinningPocket(pocket);
      setLastResult({ winningPocket: pocket, netAmount, wager: totalBet, bets: [...placedChips] });
      setPendingBalance(newBalance);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string }; status?: number } };
      if (axiosErr.response?.status === 402) setError('Insufficient funds to place this bet.');
      else setError(axiosErr.response?.data?.error ?? 'Something went wrong. Please try again.');
      setGamePhase('betting');
    }
  }

  function handleWheelSettled() {
    if (pendingBalance !== null) useBalanceStore.getState().setBalance(pendingBalance);
    const net = lastResult?.netAmount ?? 0;
    if (net > 0) {
      celebrate(winTier(net, lastResult?.wager ?? 0), { shakeEl: stageRef.current, originEl: stageRef.current });
    } else {
      celebrate('none');
    }
    if (lastResult) addToHistory(lastResult.winningPocket);
    setGamePhase('result');
    clearAll();
  }

  function handlePlayAgain() {
    setWinningPocket(null);
    setLastResult(null);
    setGamePhase('betting');
  }

  // Auto-clear the result and return to betting after a short pause (the player
  // can also click the wheel or "Play again" to clear it immediately).
  useEffect(() => {
    if (gamePhase !== 'result') return;
    const t = setTimeout(() => {
      setWinningPocket(null);
      setLastResult(null);
      setGamePhase('betting');
    }, 2600);
    return () => clearTimeout(t);
  }, [gamePhase, setGamePhase]);

  function handleRebet() {
    const raw = localStorage.getItem('lastBet_roulette');
    if (!raw) return;
    try {
      rebet(JSON.parse(raw) as PlacedChip[]);
    } catch {
      /* ignore corrupt data */
    }
  }

  const spinLabel = isSpinning ? 'Spinning…' : isResult ? 'Play again' : totalBet > 0 ? `Spin · ${totalBet} coins` : 'Place a bet';

  // 3 rows × 12 columns of numbers (European layout: top row 3,6,…,36).
  const numberRows = [0, 1, 2].map((row) => Array.from({ length: 12 }, (_, col) => col * 3 + (3 - row)));
  const columnZones: BetZone[] = ['col_3', 'col_2', 'col_1'];

  return (
    <AppShell>
      <div className="crumb">
        <span>HOME</span><span className="crumb-sep">/</span><span>GAMES</span>
        <span className="crumb-sep">/</span><span style={{ color: 'var(--text-secondary)' }}>ROULETTE</span>
      </div>
      <div className="game-page-head">
        <h1 className="h-title">
          Roulette <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 14 }}>European · single zero</span>
        </h1>
        <div className="game-meta-spec">
          <span>HOUSE EDGE 2.70%</span>
          <span className="dot">·</span>
          <span>MIN 1 · MAX 10,000</span>
          <button className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => setShowHowTo(true)}>
            How to play
          </button>
        </div>
      </div>

      {error && (
        <div className="notice loss" role="alert" style={{ marginBottom: 16, textAlign: 'left' }}>{error}</div>
      )}

      <div className="game-layout">
        <div className="game-stage">
          <div className="roulette-stage">
            <div
              ref={stageRef}
              style={{ position: 'relative', cursor: isResult ? 'pointer' : 'default' }}
              onClick={isResult ? handlePlayAgain : undefined}
              title={isResult ? 'Click to bet again' : undefined}
            >
              <RouletteWheel winningPocket={winningPocket} onSettled={handleWheelSettled} />
              <ResultOverlay
                visible={isResult}
                winningPocket={lastResult?.winningPocket ?? null}
                netAmount={lastResult?.netAmount ?? 0}
                bets={lastResult?.bets ?? []}
              />
            </div>

            <div style={{ width: '100%' }}>
              <div className="section-title" style={{ marginBottom: 10 }}>Inside bets</div>
              <div className="bet-board">
                <div className={'bet-cell zero' + (locked ? ' disabled' : '')} onClick={() => place('number_0')}>
                  0{chipsByZone['number_0'] != null && <span className="stack">{chipsByZone['number_0']}</span>}
                </div>
                {numberRows.map((rowNums, row) => (
                  <RowCells key={row} rowNums={rowNums} place={place} chipsByZone={chipsByZone} locked={locked} columnZone={columnZones[row] ?? 'col_1'} />
                ))}
              </div>

              <div className="section-title" style={{ margin: '14px 0 10px' }}>Outside bets</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginBottom: 4 }}>
                {(['dozen_1', 'dozen_2', 'dozen_3'] as BetZone[]).map((z) => (
                  <div key={z} className={'bet-cell outside' + (locked ? ' disabled' : '')} onClick={() => place(z)}>
                    {zoneLabel(z)}{chipsByZone[z] != null && <span className="stack">{chipsByZone[z]}</span>}
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                {(['red', 'even', 'odd', 'black'] as BetZone[]).map((z) => (
                  <div
                    key={z}
                    className={'bet-cell ' + (z === 'red' ? 'red' : z === 'black' ? 'black' : 'outside') + (locked ? ' disabled' : '')}
                    style={z === 'red' || z === 'black' ? { color: 'white', textTransform: 'uppercase', fontSize: 11 } : undefined}
                    onClick={() => place(z)}
                  >
                    {zoneLabel(z)}{chipsByZone[z] != null && <span className="stack">{chipsByZone[z]}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="history-strip">
            <span className="label">last {Math.min(history.length, 15) || ''}</span>
            {history.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>No spins yet</span>}
            {history.slice(0, 15).map((h, i) => (
              <div key={i} className={`chip-pip ${h.color}`}>{h.pocket}</div>
            ))}
          </div>
        </div>

        {/* Bet panel — chip-based */}
        <div className="bet-panel">
          <div className="tabs-2">
            <button className="active" type="button">Manual</button>
            <button type="button" disabled style={{ opacity: 0.4, cursor: 'not-allowed' }}>Auto</button>
          </div>
          <div className="body">
            <div>
              <label className="label">Chip value</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {CHIP_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setSelectedChip(amt)}
                    style={{
                      width: 48, height: 48, borderRadius: '50%',
                      fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                      background: selectedChip === amt ? 'var(--accent)' : 'var(--bg-elevated)',
                      color: selectedChip === amt ? '#021a0e' : 'var(--text-secondary)',
                      border: selectedChip === amt ? '2px solid #00f08c' : '1px solid var(--border)',
                      boxShadow: selectedChip === amt ? '0 0 0 3px var(--accent-glow)' : 'none',
                    }}
                  >
                    {amt}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSelectedChip(Math.max(1, Math.floor(balance ?? 1)))}
                  style={{
                    width: 48, height: 48, borderRadius: '50%',
                    fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 11, cursor: 'pointer',
                    background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
                  }}
                >
                  MAX
                </button>
              </div>
            </div>

            <div className="quick-bets" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              <button type="button" disabled={locked} onClick={halfBet}>½</button>
              <button type="button" disabled={locked} onClick={doubleBet}>2×</button>
              <button type="button" disabled={locked} onClick={undoLast}>Undo</button>
              <button type="button" disabled={locked} onClick={handleRebet}>Rebet</button>
              <button type="button" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>{muted ? '🔇' : '🔊'}</button>
            </div>

            <div className="card-inset" style={{ padding: 12 }}>
              <div className="section-title" style={{ marginBottom: 8 }}>Active bets</div>
              {placedChips.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No bets yet — click a cell on the table.</div>
              )}
              {Object.entries(chipsByZone).slice(0, 5).map(([z, v]) => (
                <div key={z} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
                  <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{zoneLabel(z)}</span>
                  <span className="num">{v}</span>
                </div>
              ))}
              {placedChips.length > 0 && !locked && (
                <button className="btn btn-ghost" onClick={clearAll} style={{ width: '100%', marginTop: 8, padding: 6, fontSize: 11 }}>
                  <XIcon size={12} /> Clear all
                </button>
              )}
            </div>

            <div className="bet-summary">
              <div className="row"><span>Total wager</span><span className="mono">{totalBet} coins</span></div>
              <div className="row"><span>Bets placed</span><span className="mono">{placedChips.length}</span></div>
            </div>

            <button
              className="btn btn-primary place-bet"
              disabled={isSpinning || (!isResult && totalBet === 0)}
              onClick={() => void handleSpin()}
              type="button"
            >
              {spinLabel}
            </button>
          </div>
        </div>
      </div>

      <HowToPlayModal open={showHowTo} onClose={() => setShowHowTo(false)} />
    </AppShell>
  );
}

interface RowCellsProps {
  rowNums: number[];
  place: (z: BetZone) => void;
  chipsByZone: Record<string, number>;
  locked: boolean;
  columnZone: BetZone;
}

function RowCells({ rowNums, place, chipsByZone, locked, columnZone }: RowCellsProps) {
  return (
    <>
      {rowNums.map((n) => (
        <div
          key={n}
          className={`bet-cell ${getPocketColor(n)}` + (locked ? ' disabled' : '')}
          onClick={() => place(`number_${n}` as BetZone)}
        >
          {n}
          {chipsByZone[`number_${n}`] != null && <span className="stack">{chipsByZone[`number_${n}`]}</span>}
        </div>
      ))}
      <div className={'bet-cell outside' + (locked ? ' disabled' : '')} onClick={() => place(columnZone)}>
        2:1{chipsByZone[columnZone] != null && <span className="stack">{chipsByZone[columnZone]}</span>}
      </div>
    </>
  );
}

export default RoulettePage;
