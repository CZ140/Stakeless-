import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { BalanceChip } from './BalanceChip';
import { Avatar } from './Avatar';
import { SearchIcon, BellIcon, ChatIcon, MenuIcon } from './icons';

// Top bar for the app shell. The search field and bell/chat buttons are
// styled affordances reserved for future features — deliberately carrying NO
// fabricated counts or results (unlike the prototype's hard-coded "3" badge).
//
// `onMenuToggle` opens/closes the mobile navigation drawer; the hamburger that
// triggers it is hidden on desktop via CSS.
export function TopBar({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const { username, avatarColor, avatarImage } = useAuth();

  return (
    <header className="header">
      <button type="button" className="menu-btn" aria-label="Open navigation" onClick={onMenuToggle}>
        <MenuIcon size={18} />
      </button>
      <div className="search">
        <SearchIcon size={14} />
        <input placeholder="Search games, players, transactions…" aria-label="Search" />
        <kbd>⌘ K</kbd>
      </div>
      <div className="header-right">
        <button type="button" className="icon-btn" aria-label="Notifications">
          <BellIcon size={16} />
        </button>
        <button type="button" className="icon-btn" aria-label="Chat">
          <ChatIcon size={16} />
        </button>
        <BalanceChip />
        <Link className="user-pill" to={username ? `/profile/${username}` : '/dashboard'}>
          <Avatar username={username ?? '?'} avatarColor={avatarColor} avatarImage={avatarImage} className="avatar" />
          <span className="name">
            {username ?? 'Guest'}
            <small>PLAYER</small>
          </span>
        </Link>
      </div>
    </header>
  );
}
