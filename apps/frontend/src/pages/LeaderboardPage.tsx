import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/vault/AppShell';
import { TrophyIcon } from '../components/vault/icons';
import { TierBadge } from '../components/vault/TierBadge';
import { Avatar } from '../components/vault/Avatar';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useLeaderboardStore } from '../stores/leaderboardStore';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../api/client';

type TabKey = 'balance' | 'wagered' | 'profit';

const TAB_CONFIG: { key: TabKey; label: string; valueLabel: string }[] = [
  { key: 'balance', label: 'Balance', valueLabel: 'Balance' },
  { key: 'wagered', label: 'Wagered', valueLabel: 'Total Wagered' },
  { key: 'profit', label: 'Profit', valueLabel: 'Profit' },
];

const PODIUM_KIND = ['gold', 'silver', 'bronze'] as const;
const PODIUM_POS = ['#1 · GOLD', '#2 · SILVER', '#3 · BRONZE'] as const;

function initial(name: string): string {
  return name.charAt(0).toUpperCase() || '?';
}

// Profit can be negative; balance/wagered are always positive. Render sign +
// sign-based colour class only for the profit tab.
function signClass(tab: TabKey, value: number): string {
  if (tab !== 'profit') return '';
  return value >= 0 ? 'delta-up' : 'delta-down';
}
function formatValue(tab: TabKey, value: number): string {
  const sign = tab === 'profit' && value > 0 ? '+' : '';
  return sign + value.toLocaleString();
}

export function LeaderboardPage() {
  const { accessToken, username } = useAuth();
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
        byBalance: { id: number; username: string; value: number; tierLevel: number; avatarColor: string | null }[];
        byWagered: { id: number; username: string; value: number; tierLevel: number; avatarColor: string | null }[];
        byProfit: { id: number; username: string; value: number; tierLevel: number; avatarColor: string | null }[];
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

  // Identify "you" by username (unique) — never by rank position, which collides
  // on ties and can't tell you apart from whoever happens to sit at your rank.
  const isYou = (row: { username: string }): boolean => username !== null && row.username === username;
  const ownInTopList = rows !== undefined && rows.some(isYou);

  const top3 = rows?.slice(0, 3) ?? [];
  const rest = rows?.slice(3) ?? [];

  return (
    <AppShell>
      <div className="lb-head">
        <div className="lb-title">
          <TrophyIcon color="var(--gold)" size={32} />
          <div>
            <div className="crumb"><span>HOME</span><span className="crumb-sep">/</span><span>LEADERBOARD</span></div>
            <h1 className="h-title">Leaderboard</h1>
          </div>
          <span className="live-badge">live</span>
        </div>
        <div className="tabs">
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={activeTab === tab.key ? 'active' : ''}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Podium — top 3 of the active metric */}
      {!isLoading && top3.length > 0 && (
        <div className="podium">
          {top3.map((p, i) => {
            const kind = PODIUM_KIND[i]!;
            const mine = isYou(p);
            return (
              <div key={p.id} className={`podium-card ${kind}${mine ? ' you' : ''}`}>
                <div className="pos">{PODIUM_POS[i]}</div>
                <div className="ava">{initial(p.username)}</div>
                <div className="pname">
                  <Link to={`/profile/${p.username}`}>{p.username}</Link>
                  <TierBadge level={p.tierLevel} size={12} />
                  {mine && <span className="you-tag">YOU</span>}
                </div>
                <div className={`amt ${signClass(activeTab, p.value)}`}>
                  {formatValue(activeTab, p.value)}<small>V</small>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full table */}
      <div className="lb-table">
        <div className="lb-row lb-head-row">
          <div>Rank</div>
          <div>Player</div>
          <div style={{ textAlign: 'right' }}>{tabConfig.valueLabel}</div>
        </div>

        {isLoading ? (
          Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="lb-row">
              <div className="lb-skeleton" style={{ width: 28 }} />
              <div className="lb-skeleton" style={{ maxWidth: 160 }} />
              <div className="lb-skeleton" style={{ width: 90, marginLeft: 'auto' }} />
            </div>
          ))
        ) : !rows || rows.length === 0 ? (
          <div className="lb-empty">No data yet — play some games to climb the leaderboard.</div>
        ) : (
          rest.map((p, idx) => {
            const rank = idx + 4; // table starts after the podium top 3
            const mine = isYou(p);
            return (
              <div key={p.id} className={'lb-row' + (mine ? ' you' : '')}>
                <div className={'rk' + (rank <= 3 ? ' top' : '')}>{rank}</div>
                <div className="player">
                  <Avatar username={p.username} avatarColor={p.avatarColor} className="ava-sm" />
                  <div>
                    <Link to={`/profile/${p.username}`}>{p.username}</Link>
                    <TierBadge level={p.tierLevel} size={12} />
                    {mine && <span className="you-tag">YOU</span>}
                  </div>
                </div>
                <div className={`num-cell ${signClass(activeTab, p.value)}`}>
                  {formatValue(activeTab, p.value)}
                </div>
              </div>
            );
          })
        )}

        {/* Own-rank pinned row — only when logged in and outside the visible list */}
        {!isLoading && ownRankEntry !== null && !ownInTopList && (
          <>
            <div className="lb-divider">
              <span className="line" />
              <span>your rank</span>
              <span className="line" />
            </div>
            <div className="lb-row you">
              <div className="rk">{ownRankEntry.rank}</div>
              <div className="player">
                <span className="ava-sm">{initial('You')}</span>
                <div>
                  <span style={{ fontWeight: 600 }}>You</span>
                  <span className="you-tag">YOU</span>
                </div>
              </div>
              <div className={`num-cell ${signClass(activeTab, ownRankEntry.value)}`}>
                {formatValue(activeTab, ownRankEntry.value)}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
