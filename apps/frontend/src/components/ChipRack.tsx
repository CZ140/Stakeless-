import { useRouletteStore } from '../stores/rouletteStore';
import { useBalanceStore } from '../stores/balanceStore';

const CHIP_AMOUNTS = [10, 50, 100, 500] as const;

interface ChipRackProps {
  onSpin: () => void;
  /** Disables bet-adjustment controls (undo, clear, half, double, rebet) */
  disabled: boolean;
  /** Disables the Spin button specifically — separate from bet controls */
  spinDisabled: boolean;
  totalBet: number;
  /** When true, result overlay is showing — Spin button label changes to communicate action */
  showingResult?: boolean;
}

export function ChipRack({ onSpin, disabled, spinDisabled, totalBet, showingResult }: ChipRackProps) {
  const { selectedChip, setSelectedChip, undoLast, clearAll, halfBet, doubleBet, isMuted, toggleMute } = useRouletteStore();
  const balance = useBalanceStore((s) => s.balance);

  function handleMaxChip() {
    setSelectedChip(balance ?? 1); // live balance value at click time
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Chip denominations */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {CHIP_AMOUNTS.map((amount) => (
          <button
            key={amount}
            onClick={() => setSelectedChip(amount)}
            style={{
              width: '52px', height: '52px',
              borderRadius: '50%',
              backgroundColor: selectedChip === amount ? '#7c3aed' : '#2d2d4e',
              color: '#ffffff',
              border: selectedChip === amount ? '3px solid #e0d7ff' : '2px solid #4a4a6e',
              fontWeight: 700, fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            {amount}
          </button>
        ))}
        <button
          onClick={handleMaxChip}
          style={{
            width: '52px', height: '52px',
            borderRadius: '50%',
            backgroundColor: '#2d2d4e',
            color: '#e0d7ff',
            border: '2px solid #4a4a6e',
            fontWeight: 700, fontSize: '0.75rem',
            cursor: 'pointer',
          }}
        >
          Max
        </button>
      </div>

      {/* Bet controls */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {[
          { label: '1/2', action: halfBet },
          { label: '2x', action: doubleBet },
          { label: 'Undo', action: undoLast },
          { label: 'Clear', action: clearAll },
        ].map(({ label, action }) => (
          <button
            key={label}
            onClick={action}
            disabled={disabled}
            style={{
              padding: '8px 14px',
              backgroundColor: '#1a1a2e',
              color: '#e0d7ff',
              border: '1px solid #2d2d4e',
              borderRadius: '6px',
              fontSize: '0.85rem',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => {
            const raw = localStorage.getItem('lastBet_roulette');
            if (!raw) return;
            try {
              const chips = JSON.parse(raw) as import('../stores/rouletteStore').PlacedChip[];
              useRouletteStore.getState().rebet(chips);
            } catch { /* ignore corrupt data */ }
          }}
          disabled={disabled}
          style={{
            padding: '8px 14px',
            backgroundColor: '#1a1a2e',
            color: '#e0d7ff',
            border: '1px solid #2d2d4e',
            borderRadius: '6px',
            fontSize: '0.85rem',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          Rebet
        </button>
        <button
          onClick={toggleMute}
          style={{
            padding: '8px 12px',
            backgroundColor: '#1a1a2e',
            color: isMuted ? '#718096' : '#e0d7ff',
            border: '1px solid #2d2d4e',
            borderRadius: '6px',
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          {isMuted ? 'Mute' : 'Sound'}
        </button>
      </div>

      {/* Total bet display + Spin button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ color: '#718096', fontSize: '0.9rem' }}>
          Total: <strong style={{ color: '#e0d7ff' }}>{totalBet}</strong> coins
        </span>
        <button
          onClick={onSpin}
          disabled={spinDisabled || (!showingResult && totalBet === 0)}
          style={{
            padding: '12px 32px',
            backgroundColor: spinDisabled || (!showingResult && totalBet === 0) ? '#2d2d4e' : '#7c3aed',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: 700,
            cursor: spinDisabled || (!showingResult && totalBet === 0) ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
          }}
        >
          {spinDisabled ? 'Spinning...' : showingResult ? 'Play Again' : 'Spin'}
        </button>
      </div>
    </div>
  );
}
