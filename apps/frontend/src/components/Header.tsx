import { Link } from 'react-router-dom';
import { BalanceDisplay } from './BalanceDisplay';
import { useAuth } from '../contexts/AuthContext';

export function Header() {
  const { signOut } = useAuth();

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 24px',
        backgroundColor: '#1a1a2e',
        color: '#ffffff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      }}
    >
      <Link
        to="/dashboard"
        style={{ color: '#e0d7ff', textDecoration: 'none', fontSize: '1.25rem', fontWeight: 700 }}
      >
        Virtual Casino
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Link to="/profile" style={{ textDecoration: 'none', color: 'inherit' }}>
          <BalanceDisplay />
        </Link>
        <button
          onClick={() => void signOut()}
          style={{
            background: 'none',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#ffffff',
            cursor: 'pointer',
            padding: '6px 14px',
            borderRadius: '4px',
            fontSize: '0.875rem',
          }}
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
