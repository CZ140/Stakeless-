import { useNavigate } from 'react-router-dom';

export interface GameCardProps {
  id: string;
  name: string;
  icon: string;
  description: string;
  route: string;
  available: boolean;
}

export function GameCard({ name, icon, description, route, available }: GameCardProps) {
  const navigate = useNavigate();

  return (
    <div
      style={{
        backgroundColor: '#1a1a2e',
        borderRadius: '12px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        minWidth: '180px',
        flex: '1',
        opacity: available ? 1 : 0.5,
        cursor: available ? 'pointer' : 'default',
        border: available ? '1px solid #2d2d4e' : '1px solid #1a1a2e',
        transition: 'border-color 0.2s',
        position: 'relative',
      }}
    >
      <span style={{ fontSize: '2.5rem' }}>{icon}</span>
      <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#e0d7ff', fontWeight: 600 }}>
        {name}
      </h3>
      <p style={{ margin: 0, fontSize: '0.85rem', color: '#718096', textAlign: 'center' }}>
        {description}
      </p>
      {available ? (
        <button
          onClick={() => navigate(route)}
          style={{
            marginTop: '8px',
            padding: '8px 24px',
            backgroundColor: '#7c3aed',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Play
        </button>
      ) : (
        <span
          style={{
            marginTop: '8px',
            padding: '6px 16px',
            backgroundColor: '#2d2d4e',
            color: '#718096',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: 500,
          }}
        >
          Coming Soon
        </span>
      )}
    </div>
  );
}
