import type { ReactElement } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { BrandMark } from './BrandMark';
import {
  DashboardIcon,
  RouletteIcon,
  PlinkoIcon,
  MinesIcon,
  BlackjackIcon,
  LeaderboardIcon,
  ProfileIcon,
  LogoutIcon,
} from './icons';

type NavEntry = {
  to: string;
  label: string;
  Icon: (props: { size?: number }) => ReactElement;
  pill?: string;
  end?: boolean;
};

const games: NavEntry[] = [
  { to: '/dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { to: '/games/roulette', label: 'Roulette', Icon: RouletteIcon },
  { to: '/games/plinko', label: 'Plinko', Icon: PlinkoIcon },
  { to: '/games/mines', label: 'Mines', Icon: MinesIcon },
  { to: '/games/blackjack', label: 'Blackjack', Icon: BlackjackIcon },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { username, signOut } = useAuth();
  const account: NavEntry[] = [
    { to: '/leaderboard', label: 'Leaderboard', Icon: LeaderboardIcon, pill: 'NEW' },
    { to: username ? `/profile/${username}` : '/leaderboard', label: 'Profile', Icon: ProfileIcon },
  ];

  const navClass = ({ isActive }: { isActive: boolean }) => 'nav-item' + (isActive ? ' active' : '');

  return (
    <aside className="sidebar">
      <NavLink to="/dashboard" className="brand" onClick={onNavigate}>
        <BrandMark size={32} />
        <div>
          <div className="brand-word">
            Stake<em>less</em>
          </div>
          <div className="brand-tag">no real stakes</div>
        </div>
      </NavLink>

      <nav className="nav">
        <div className="nav-section">Games</div>
        {games.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className={navClass} end={to === '/dashboard'} onClick={onNavigate}>
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}

        <div className="nav-section" style={{ marginTop: 8 }}>
          Account
        </div>
        {account.map(({ to, label, Icon, pill }) => (
          <NavLink key={label} to={to} className={navClass} onClick={onNavigate}>
            <Icon size={18} />
            <span>{label}</span>
            {pill && <span className="pill">{pill}</span>}
          </NavLink>
        ))}

        <div className="nav-section" style={{ marginTop: 8 }}>
          Support
        </div>
        <button type="button" className="nav-item" onClick={() => { onNavigate?.(); void signOut(); }} style={{ width: '100%', textAlign: 'left' }}>
          <LogoutIcon size={18} />
          <span>Sign out</span>
        </button>
      </nav>

      <div className="sidebar-foot">
        <span>
          <span className="status-dot" />
          ALL SYSTEMS LIVE
        </span>
        <span>V 1.0.0</span>
      </div>
    </aside>
  );
}
