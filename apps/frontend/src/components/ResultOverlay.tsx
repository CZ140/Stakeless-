import { motion, AnimatePresence } from 'framer-motion';

interface ResultOverlayProps {
  visible: boolean;
  winningPocket: number | null;
  netAmount: number;       // profit - totalBet (negative = loss, positive = win)
}

const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

function getPocketLabel(pocket: number): { color: string; label: string } {
  if (pocket === 0) return { color: '#16a34a', label: 'Green' };
  return RED_NUMBERS.has(pocket)
    ? { color: '#dc2626', label: 'Red' }
    : { color: '#374151', label: 'Black' };
}

export function ResultOverlay({ visible, winningPocket, netAmount }: ResultOverlayProps) {
  const pocket = winningPocket ?? 0;
  const { color, label } = getPocketLabel(pocket);
  const won = netAmount > 0;
  const push = netAmount === 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="result-overlay"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.25 }}
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#1a1a2e',
            border: `2px solid ${won ? '#7c3aed' : '#4a4a6e'}`,
            borderRadius: '16px',
            padding: '32px 40px',
            zIndex: 100,
            textAlign: 'center',
            minWidth: '240px',
            boxShadow: won ? '0 0 32px rgba(124,58,237,0.4)' : 'none',
          }}
        >
          <div style={{ fontSize: '3rem', fontWeight: 800, color, marginBottom: '8px' }}>
            {pocket}
          </div>
          <div style={{ color: '#718096', marginBottom: '16px', fontSize: '0.9rem' }}>
            {label}
          </div>
          <div style={{
            fontSize: '1.4rem', fontWeight: 700,
            color: won ? '#a78bfa' : push ? '#e0d7ff' : '#ef4444',
            marginBottom: '8px',
          }}>
            {won ? `+${netAmount}` : push ? '+/-0' : `${netAmount}`} coins
          </div>
          <div style={{ color: '#718096', fontSize: '0.78rem', marginTop: '8px' }}>
            Press Spin to play again
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
