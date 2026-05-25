import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useBalanceStore } from '../stores/balanceStore';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/vault/AppShell';
import { LiveTicker } from '../components/vault/LiveTicker';
import { VaultDailyBonus } from '../components/vault/VaultDailyBonus';
import { VaultGameCard, type GameCardData } from '../components/vault/VaultGameCard';
import { ActivityFeed } from '../components/vault/ActivityFeed';

// Live games. `rtp` is each game's real return-to-player (RNG games are tuned to
// 97%; Slots 97.06%; Roulette 97.30% from the single-zero 2.70% edge; Blackjack
// ~99.5% under basic strategy). No fabricated "players online" counts.
const GAMES: GameCardData[] = [
  { id: 'roulette', name: 'Roulette', route: '/games/roulette', tag: 'Classic', rtp: '97.3%' },
  { id: 'crash', name: 'Crash', route: '/games/crash', tag: 'Live', rtp: '97.0%' },
  { id: 'plinko', name: 'Plinko', route: '/games/plinko', tag: 'Fast', rtp: '97.0%' },
  { id: 'slots', name: 'Slots', route: '/games/slots', tag: 'Spin', rtp: '97.1%' },
  { id: 'mines', name: 'Mines', route: '/games/mines', tag: 'Risk', rtp: '97.0%' },
  { id: 'dice', name: 'Dice', route: '/games/dice', tag: 'Pure RNG', rtp: '97.0%' },
  { id: 'flip', name: 'Coin Flip', route: '/games/flip', tag: 'Coin toss', rtp: '97.0%' },
  { id: 'blackjack', name: 'Blackjack', route: '/games/blackjack', tag: 'Strategy', rtp: '99.5%' },
];

// Planned games (THE_NEXT_STEP lineup) — shown as non-clickable "coming soon" tiles.
const COMING_SOON: GameCardData[] = [
  { id: 'chicken', name: 'Chicken Road', route: '', tag: 'Cash-out ladder', eta: '~4 weeks' },
  { id: 'hilo', name: 'Hi-Lo', route: '', tag: 'Card guess', eta: '~3 weeks' },
  { id: 'pump', name: 'Pump', route: '', tag: 'Balloon', eta: '~6 weeks' },
  { id: 'rps', name: 'Rock·Paper·Scissors', route: '', tag: '3-way duel', eta: '~8 weeks' },
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
          Casino Games <span>· {GAMES.length} live</span>
        </h3>
      </div>
      <div className="game-grid">
        {GAMES.map((game) => (
          <VaultGameCard key={game.id} game={game} />
        ))}
      </div>

      <div className="section-head">
        <h3>
          Coming soon <span>· {COMING_SOON.length} in development</span>
        </h3>
      </div>
      <div className="game-grid">
        {COMING_SOON.map((game) => (
          <VaultGameCard key={game.id} game={game} soon />
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
