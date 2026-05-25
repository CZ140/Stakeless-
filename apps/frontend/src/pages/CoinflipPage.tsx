import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { coinflipMultiplier, COINFLIP, type CoinSide } from '@gambling/shared';
import { AppShell } from '../components/vault/AppShell';
import { BetPanel } from '../components/vault/BetPanel';
import { useCoinflipStore } from '../stores/coinflipStore';
import { useBalanceStore } from '../stores/balanceStore';
import { useAudioStore } from '../stores/audioStore';
import { sound } from '../lib/sound';
import { celebrate, pulse, winTier } from '../lib/juice';
import { prefersReducedMotion } from '../hooks/useReducedMotion';
import { apiClient } from '../api/client';

interface CoinflipResponse {
  result: CoinSide;
  call: CoinSide;
  win: boolean;
  multiplier: number;
  profit: number;
  newBalance: number;
}

export function CoinflipPage() {
  const {
    betAmount, call, flipping, lastResult,
    setBetAmount, setCall, setFlipping, setLastResult,
  } = useCoinflipStore();
  const { muted, toggleMute } = useAudioStore();
  const balance = useBalanceStore((s) => s.balance);
  const [error, setError] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const coinRef = useRef<HTMLDivElement>(null);
  // Accumulated rotateX (deg) so the coin always spins forward, never snaps back.
  const rotRef = useRef(0);

  const multiplier = coinflipMultiplier();
  const winChance = COINFLIP.WIN_CHANCE;
  const profitOnWin = Math.max(0, Math.floor(betAmount * multiplier) - betAmount);

  // Spin the coin toward the server-decided face, then settle/celebrate.
  useEffect(() => {
    if (!lastResult) return;
    const reduced = prefersReducedMotion();

    // Heads shows at rotateX ≡ 0 (mod 360), tails at ≡ 180. Add whole spins, then
    // nudge to land exactly on the result face.
    const faceTarget = lastResult.result === 'heads' ? 0 : 180;
    let target = rotRef.current + (reduced ? 0 : 5 * 360);
    const mod = ((target % 360) + 360) % 360;
    target += (faceTarget - mod + 360) % 360;
    rotRef.current = target;

    const settle = () => {
      sound.chip();
      if (lastResult.win) {
        pulse(coinRef.current, '#D4A857');
        celebrate(winTier(lastResult.profit, betAmount), { shakeEl: stageRef.current, originEl: coinRef.current });
      } else {
        celebrate('none');
      }
      setFlipping(false);
    };

    if (coinRef.current) {
      gsap.to(coinRef.current, {
        rotationX: target,
        duration: reduced ? 0 : 1.15,
        ease: reduced ? 'none' : 'power4.out',
        onComplete: settle,
      });
    } else {
      settle();
    }
    // betAmount read at fire time; lastResult identity drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastResult]);

  async function handleFlip() {
    if (flipping) return;
    sound.unlock();
    sound.coinFlip();
    setError(null);
    setFlipping(true);
    localStorage.setItem('lastBet_flip', String(betAmount));
    try {
      const res = await apiClient.post<CoinflipResponse>('/games/flip/bet', { betAmount, call });
      const d = res.data;
      useBalanceStore.getState().setBalance(d.newBalance);
      // The spin animation (effect above) re-enables the button on completion.
      setLastResult({ result: d.result, call: d.call, win: d.win, multiplier: d.multiplier, profit: d.profit });
    } catch (err: unknown) {
      sound.error();
      const ax = err as { response?: { data?: { error?: string }; status?: number } };
      if (ax.response?.status === 402) setError('Insufficient funds.');
      else if (ax.response?.status === 429) setError('Too many flips too fast — slow down.');
      else setError(ax.response?.data?.error ?? 'Something went wrong. Please try again.');
      setFlipping(false);
    }
  }

  const callLabel = call === 'heads' ? 'Heads' : 'Tails';

  return (
    <AppShell>
      <div className="crumb">
        <span>HOME</span><span className="crumb-sep">/</span><span>GAMES</span>
        <span className="crumb-sep">/</span><span style={{ color: 'var(--text-secondary)' }}>COIN FLIP</span>
      </div>
      <div className="game-page-head">
        <h1 className="h-title">Coin Flip</h1>
        <div className="game-meta-spec">
          <span>50 / 50</span><span className="dot">·</span><span>{multiplier.toFixed(2)}× ON WIN</span>
          <button className="icon-btn" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} style={{ fontSize: 14 }}>
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

      {error && <div className="notice loss" style={{ marginBottom: 16, textAlign: 'left' }}>{error}</div>}

      <div className="game-layout">
        <div className="game-stage">
          <div className="coin-stage" ref={stageRef}>
            {/* The flipping coin (rotateX owned by GSAP via coinRef) */}
            <div className="coin-scene">
              <div className="coin" ref={coinRef}>
                <div className="coin-face heads">H</div>
                <div className="coin-face tails">T</div>
              </div>
            </div>

            <div className="coin-result">
              {lastResult ? (
                <span style={{ color: lastResult.win ? 'var(--win)' : 'var(--loss)' }}>
                  {lastResult.result === 'heads' ? 'HEADS' : 'TAILS'}
                  {' · '}
                  {lastResult.win ? `WON +${lastResult.profit}` : `LOST ${lastResult.profit}`}
                </span>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>Call it in the air</span>
              )}
            </div>

            {/* Heads / Tails call */}
            <div className="opt-grid coin-call" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              <button type="button" className={call === 'heads' ? 'active' : ''} onClick={() => setCall('heads')} disabled={flipping}>
                Heads
              </button>
              <button type="button" className={call === 'tails' ? 'active' : ''} onClick={() => setCall('tails')} disabled={flipping}>
                Tails
              </button>
            </div>

            {/* Live stats — shares the dice stat-strip layout. */}
            <div className="dice-stats">
              <div className="col">
                <div className="section-title">Your call</div>
                <div className="num v">{callLabel}</div>
              </div>
              <div className="divider" />
              <div className="col">
                <div className="section-title">Win chance</div>
                <div className="num v">{(winChance * 100).toFixed(0)}%</div>
              </div>
              <div className="divider" />
              <div className="col">
                <div className="section-title">Multiplier</div>
                <div className="num v" style={{ color: 'var(--accent)' }}>{multiplier.toFixed(2)}×</div>
              </div>
            </div>
          </div>
        </div>

        <BetPanel
          amount={betAmount}
          onAmountChange={setBetAmount}
          balance={balance}
          amountLocked={flipping}
          multiplier={multiplier.toFixed(2)}
          profitOnWin={profitOnWin}
          summary={[{ label: 'Win chance', value: `${(winChance * 100).toFixed(0)}%` }]}
          primaryLabel={flipping ? 'Flipping…' : `Flip on ${callLabel}`}
          onPrimary={() => { void handleFlip(); }}
          primaryDisabled={flipping}
        />
      </div>
    </AppShell>
  );
}

export default CoinflipPage;
