import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useBalanceStore } from '../stores/balanceStore';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/vault/AppShell';
import { LiveTicker } from '../components/vault/LiveTicker';
import { VaultDailyBonus } from '../components/vault/VaultDailyBonus';
import { VaultGameCard, type GameCardData } from '../components/vault/VaultGameCard';
import { ActivityFeed } from '../components/vault/ActivityFeed';

const GAMES: GameCardData[] = [
  { id: 'roulette', name: 'Roulette', route: '/games/roulette', tag: 'Classic', description: 'European wheel · single zero' },
  { id: 'plinko', name: 'Plinko', route: '/games/plinko', tag: 'Fast', description: 'Drop the ball, ride the pegs' },
  { id: 'dice', name: 'Dice', route: '/games/dice', tag: 'Fast', description: 'Pick your odds, roll the number' },
  { id: 'slots', name: 'Slots', route: '/games/slots', tag: 'Fast', description: '3×3 reels · 5 paylines' },
  { id: 'mines', name: 'Mines', route: '/games/mines', tag: 'Risk', description: 'Avoid the mines, cash out big' },
  { id: 'blackjack', name: 'Blackjack', route: '/games/blackjack', tag: 'Strategy', description: 'Beat the dealer to 21' },
];

interface MeResponse {
  id: number;
  email: string;
  username?: string;
  balance: number;
  dailyBonusTimestamp: string | null;
}

function timeOfDay(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardPage() {
  const { username } = useAuth();
  const [profile, setProfile] = useState<MeResponse | null>(null);

  useEffect(() => {
    apiClient
      .get<MeResponse>('/auth/me')
      .then((res) => {
        setProfile(res.data);
        useBalanceStore.getState().setBalance(res.data.balance);
      })
      .catch(() => {
        // Non-fatal — balance is already set by AuthContext on token acquisition.
      });
  }, []);

  const name = username ?? profile?.username ?? profile?.email?.split('@')[0] ?? 'player';

  return (
    <AppShell>
      <div className="welcome">
        <div>
          <div className="crumb">
            <span>HOME</span>
            <span className="crumb-sep">/</span>
            <span style={{ color: 'var(--text-secondary)' }}>LOBBY</span>
          </div>
          <h1 className="h-title">
            {timeOfDay()}, <span style={{ color: 'var(--accent)' }}>{name}</span>
          </h1>
          <p className="h-subtitle">Ready to play? Claim your daily bonus, then pick a table below.</p>
        </div>
      </div>

      <LiveTicker />

      <VaultDailyBonus dailyBonusTimestamp={profile?.dailyBonusTimestamp ?? null} />

      <div className="section-head">
        <h3>
          Casino Games <span>· {GAMES.length} available</span>
        </h3>
      </div>
      <div className="game-grid">
        {GAMES.map((game) => (
          <VaultGameCard key={game.id} game={game} />
        ))}
      </div>

      <div className="section-head">
        <h3>
          Recent activity <span>· your latest bets</span>
        </h3>
      </div>
      <div className="card" style={{ padding: '14px 22px' }}>
        <ActivityFeed username={username ?? profile?.username ?? null} limit={8} />
      </div>
    </AppShell>
  );
}

export default DashboardPage;
