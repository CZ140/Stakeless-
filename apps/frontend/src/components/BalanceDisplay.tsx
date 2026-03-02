import { useEffect } from 'react';
import { useSpring, useTransform, motion } from 'framer-motion';
import { useBalanceStore } from '../stores/balanceStore';

function formatCoins(n: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumSignificantDigits: 3,
  }).format(n);
}

export function BalanceDisplay() {
  const balance = useBalanceStore((state) => state.balance);

  const spring = useSpring(balance ?? 0, { mass: 0.8, stiffness: 75, damping: 15 });
  const display = useTransform(spring, (v) => formatCoins(Math.round(v)));

  useEffect(() => {
    if (balance !== null) {
      spring.set(balance);
    }
  }, [balance, spring]);

  if (balance === null) return null;

  return (
    <span className="balance-display" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
      🪙 <motion.span>{display}</motion.span>
    </span>
  );
}
