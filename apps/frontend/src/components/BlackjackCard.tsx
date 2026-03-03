import { useEffect, useRef } from 'react';

interface BlackjackCardProps {
  card: { suit: string; rank: string } | 'facedown';
  animateIn?: boolean;  // triggers slide-in CSS animation on mount
}

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '\u2665',
  diamonds: '\u2666',
  spades: '\u2660',
  clubs: '\u2663',
};

const RED_SUITS = new Set(['hearts', 'diamonds']);

function getSuitColor(suit: string): string {
  return RED_SUITS.has(suit) ? '#dc2626' : '#1a1a2e';
}

// Inject keyframe animation into document once
let animationInjected = false;
function ensureAnimation() {
  if (animationInjected) return;
  animationInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes bj-card-slide-in {
      from { transform: translateY(-20px); opacity: 0; }
      to   { transform: translateY(0);     opacity: 1; }
    }
    .bj-card-animate {
      animation: bj-card-slide-in 300ms ease-out forwards;
    }
  `;
  document.head.appendChild(style);
}

export function BlackjackCard({ card, animateIn = false }: BlackjackCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ensureAnimation();
  }, []);

  useEffect(() => {
    if (animateIn && cardRef.current) {
      const el = cardRef.current;
      el.classList.remove('bj-card-animate');
      // Force reflow
      void el.offsetWidth;
      el.classList.add('bj-card-animate');
    }
  }, [animateIn]);

  if (card === 'facedown') {
    return (
      <div
        ref={cardRef}
        style={{
          width: '70px',
          height: '100px',
          borderRadius: '8px',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #2d2d4e 50%, #1a1a2e 100%)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          border: '1px solid #4a4a6e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          backgroundImage: `repeating-linear-gradient(
            45deg,
            transparent,
            transparent 4px,
            rgba(255,255,255,0.04) 4px,
            rgba(255,255,255,0.04) 8px
          )`,
        }}
      >
        <span style={{ fontSize: '1.5rem', opacity: 0.3 }}>?</span>
      </div>
    );
  }

  const { suit, rank } = card;
  const suitSymbol = SUIT_SYMBOLS[suit] ?? suit;
  const color = getSuitColor(suit);

  return (
    <div
      ref={cardRef}
      style={{
        width: '70px',
        height: '100px',
        borderRadius: '8px',
        backgroundColor: '#ffffff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        border: '1px solid #d1d5db',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '4px 5px',
        flexShrink: 0,
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* Top-left corner */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color }}>{rank}</span>
        <span style={{ fontSize: '0.7rem', color }}>{suitSymbol}</span>
      </div>

      {/* Center suit */}
      <div style={{ textAlign: 'center', fontSize: '1.4rem', color }}>
        {suitSymbol}
      </div>

      {/* Bottom-right corner (rotated 180deg) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          lineHeight: 1.1,
          transform: 'rotate(180deg)',
        }}
      >
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color }}>{rank}</span>
        <span style={{ fontSize: '0.7rem', color }}>{suitSymbol}</span>
      </div>
    </div>
  );
}

export default BlackjackCard;
