import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { sound, type SoundHandle } from '../lib/sound';
import { prefersReducedMotion } from '../hooks/useReducedMotion';

gsap.registerPlugin(useGSAP);

const WHEEL_SEQUENCE = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const POCKET_ANGLE = 360 / 37;
const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

// Ball orbit radii (px from wheel centre). The ball rides the outer track while
// spinning, then drops inward and settles into the pocket ring.
const BALL_RIM_RADIUS = 180;
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
  const whirRef = useRef<SoundHandle | null>(null);

  // Stop any whir if we unmount mid-spin.
  useEffect(() => () => whirRef.current?.stop(0), []);

  useGSAP(() => {
    if (winningPocket === null || !containerRef.current) return;
    const reduced = prefersReducedMotion();

    // Bring the winning pocket's centre under the 12-o'clock marker. We accumulate
    // from the true (non-modded) last rotation so subsequent spins keep moving forward.
    const pocketIndex = WHEEL_SEQUENCE.indexOf(winningPocket);
    const pocketCentreAngle = pocketIndex * POCKET_ANGLE + POCKET_ANGLE / 2;
    const targetAngle = (360 - pocketCentreAngle) % 360;
    const currentNorm = currentRotationRef.current % 360;
    const delta = (targetAngle - currentNorm + 360) % 360;
    const wheelSpins = reduced ? 1 : 5;
    const targetRotation = currentRotationRef.current + wheelSpins * 360 + delta;

    // The ball orbits counter-clockwise and always rests at the top (a whole number of
    // turns), i.e. over the winning pocket once the wheel has brought it under the marker.
    const ballTurns = reduced ? 2 : 8;
    const ballEnd = ballRotationRef.current - ballTurns * 360;
    // Where the ball begins its final deceleration (last ~1.6 turns).
    const ballMid = ballEnd + (reduced ? 0.8 : 1.6) * 360;

    const finish = () => {
      currentRotationRef.current = targetRotation;
      ballRotationRef.current = ballEnd;
      onSettled();
    };

    if (reduced) {
      const tl = gsap.timeline({ onComplete: finish });
      tl.to(containerRef.current, { rotation: targetRotation, duration: 0.6, ease: 'power3.out' }, 0)
        .to(ballArmRef.current, { rotation: ballEnd, duration: 0.6, ease: 'power3.out' }, 0)
        .fromTo(ballRef.current, { y: -BALL_RIM_RADIUS }, { y: -BALL_REST_RADIUS, duration: 0.6, ease: 'power2.in' }, 0);
      return;
    }

    const SPIN = SPIN_DURATION;
    const dropAt = SPIN - 0.95;
    const tl = gsap.timeline({ onComplete: finish });

    // Wheel: a single strong deceleration that finishes a touch before the ball.
    tl.to(containerRef.current, { rotation: targetRotation, duration: SPIN * 0.86, ease: 'power4.out' }, 0);

    // Ball: fast steady orbit, then an independent deceleration to rest — so it keeps
    // travelling after the wheel has slowed, the way a real ball loses energy last.
    tl.to(ballArmRef.current, { rotation: ballMid, duration: SPIN * 0.55, ease: 'none' }, 0)
      .to(ballArmRef.current, { rotation: ballEnd, duration: SPIN * 0.45, ease: 'power3.out' }, SPIN * 0.55);

    // Ball rides the outer track, then drops inward and bounces into the pocket ring.
    tl.set(ballRef.current, { y: -BALL_RIM_RADIUS }, 0)
      .to(ballRef.current, { y: -BALL_REST_RADIUS, duration: 0.95, ease: 'bounce.out' }, dropAt);

    // ── Audio ──
    whirRef.current = sound.whir();
    tl.call(() => whirRef.current?.stop(1300), [], SPIN * 0.58); // fade the whir as it slows
    // Rattle ticks that space out as the ball loses energy.
    let t = dropAt - 0.25;
    let gap = 0.07;
    for (let i = 0; i < 7; i++) {
      tl.call(() => sound.tick(), [], t);
      t += gap;
      gap *= 1.3;
    }
    tl.call(() => sound.ballDrop(), [], SPIN - 0.08);
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
