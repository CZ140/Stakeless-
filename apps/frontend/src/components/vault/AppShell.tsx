import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useSocial } from '../../hooks/useSocial';

// The Vault app shell: fixed sidebar + top bar, with a scrolling content area.
// Pages render their content as children inside <main>.
//
// On small screens the sidebar becomes an off-canvas drawer toggled by the
// hamburger in the top bar; a backdrop closes it, and any route change
// dismisses it automatically.
export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  // Seed + live-update the social badges (friend requests, group invites).
  useSocial();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className={'shell' + (navOpen ? ' nav-open' : '')}>
      <Sidebar onNavigate={() => setNavOpen(false)} />
      <button
        type="button"
        className="nav-backdrop"
        aria-label="Close navigation"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />
      <div className="main-col">
        <TopBar onMenuToggle={() => setNavOpen((v) => !v)} />
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
