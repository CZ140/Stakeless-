import { useEffect } from 'react';
import { useTierCelebrationStore } from '../../stores/tierCelebrationStore';
import { tierColor } from './TierBadge';
import { CoinIcon, ZapIcon, XIcon } from './icons';

// Celebration overlay shown the moment a settled round ranks the player up. Fed
// by the `tier:up` socket event via tierCelebrationStore. Mounted once near the
// app root so it can fire from any page (mid-game, on the leaderboard, anywhere).
export function TierUpModal() {
  const pending = useTierCelebrationStore((s) => s.pending);
  const dismiss = useTierCelebrationStore((s) => s.dismiss);

  // Esc to close while the celebration is open.
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, dismiss]);

  if (!pending) return null;

  const color = tierColor(pending.level);

  return (
    <div className="tierup-overlay" role="dialog" aria-modal="true" aria-label={`${pending.name} tier unlocked`} onClick={dismiss}>
      <div className="tierup-card" style={{ ['--tier-color' as string]: color }} onClick={(e) => e.stopPropagation()}>
        <button className="tierup-close" onClick={dismiss} aria-label="Close">
          <XIcon size={16} />
        </button>

        <div className="tierup-rays" />
        <div className="tierup-gem">
          <svg width="64" height="64" viewBox="0 0 24 24" fill={color} aria-hidden="true">
            <path d="M6 3h12l4 6-10 12L2 9z" opacity="0.95" />
            <path d="M6 3h12l4 6H2z" opacity="0.4" fill="#fff" />
          </svg>
        </div>

        <div className="tierup-eyebrow">Tier unlocked</div>
        <div className="tierup-name">{pending.name}</div>

        <div className="tierup-perks">
          {pending.reward > 0 && (
            <div className="tierup-perk">
              <span className="tierup-perk-ico"><CoinIcon size={18} /></span>
              <span><strong>+{pending.reward.toLocaleString()}</strong> coins reward</span>
            </div>
          )}
          <div className="tierup-perk">
            <span className="tierup-perk-ico"><ZapIcon size={16} /></span>
            <span>Daily bonus raised to <strong>{pending.dailyBonus.toLocaleString()}</strong>/day</span>
          </div>
        </div>

        <button className="btn btn-primary tierup-cta" onClick={dismiss}>
          Keep playing
        </button>
      </div>
    </div>
  );
}
