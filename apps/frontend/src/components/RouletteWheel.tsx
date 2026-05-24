import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

const WHEEL_SEQUENCE = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const POCKET_ANGLE = 360 / 37;
const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

// Ball orbit radii (px from wheel centre). The ball rides the outer rim while
// spinning, then eases inward to settle into the pocket as it comes to rest.
const BALL_RIM_RADIUS = 168;
const BALL_REST_RADIUS = 150;
const SPIN_DURATION = 6;

function getPocketColor(pocket: number): string {
  if (pocket === 0) return '#00E082';
  return RED_NUMBERS.has(pocket) ? '#C8364B' : '#0a0f15';
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
  const ballArmRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const currentRotationRef = useRef(0);
  const ballRotationRef = useRef(0);

  useGSAP(() => {
    if (winningPocket === null || !containerRef.current) return;
    const pocketIndex = WHEEL_SEQUENCE.indexOf(winningPocket);
    // Each pocket's leading edge sits at pocketIndex * POCKET_ANGLE degrees clockwise from 12 o'clock.
    // To bring that pocket's centre under the 12 o'clock marker, the wheel must rotate by
    // pocketIndex * POCKET_ANGLE + POCKET_ANGLE/2 degrees. We add 5 full extra rotations so the
    // spin is always visually dramatic, and we accumulate from the true (non-modded) last rotation
    // so that subsequent spins keep rotating forward instead of snapping back.
    const pocketCentreAngle = pocketIndex * POCKET_ANGLE + POCKET_ANGLE / 2;
    // When the wheel rotates clockwise by R degrees, the gradient position under the top arrow is
    // (360 - R%360) % 360. To land pocketCentreAngle under the arrow we need:
    //   R % 360 = (360 - pocketCentreAngle) % 360
    const targetAngle = (360 - pocketCentreAngle) % 360;
    const currentNorm = currentRotationRef.current % 360;
    const delta = (targetAngle - currentNorm + 360) % 360;
    const targetRotation = currentRotationRef.current + 5 * 360 + delta;

    // The ball orbits counter-clockwise (opposite the wheel) and always settles at
    // the top (12 o'clock) — exactly where the winning pocket comes to rest — so it
    // visibly ends up sitting in the winning pocket. 6 full turns for drama.
    const ballTarget = ballRotationRef.current - 6 * 360;

    const tl = gsap.timeline({
      onComplete: () => {
        // Store the full accumulated rotations — NOT modded — so the next spin
        // starts from here and keeps moving in the same direction.
        currentRotationRef.current = targetRotation;
        ballRotationRef.current = ballTarget;
        onSettled();
      },
    });
    tl.to(containerRef.current, { rotation: targetRotation, duration: SPIN_DURATION, ease: 'power3.out' }, 0);
    tl.to(ballArmRef.current, { rotation: ballTarget, duration: SPIN_DURATION, ease: 'power3.out' }, 0);
    // Ride the rim, then ease inward into the pocket during the final third of the spin.
    tl.fromTo(
      ballRef.current,
      { y: -BALL_RIM_RADIUS },
      { y: -BALL_REST_RADIUS, duration: SPIN_DURATION, ease: 'power2.in' },
      0,
    );
  }, { dependencies: [winningPocket] });

  return (
    <div className="roulette-wheel-scaler">
    <div className="roulette-wheel-root" style={{ position: 'relative', width: '400px', height: '400px' }}>
      {/* Top marker */}
      <div style={{
        position: 'absolute', top: '-4px', left: '50%',
        transform: 'translateX(-50%)',
        width: 0, height: 0,
        borderLeft: '9px solid transparent',
        borderRight: '9px solid transparent',
        borderTop: '16px solid #D4A857',
        filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))',
        zIndex: 10,
      }} />
      {/* Wheel */}
      <div ref={containerRef} style={{
        width: '400px', height: '400px',
        borderRadius: '50%',
        background: buildConicGradient(),
        position: 'relative',
        border: '4px solid #B58E3D',
        boxShadow: 'inset 0 0 0 12px #161B23, inset 0 0 60px rgba(0,0,0,0.5), 0 30px 80px rgba(0,0,0,0.6)',
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
          width: '84px', height: '84px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #2a3340, #0a0f15)',
          border: '2px solid #B58E3D',
          boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.05), inset 0 -2px 4px rgba(0,0,0,0.4)',
        }} />
      </div>

      {/* Ball orbit arm — sits above the wheel, rotates independently to orbit the ball.
          The ball rests at the top (12 o'clock) where the winning pocket settles. */}
      <div
        ref={ballArmRef}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 5,
        }}
      >
        <div
          ref={ballRef}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '15px',
            height: '15px',
            marginTop: '-7.5px',
            marginLeft: '-7.5px',
            transform: `translateY(-${BALL_REST_RADIUS}px)`,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 30%, #ffffff, #c8ccd4 70%, #9aa0aa)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.8)',
          }}
        />
      </div>
    </div>
    </div>
  );
}
