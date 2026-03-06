import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Header } from '../components/Header';
import { apiClient } from '../api/client';

interface ProfileData {
  username: string;
  balance: number;
  balanceRank: number;
  totalWagered: number;
  totalProfit: number;
  gamesPlayed: number;
  balanceHistory: { x: string; y: number }[];
  wageredPerDay: { date: string; wagered: number }[];
}

type ChartTab = 'balance' | 'wagered';

export function ProfilePage() {
  const { username: routeUsername } = useParams<{ username: string }>();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeChart, setActiveChart] = useState<ChartTab>('balance');

  useEffect(() => {
    if (!routeUsername) return;
    setIsLoading(true);
    setNotFound(false);
    setProfileData(null);
    apiClient
      .get<ProfileData>(`/profile/${routeUsername}`)
      .then((res) => {
        setProfileData(res.data);
      })
      .catch((err: { response?: { status?: number } }) => {
        if (err.response?.status === 404) {
          setNotFound(true);
        }
      })
      .finally(() => setIsLoading(false));
  }, [routeUsername]);

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f0f1a', color: '#ffffff' }}>
        <Header />
        <p style={{ textAlign: 'center', color: '#a0a0c0', paddingTop: '64px' }}>Loading...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f0f1a', color: '#ffffff' }}>
        <Header />
        <p style={{ textAlign: 'center', color: '#a0a0c0', paddingTop: '64px' }}>User not found.</p>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f0f1a', color: '#ffffff' }}>
        <Header />
        <p style={{ textAlign: 'center', color: '#a0a0c0', paddingTop: '64px' }}>Loading...</p>
      </div>
    );
  }

  const balanceHistoryEmpty = profileData.balanceHistory.length === 0;
  const wageredPerDayEmpty = profileData.wageredPerDay.length === 0;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f0f1a', color: '#ffffff' }}>
      <Header />
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#e0d7ff', marginBottom: '8px' }}>
          {profileData.username}
        </h1>
        <p style={{ color: '#a0a0c0', marginBottom: '32px', fontSize: '0.9rem' }}>Player Profile</p>

        {/* Stat card grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          <div
            style={{
              backgroundColor: '#1a1a2e',
              borderRadius: '8px',
              padding: '20px 16px',
              border: '1px solid rgba(255,255,255,0.08)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '0.75rem',
                color: '#a0a0c0',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '8px',
              }}
            >
              Balance
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e0d7ff' }}>
              {profileData.balance.toLocaleString()}
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#1a1a2e',
              borderRadius: '8px',
              padding: '20px 16px',
              border: '1px solid rgba(255,255,255,0.08)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '0.75rem',
                color: '#a0a0c0',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '8px',
              }}
            >
              Rank
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e0d7ff' }}>
              #{profileData.balanceRank}
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#1a1a2e',
              borderRadius: '8px',
              padding: '20px 16px',
              border: '1px solid rgba(255,255,255,0.08)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '0.75rem',
                color: '#a0a0c0',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '8px',
              }}
            >
              Total Wagered
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e0d7ff' }}>
              {profileData.totalWagered.toLocaleString()}
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#1a1a2e',
              borderRadius: '8px',
              padding: '20px 16px',
              border: '1px solid rgba(255,255,255,0.08)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '0.75rem',
                color: '#a0a0c0',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '8px',
              }}
            >
              Total Profit
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e0d7ff' }}>
              {profileData.totalProfit.toLocaleString()}
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#1a1a2e',
              borderRadius: '8px',
              padding: '20px 16px',
              border: '1px solid rgba(255,255,255,0.08)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '0.75rem',
                color: '#a0a0c0',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '8px',
              }}
            >
              Games Played
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e0d7ff' }}>
              {profileData.gamesPlayed.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Chart section */}
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#e0d7ff', marginBottom: '16px' }}>
          History
        </h2>

        {/* Tab buttons */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          {(['balance', 'wagered'] as ChartTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveChart(tab)}
              style={{
                padding: '8px 20px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: activeChart === tab ? 700 : 400,
                backgroundColor: activeChart === tab ? '#7c3aed' : '#1e1e3a',
                color: activeChart === tab ? '#ffffff' : '#a0a0c0',
                fontSize: '0.9rem',
              }}
            >
              {tab === 'balance' ? 'Balance History' : 'Wagered / Day'}
            </button>
          ))}
        </div>

        {/* Chart panel */}
        {activeChart === 'balance' ? (
          balanceHistoryEmpty ? (
            <div
              style={{
                textAlign: 'center',
                color: '#606080',
                padding: '48px 0',
                backgroundColor: '#1a1a2e',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              No game history yet.
            </div>
          ) : (
            <div
              style={{
                backgroundColor: '#1a1a2e',
                borderRadius: '8px',
                padding: '24px',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={profileData.balanceHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis
                    dataKey="x"
                    tickFormatter={(v: string) => {
                      const d = new Date(v);
                      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }}
                    stroke="#a0a0c0"
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    tickFormatter={(v: number) => v.toLocaleString()}
                    stroke="#a0a0c0"
                    tick={{ fontSize: 11 }}
                    width={70}
                  />
                  <Tooltip
                    formatter={(v: number | undefined) => [v !== undefined ? v.toLocaleString() : '0', 'Balance']}
                    contentStyle={{
                      backgroundColor: '#1a1a2e',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '6px',
                    }}
                    labelStyle={{ color: '#a0a0c0' }}
                  />
                  <Line type="monotone" dataKey="y" stroke="#7c3aed" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )
        ) : wageredPerDayEmpty ? (
          <div
            style={{
              textAlign: 'center',
              color: '#606080',
              padding: '48px 0',
              backgroundColor: '#1a1a2e',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            No game history yet.
          </div>
        ) : (
          <div
            style={{
              backgroundColor: '#1a1a2e',
              borderRadius: '8px',
              padding: '24px',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={profileData.wageredPerDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => {
                    const d = new Date(v + 'T00:00:00');
                    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  }}
                  stroke="#a0a0c0"
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  tickFormatter={(v: number) => v.toLocaleString()}
                  stroke="#a0a0c0"
                  tick={{ fontSize: 11 }}
                  width={70}
                />
                <Tooltip
                  formatter={(v: number | undefined) => [v !== undefined ? v.toLocaleString() : '0', 'Wagered']}
                  contentStyle={{
                    backgroundColor: '#1a1a2e',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '6px',
                  }}
                  labelStyle={{ color: '#a0a0c0' }}
                />
                <Bar dataKey="wagered" fill="#7c3aed" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </main>
    </div>
  );
}
