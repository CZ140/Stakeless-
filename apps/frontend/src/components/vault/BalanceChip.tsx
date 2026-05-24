import { useEffect, useRef, useState } from 'react';
import { useBalanceStore } from '../../stores/balanceStore';
import { CoinIcon } from './icons';
import { TierBadge } from './TierBadge';

// Header balance pill. Reads the real balance store and flashes a floating
// delta (+/-) whenever the balance changes — e.g. after a settled bet pushes
// a `balance:update` over the socket, or a claimed daily bonus.
export function BalanceChip() {
  const balance = useBalanceStore((s) => s.balance);
  const tierLevel = useBalanceStore((s) => s.tierLevel);
  const prev = useRef<number | null>(null);
  const [delta, setDelta] = useState<number | null>(null);

  useEffect(() => {
    if (balance === null) {
      prev.current = null;
      return;
    }
    if (prev.current !== null && prev.current !== balance) {
      setDelta(balance - prev.current);
      const t = setTimeout(() => setDelta(null), 1600);
      prev.current = balance;
      return () => clearTimeout(t);
    }
    prev.current = balance;
  }, [balance]);

  if (balance === null) return null;

  return (
    <div className="balance-chip" aria-label="Coin balance">
      {tierLevel !== null && <TierBadge level={tierLevel} size={14} className="chip-tier" />}
      <span className="coin">
        <CoinIcon size={22} />
      </span>
      <span>{balance.toLocaleString('en-US')}</span>
      {delta !== null && delta !== 0 && (
        <span className={'delta' + (delta < 0 ? ' neg' : '')} key={balance}>
          {delta > 0 ? '+' : ''}
          {delta.toLocaleString('en-US')}
        </span>
      )}
    </div>
  );
}
