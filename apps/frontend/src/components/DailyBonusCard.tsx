import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { apiClient } from '../api/client';
import { useBalanceStore } from '../stores/balanceStore';

interface Props {
  dailyBonusTimestamp: string | null;
}

interface BonusClaimResponse {
  newBalance: number;
  nextClaimAt: string;
}

interface BonusErrorResponse {
  error: string;
  msUntilNext: number;
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
}

function computeNextClaimAt(timestamp: string | null): string | null {
  if (!timestamp) return null;
  const claimedAt = Date.parse(timestamp);
  const nextAt = claimedAt + 24 * 60 * 60 * 1000;
  if (nextAt > Date.now()) {
    return new Date(nextAt).toISOString();
  }
  return null;
}

export function DailyBonusCard({ dailyBonusTimestamp }: Props) {
  const [claiming, setClaiming] = useState(false);
  const [nextClaimAt, setNextClaimAt] = useState<string | null>(() =>
    computeNextClaimAt(dailyBonusTimestamp),
  );
  const [countdown, setCountdown] = useState<string>('');

  // Update countdown every second while nextClaimAt is set
  useEffect(() => {
    if (!nextClaimAt) {
      setCountdown('');
      return;
    }

    const update = () => {
      const msRemaining = Date.parse(nextClaimAt) - Date.now();
      if (msRemaining <= 0) {
        setNextClaimAt(null);
        setCountdown('');
      } else {
        setCountdown(formatCountdown(msRemaining));
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [nextClaimAt]);

  const claimBonus = useCallback(async () => {
    setClaiming(true);
    try {
      const res = await apiClient.post<BonusClaimResponse>('/wallet/bonus');
      useBalanceStore.getState().setBalance(res.data.newBalance);
      setNextClaimAt(res.data.nextClaimAt);
      toast.success('Bonus claimed! +100 coins');
    } catch (error: unknown) {
      const axiosError = error as { response?: { status: number; data?: BonusErrorResponse } };
      if (axiosError.response?.status === 429 && axiosError.response.data?.msUntilNext) {
        const ms = axiosError.response.data.msUntilNext;
        const nextAt = new Date(Date.now() + ms).toISOString();
        setNextClaimAt(nextAt);
        toast.error(`Next bonus in ${formatCountdown(ms)}`);
      } else {
        toast.error('Failed to claim bonus. Try again.');
      }
    } finally {
      setClaiming(false);
    }
  }, []);

  return (
    <div
      style={{
        backgroundColor: '#16213e',
        border: '1px solid #0f3460',
        borderRadius: '12px',
        padding: '32px',
        maxWidth: '400px',
        textAlign: 'center',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      }}
    >
      <h2 style={{ color: '#e0d7ff', marginBottom: '8px', fontSize: '1.5rem' }}>Daily Bonus</h2>
      <p style={{ color: '#a0aec0', marginBottom: '24px', fontSize: '0.9rem' }}>
        Claim your free 100 coins every 24 hours
      </p>

      {nextClaimAt ? (
        <div>
          <p style={{ color: '#f6ad55', fontSize: '1.1rem', marginBottom: '8px' }}>
            Next bonus in
          </p>
          <p
            style={{
              color: '#ffffff',
              fontSize: '2rem',
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {countdown}
          </p>
          <button
            disabled
            style={{
              marginTop: '16px',
              padding: '12px 32px',
              fontSize: '1rem',
              fontWeight: 600,
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#4a5568',
              color: '#718096',
              cursor: 'not-allowed',
            }}
          >
            Already Claimed
          </button>
        </div>
      ) : (
        <button
          onClick={claimBonus}
          disabled={claiming}
          style={{
            padding: '14px 40px',
            fontSize: '1.1rem',
            fontWeight: 700,
            borderRadius: '8px',
            border: 'none',
            backgroundColor: claiming ? '#553c9a' : '#6b46c1',
            color: '#ffffff',
            cursor: claiming ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s ease',
          }}
        >
          {claiming ? 'Claiming...' : 'Claim Daily Bonus'}
        </button>
      )}
    </div>
  );
}
