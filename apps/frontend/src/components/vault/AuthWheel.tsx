// Decorative half-bleed roulette wheel for the auth screens. Purely visual
// (aria-hidden) — the shared wheel artwork that rotates slowly (via the
// .roulette-wheel CSS animation), with a fixed light/shadow overlay for a 3D feel.

import { WheelFaceSvg, WheelShineSvg } from './WheelGraphic';

export function AuthWheel() {
  return (
    <div className="wheel-stage" aria-hidden="true">
      <div className="wheel-floor" />
      <WheelFaceSvg className="roulette-wheel" />
      <WheelShineSvg className="wheel-shine" />
    </div>
  );
}
