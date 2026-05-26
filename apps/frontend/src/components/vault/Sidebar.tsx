import type { ReactElement } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { BrandMark } from './BrandMark';
import {
  DashboardIcon,
  RouletteIcon,
  PlinkoIcon,
  DiceIcon,
  FlipIcon,
  HiloIcon,
  PumpIcon,
  ChickenIcon,
  RpsIcon,
  SlotsIcon,
  CrashIcon,
  MinesIcon,
  BlackjackIcon,
  PokerIcon,
  LeaderboardIcon,
  ProfileIcon,
  FriendsIcon,
  GroupsIcon,
  LogoutIcon,
} from './icons';
import { useFriendsStore } from '../../stores/friendsStore';
import { useSocketStatus } from '../../hooks/useSocketStatus';

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
  { to: '/games/dice', label: 'Dice', Icon: DiceIcon },
  { to: '/games/flip', label: 'Coin Flip', Icon: FlipIcon },
  { to: '/games/hilo', label: 'Hi-Lo', Icon: HiloIcon },
  { to: '/games/pump', label: 'Pump', Icon: PumpIcon },
  { to: '/games/chicken', label: 'Chicken', Icon: ChickenIcon },
  { to: '/games/rps', label: 'RPS', Icon: RpsIcon },
  { to: '/games/slots', label: 'Slots', Icon: SlotsIcon },
  { to: '/games/crash', label: 'Crash', Icon: CrashIcon },
  { to: '/games/mines', label: 'Mines', Icon: MinesIcon },
  { to: '/games/blackjack', label: 'Blackjack', Icon: BlackjackIcon },
  { to: '/games/poker', label: 'Poker', Icon: PokerIcon },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { username, signOut } = useAuth();
  const connected = useSocketStatus();
  const incomingCount = useFriendsStore((s) => s.incoming.length);
  const account: NavEntry[] = [
    { to: '/leaderboard', label: 'Leaderboard', Icon: LeaderboardIcon },
    { to: '/friends', label: 'Friends', Icon: FriendsIcon, pill: incomingCount > 0 ? String(incomingCount) : undefined },
    { to: '/groups', label: 'Groups', Icon: GroupsIcon },
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
        <span title={connected ? 'Realtime connection active' : 'Reconnecting to the server…'}>
          <span
            className="status-dot"
            // Offline: override the green/pulse with a muted amber dot (no vault.css change).
            style={connected ? undefined : { background: '#e0a23c', boxShadow: 'none', animation: 'none' }}
          />
          {connected ? 'LIVE' : 'RECONNECTING…'}
        </span>
        <span>V 1.0.0</span>
      </div>
    </aside>
  );
}
