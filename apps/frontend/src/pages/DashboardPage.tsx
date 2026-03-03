import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useBalanceStore } from '../stores/balanceStore';
import { Header } from '../components/Header';
import { DailyBonusCard } from '../components/DailyBonusCard';
import { GameCard } from '../components/GameCard';

const GAMES = [
  { id: 'roulette',  name: 'Roulette',  icon: '🎡', description: 'European wheel, 37 pockets',    route: '/games/roulette',  available: true  },
  { id: 'plinko',    name: 'Plinko',    icon: '⚫', description: 'Drop the ball, ride the pegs',  route: '/games/plinko',    available: true  },
  { id: 'mines',     name: 'Mines',     icon: '💣', description: 'Avoid the mines, cash out big', route: '/games/mines',     available: true  },
  { id: 'blackjack', name: 'Blackjack', icon: '🃏', description: 'Beat the dealer to 21',         route: '/games/blackjack', available: false },
];

interface MeResponse {
  id: number;
  email: string;
  balance: number;
  dailyBonusTimestamp: string | null;
}

export function DashboardPage() {
  const [profile, setProfile] = useState<MeResponse | null>(null);

  useEffect(() => {
    apiClient
      .get<MeResponse>('/auth/me')
      .then((res) => {
        setProfile(res.data);
        useBalanceStore.getState().setBalance(res.data.balance);
      })
      .catch(() => {
        // Non-fatal — balance already set by AuthContext on token acquisition
      });
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0d0d1a', color: '#ffffff' }}>
      <Header />
      <main
        style={{
          maxWidth: '900px',
          margin: '0 auto',
          padding: '40px 24px',
        }}
      >
        <h1 style={{ fontSize: '2rem', marginBottom: '8px', color: '#e0d7ff' }}>
          Welcome back{profile?.email ? `, ${profile.email.split('@')[0]}` : ''}!
        </h1>
        <p style={{ color: '#718096', marginBottom: '40px' }}>
          Ready to play? Claim your daily bonus to get started.
        </p>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <DailyBonusCard
            dailyBonusTimestamp={profile?.dailyBonusTimestamp ?? null}
          />
        </div>

        <div style={{ marginTop: '48px' }}>
          <h2 style={{ fontSize: '1.4rem', color: '#e0d7ff', marginBottom: '20px' }}>Games</h2>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {GAMES.map((game) => (
              <GameCard key={game.id} {...game} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default DashboardPage;
