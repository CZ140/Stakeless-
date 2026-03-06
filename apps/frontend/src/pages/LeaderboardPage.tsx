import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useLeaderboardStore } from '../stores/leaderboardStore';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../api/client';

type TabKey = 'balance' | 'wagered' | 'profit';

const TAB_CONFIG: { key: TabKey; label: string; valueLabel: string }[] = [
  { key: 'balance', label: 'Balance', valueLabel: 'Balance' },
  { key: 'wagered', label: 'Total Wagered', valueLabel: 'Total Wagered' },
  { key: 'profit', label: 'Profit', valueLabel: 'Total Profit' },
];

export function LeaderboardPage() {
  const { accessToken } = useAuth();
  const { snapshot, ownRanks, activeTab, setSnapshot, setOwnRanks, setActiveTab } =
    useLeaderboardStore();
  const [isLoading, setIsLoading] = useState(true);

  // Register socket listener for live updates
  useLeaderboard();

  // Fetch initial leaderboard snapshot and own-rank on mount
  useEffect(() => {
    setIsLoading(true);
    apiClient
      .get<{
        byBalance: { id: number; username: string; value: number }[];
        byWagered: { id: number; username: string; value: number }[];
        byProfit: { id: number; username: string; value: number }[];
        ownRanks: {
          balance: { rank: number; value: number } | null;
          wagered: { rank: number; value: number } | null;
          profit: { rank: number; value: number } | null;
        } | null;
      }>('/leaderboard')
      .then((res) => {
        setSnapshot({
          byBalance: res.data.byBalance,
          byWagered: res.data.byWagered,
          byProfit: res.data.byProfit,
        });
        setOwnRanks(res.data.ownRanks);
      })
      .catch(() => {
        // Non-fatal — page will show empty state
      })
      .finally(() => setIsLoading(false));
  }, [setSnapshot, setOwnRanks]);

  // Determine the active rows and own-rank for the current tab
  const tabConfig = TAB_CONFIG.find((t) => t.key === activeTab)!;
  const rows =
    activeTab === 'balance'
      ? snapshot?.byBalance
      : activeTab === 'wagered'
        ? snapshot?.byWagered
        : snapshot?.byProfit;

  const ownRankEntry =
    ownRanks !== null && accessToken !== null
      ? activeTab === 'balance'
        ? ownRanks.balance
        : activeTab === 'wagered'
          ? ownRanks.wagered
          : ownRanks.profit
      : null;

  // Is the logged-in user already in the top 25?
  const ownInTopList =
    ownRankEntry !== null &&
    rows !== undefined &&
    rows.some((_, idx) => idx + 1 === ownRankEntry?.rank);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f0f1a', color: '#ffffff' }}>
      <Header />
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '24px', color: '#e0d7ff' }}>
          Leaderboard
        </h1>

        {/* Tab row */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '8px 20px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: activeTab === tab.key ? 700 : 400,
                backgroundColor: activeTab === tab.key ? '#7c3aed' : '#1e1e3a',
                color: activeTab === tab.key ? '#ffffff' : '#a0a0c0',
                fontSize: '0.9rem',
                transition: 'background-color 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div
          style={{
            backgroundColor: '#1a1a2e',
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {/* Table header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '60px 1fr 160px',
              padding: '12px 16px',
              backgroundColor: 'rgba(255,255,255,0.05)',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#a0a0c0',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            <span>Rank</span>
            <span>Username</span>
            <span style={{ textAlign: 'right' }}>{tabConfig.valueLabel}</span>
          </div>

          {/* Table rows */}
          {isLoading ? (
            // Skeleton rows
            Array.from({ length: 10 }).map((_, idx) => (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '60px 1fr 160px',
                  padding: '12px 16px',
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                  gap: '12px',
                }}
              >
                <div style={{ height: '16px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '4px', width: '24px' }} />
                <div style={{ height: '16px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '4px', maxWidth: '120px' }} />
                <div style={{ height: '16px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '4px', marginLeft: 'auto', width: '80px' }} />
              </div>
            ))
          ) : !rows || rows.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#606080' }}>
              No data yet — play some games to appear on the leaderboard!
            </div>
          ) : (
            rows.map((row, idx) => {
              const rank = idx + 1;
              const isOwnRow = ownRankEntry !== null && rank === ownRankEntry.rank;
              return (
                <div
                  key={row.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '60px 1fr 160px',
                    padding: '12px 16px',
                    borderTop: '1px solid rgba(255,255,255,0.05)',
                    // Own-rank highlight inside top 25: accent left border + subtle background tint
                    ...(isOwnRow
                      ? {
                          borderLeft: '3px solid #7c3aed',
                          backgroundColor: 'rgba(124,58,237,0.10)',
                          paddingLeft: '13px', // compensate for border
                        }
                      : {}),
                  }}
                >
                  <span style={{ color: rank <= 3 ? '#fbbf24' : '#a0a0c0', fontWeight: rank <= 3 ? 700 : 400 }}>
                    #{rank}
                  </span>
                  <span style={{ fontWeight: isOwnRow ? 600 : 400 }}>
                    <Link
                      to={`/profile/${row.username}`}
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      {row.username}
                    </Link>
                    {isOwnRow && (
                      <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: '#7c3aed', fontWeight: 600 }}>
                        You
                      </span>
                    )}
                  </span>
                  <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {row.value.toLocaleString()}
                  </span>
                </div>
              );
            })
          )}

          {/* Own-rank pinned row — shown only when logged in and outside top 25 */}
          {!isLoading && ownRankEntry !== null && !ownInTopList && (
            <>
              {/* Visual divider */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 16px',
                  gap: '8px',
                  color: '#606080',
                  fontSize: '0.75rem',
                }}
              >
                <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
                <span>your rank</span>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
              </div>
              {/* Pinned own-rank row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '60px 1fr 160px',
                  padding: '12px 16px',
                  borderLeft: '3px solid #7c3aed',
                  backgroundColor: 'rgba(124,58,237,0.10)',
                  paddingLeft: '13px',
                }}
              >
                <span style={{ color: '#a0a0c0' }}>#{ownRankEntry.rank}</span>
                <span style={{ fontWeight: 600 }}>
                  You
                </span>
                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {ownRankEntry.value.toLocaleString()}
                </span>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
