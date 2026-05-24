import type { ReactNode } from 'react';
import { BrandMark } from './BrandMark';
import { AuthWheel } from './AuthWheel';

// Pre-login shell shared by sign in / register / forgot. Renders the half-bleed
// roulette-wheel background, brand lockup, the card slot, and the legal footer.
export function AuthLayout({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="auth-stage">
      <AuthWheel />
      <div className="negative-fade" aria-hidden="true" />

      <div className="auth-top">
        <div className="auth-brand">
          <BrandMark size={38} />
          <div>
            <div className="brand-word">Stake<em>less</em></div>
            <div className="brand-tag">no real stakes</div>
          </div>
        </div>
        <div className="status-strip">
          <span><span className="dot" />ALL SYSTEMS LIVE</span>
          <span className="sep">·</span>
          <span>VIRTUAL COINS</span>
          <span className="sep">·</span>
          <span>v 1.0.0</span>
        </div>
      </div>

      <div className="auth-body">
        <div className="auth-card-wrap">
          {children}
          {aside}
        </div>
      </div>

      <div className="auth-foot">
        VIRTUAL COINS<span className="sep">·</span>NO REAL MONEY<span className="sep">·</span>18+
        <span className="sep">·</span>BY SIGNING IN YOU ACCEPT THE TERMS
      </div>
    </div>
  );
}
