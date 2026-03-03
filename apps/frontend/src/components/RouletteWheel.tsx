import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

const WHEEL_SEQUENCE = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const POCKET_ANGLE = 360 / 37;
const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

function getPocketColor(pocket: number): string {
  if (pocket === 0) return '#16a34a';
  return RED_NUMBERS.has(pocket) ? '#dc2626' : '#111827';
}

// Build conic-gradient string from wheel sequence
function buildConicGradient(): string {
  const stops = WHEEL_SEQUENCE.map((pocket, i) => {
    const start = i * POCKET_ANGLE;
    const end = (i + 1) * POCKET_ANGLE;
    const color = getPocketColor(pocket);
    return `${color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
  });
  return `conic-gradient(from 0deg, ${stops.join(', ')})`;
}

interface RouletteWheelProps {
  winningPocket: number | null;
  onSettled: () => void;
}

export function RouletteWheel({ winningPocket, onSettled }: RouletteWheelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentRotationRef = useRef(0);

  useGSAP(() => {
    if (winningPocket === null || !containerRef.current) return;
    const pocketIndex = WHEEL_SEQUENCE.indexOf(winningPocket);
    // Each pocket's leading edge sits at pocketIndex * POCKET_ANGLE degrees clockwise from 12 o'clock.
    // To bring that pocket's centre under the 12 o'clock marker, the wheel must rotate by
    // pocketIndex * POCKET_ANGLE + POCKET_ANGLE/2 degrees. We add 5 full extra rotations so the
    // spin is always visually dramatic, and we accumulate from the true (non-modded) last rotation
    // so that subsequent spins keep rotating forward instead of snapping back.
    const pocketCentreAngle = pocketIndex * POCKET_ANGLE + POCKET_ANGLE / 2;
    // Normalise current accumulated rotation to [0, 360) so the next pocketCentreAngle is always
    // reached by moving forward. Then add 5 full rotations minimum.
    const currentNorm = currentRotationRef.current % 360;
    // How far forward we need to rotate from the current normalised position to reach the target.
    // Always move forward (clockwise): if the target is behind us in the circle, wrap around.
    const delta = (pocketCentreAngle - currentNorm + 360) % 360;
    const targetRotation = currentRotationRef.current + 5 * 360 + delta;
    gsap.to(containerRef.current, {
      rotation: targetRotation,
      duration: 6,
      ease: 'power3.out',
      onComplete: () => {
        // Store the full accumulated rotation — NOT modded — so next spin starts from here.
        currentRotationRef.current = targetRotation;
        onSettled();
      },
    });
  }, { dependencies: [winningPocket] });

  return (
    <div style={{ position: 'relative', width: '400px', height: '400px', margin: '0 auto' }}>
      {/* Top marker */}
      <div style={{
        position: 'absolute', top: '-4px', left: '50%',
        transform: 'translateX(-50%)',
        width: 0, height: 0,
        borderLeft: '8px solid transparent',
        borderRight: '8px solid transparent',
        borderTop: '16px solid #e0d7ff',
        zIndex: 10,
      }} />
      {/* Wheel */}
      <div ref={containerRef} style={{
        width: '400px', height: '400px',
        borderRadius: '50%',
        background: buildConicGradient(),
        position: 'relative',
        border: '4px solid #2d2d4e',
      }}>
        {/* Number labels */}
        {WHEEL_SEQUENCE.map((pocket, i) => {
          const angle = i * POCKET_ANGLE + POCKET_ANGLE / 2; // center of sector
          return (
            <div
              key={pocket}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: '24px',
                height: '24px',
                marginTop: '-12px',
                marginLeft: '-12px',
                transform: `rotate(${angle}deg) translateY(-170px)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.65rem',
                fontWeight: 700,
                color: '#ffffff',
                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
              }}
            >
              <span style={{ transform: `rotate(${-angle}deg)` }}>{pocket}</span>
            </div>
          );
        })}
        {/* Center hub */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '60px', height: '60px',
          borderRadius: '50%',
          backgroundColor: '#0d0d1a',
          border: '3px solid #2d2d4e',
        }} />
      </div>
    </div>
  );
}
