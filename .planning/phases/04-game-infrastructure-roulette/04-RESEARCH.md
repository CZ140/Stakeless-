# Phase 4: Game Infrastructure & Roulette - Research

**Researched:** 2026-03-02
**Domain:** Casino game UI (GSAP animation, Web Audio API, roulette table layout, multi-bet state) + Express game route (multi-bet Zod validation, roulette resolution, deductBet/settleBet pipeline)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Wheel Animation**
- Library: GSAP (free tier) — Framer Motion is already installed but not chosen for the wheel; GSAP gives the smoothest deceleration curves for a 5–8 second dramatic spin
- Duration: 5–8 seconds (dramatic, builds tension)
- Ball behavior: Simple decelerate — the wheel itself decelerates and brings the server-determined pocket under the marker; no separate orbiting ball animation
- View: Top-down circular wheel (bird's-eye view), all 37 numbered pockets visible in a circle
- Numbers: Always legible while spinning (wheel rotates slowly enough that pockets are readable)

**Bet Placement UX (Multi-bet)**
- Layout: Visual roulette table layout — green felt grid showing the numbered pockets (0–36) plus all outside bet zones (Red/Black, Odd/Even, Dozens, Columns)
- Players can place chips on multiple bet zones simultaneously per spin (multi-bet)
- Chip placement flow: player selects a chip denomination from the chip rack first, then clicks a table zone to place that chip value; each click places one chip
- Chip rack values: 10 / 50 / 100 / 500 / Max (satisfies GINF-06)
- Undo controls: "Undo Last" (removes the last chip placed) and "Clear All" (removes all chips)
- Half / Double buttons operate on the total bet amount across all placed chips (GINF-06)
- Post-spin: table clears after each round — player places fresh bets each spin
- Last-bet prefill (GINF-07): restore the previous round's chip layout via a "Rebet" button (or auto-restore from localStorage); pre-selects the last chip denomination used

**Game Navigation**
- Game cards on the dashboard: all four games (Roulette, Plinko, Mines, Blackjack) appear as cards on the DashboardPage below the daily bonus section
- Non-built games (Phase 5) show as "Coming Soon" with a locked/dimmed appearance
- Card content: game icon/emoji + name + one-line description + Play button (or "Coming Soon" badge)
- Card layout: horizontal row
- Game pages use the same Header component (balance display + Sign Out)
- Roulette page route: /games/roulette

**Win/Loss Feedback (Subtle)**
- After the wheel stops: winning pocket on the wheel highlights/glows + pocket number and color display as result badge
- Result box: overlaying/appearing near wheel showing winning number, pocket color, applicable multiplier, net amount won/lost
- Result box stays until player explicitly dismisses it (clicks "Play Again" or "Place Bets")
- Win sound: short bright chime via Web Audio API
- Loss sound: short low tone via Web Audio API
- Mute toggle persists across sessions via localStorage (GINF-08)

**How-To-Play Rules Panel (GINF-09)**
- Accessible from within the Roulette game page
- Claude's Discretion: modal vs collapsible sidebar

### Claude's Discretion
- Exact GSAP easing curve for the wheel deceleration
- Result box visual design (position, size, animation in/out)
- How-to-play panel format (modal or collapsible)
- Web Audio API tone frequencies and durations
- Exact styling of the chip rack and table layout (colors, grid proportions) — must stay within the established dark theme
- Last-bet prefill storage mechanism (localStorage key per game)

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GINF-06 | Each game shows quick-select bet chips (10 / 50 / 100 / 500 / Max) plus Half and Double buttons | Chip rack component pattern; Half/Double mutate total across placed chips array in Zustand roulette store |
| GINF-07 | Each game pre-fills the bet amount with the user's last bet on that game | `localStorage` key `lastBet_roulette` stores serialized chip placement array; "Rebet" button restores it |
| GINF-08 | Each game plays win or loss animation and sound effect; mute toggle persists via localStorage | Web Audio API oscillator pattern (no library needed); `localStorage` key `mute` for toggle; AudioContext must resume from user gesture |
| GINF-09 | Each game has an accessible how-to-play rules panel (modal or collapsible) | Modal using Framer Motion AnimatePresence — already installed; no new library needed |
| ROUL-01 | User can play European Roulette (single zero, 37 pockets) | Full pocket sequence documented; `crypto.randomInt(0, 37)` selects winning pocket index |
| ROUL-02 | User can place Red/Black bets | Red/black number sets documented; server validates and pays 1:1 |
| ROUL-03 | User can place Odd/Even bets | Odd/even resolution excludes 0; pays 1:1 |
| ROUL-04 | User can place straight-up single number bets | Number 0–36; pays 35:1 |
| ROUL-05 | User can place Dozens bets (1–12, 13–24, 25–36) | Each dozen covers 12 numbers; pays 2:1 |
| ROUL-06 | User can place Columns bets | 3 columns × 12 numbers each; pays 2:1 |
| ROUL-07 | Animated wheel spin reveals the result; ball decelerates realistically before stopping | GSAP 3.14 + @gsap/react 2.1 — `gsap.to(wheelRef, { rotation: targetDeg, duration: 6, ease: 'power3.out' })` |
</phase_requirements>

---

## Summary

Phase 4 builds two things in parallel: shared game infrastructure (chip rack, sound system, last-bet prefill, rules panel) that all Phase 5+ games will inherit, and Roulette as the first fully resolved game. The backend adds a `gamesRouter` at `/api/games` following the existing `walletRouter` pattern, with a new `POST /api/games/roulette/bet` endpoint that accepts an array of typed bets, resolves them against a `crypto.randomInt(0, 37)` outcome, and calls `deductBet`/`settleBet` from `walletService.ts` unchanged. The frontend adds a `RoulettePage` at `/games/roulette` with three main visual areas: the GSAP-animated top-down wheel, the CSS Grid betting table, and the chip rack control panel.

The animation decision is settled: GSAP 3.14 with `@gsap/react` 2.1 using `power3.out` easing on the wheel `rotation` property. GSAP became fully free (including all premium plugins) as of April 30, 2025 after Webflow's acquisition — no licensing concern. The core pattern is `gsap.to(wheelRef.current, { rotation: currentRotation + fullSpins + offsetToTargetPocket, duration: 6, ease: 'power3.out' })` where `offsetToTargetPocket` is calculated from the winning pocket index and the fixed 37-pocket angular layout. Sound effects use the native Web Audio API (no extra library) with a GainNode master volume node that is set to 0 for mute — the AudioContext must be created or resumed from a user gesture (button click) due to browser autoplay policy.

The multi-bet state (an array of `{ zone: string, amount: number }` entries) lives in a local Zustand store scoped to `RoulettePage`. The server receives this array, validates it with Zod (all zones valid, each amount >= 1, total <= balance), runs a single `deductBet` for the total, resolves the wheel, then runs a single `settleBet` for the net profit. The `gameLogs` entry records `gameType: 'roulette'`, `outcome` as the winning pocket number string, and `profit` as net coins. The `outcome` column in `game_logs` is `varchar(50)` — sufficient for a pocket number like `"32"`.

**Primary recommendation:** Use GSAP 3.14 + @gsap/react 2.1 for the wheel, Web Audio API natively for sound, Zustand (already installed) for bet state, and extend the existing `walletService.ts` pipeline (deductBet + settleBet) without modification.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| gsap | 3.14.2 | Wheel rotation animation with precise deceleration | Only animation library with `power3.out` smoothness required; GSAP is the industry standard for performant DOM-based animation |
| @gsap/react | 2.1.2 | React lifecycle integration (useGSAP hook) | Drop-in replacement for useEffect that auto-cleans GSAP animations on unmount; prevents React StrictMode double-animation bugs |
| zustand | 5.0.11 | Multi-bet chip placement state | Already installed; v5 double-parens TS pattern already established in project (`create<State>()((set) => ...)`) |
| framer-motion | 12.34.4 | How-to-play modal animate in/out, result box fade | Already installed; AnimatePresence for mount/unmount transitions |
| Web Audio API | Native (no install) | Win/loss sound tones | No library needed for two simple oscillator tones; avoids a dependency |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 3.22+ (already installed backend) | Multi-bet array validation on server | Validates bet array shape, zone names, individual amounts, total <= balance |
| localStorage (native) | Native | Mute toggle, last-bet prefill | `mute` key (boolean), `lastBet_roulette` key (serialized chip array) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GSAP for wheel | Framer Motion | Framer Motion 12 is already installed but lacks fine-grained ease control over multi-rotation sequences; GSAP's `power3.out` on `rotation` (which accumulates correctly across multiple spins) is the right tool; locked decision |
| Web Audio API natively | Howler.js or use-sound | Adding a library for two beep tones adds unnecessary bundle weight; Web Audio API oscillator is sufficient and zero-dependency |
| Zustand local store | React useState | With multi-chip placement (undo history, half/double, rebet), useState would require prop-drilling or lifting; Zustand slice is cleaner and consistent with project pattern |

**Installation (new packages only):**
```bash
pnpm --filter frontend add gsap @gsap/react
```

---

## Architecture Patterns

### Recommended Project Structure

```
apps/
├── backend/
│   └── src/
│       ├── routes/
│       │   └── games.ts            # gamesRouter — POST /api/games/roulette/bet
│       ├── services/
│       │   └── rouletteService.ts  # resolveRouletteBets(winningPocket, bets[]) => netProfit
│       └── middleware/
│           └── validateBet.ts      # (existing — may need roulette multi-bet variant)
└── frontend/
    └── src/
        ├── pages/
        │   └── RoulettePage.tsx    # top-level page: wheel + table + panel
        ├── components/
        │   ├── RouletteWheel.tsx   # GSAP-animated SVG/CSS wheel
        │   ├── RouletteTable.tsx   # CSS Grid betting table (0 + 1–36 + outside zones)
        │   ├── ChipRack.tsx        # 10/50/100/500/Max selector + Half/Double/Undo/Clear/Rebet
        │   ├── ResultOverlay.tsx   # win/loss result box (Framer Motion fade-in)
        │   ├── HowToPlayModal.tsx  # rules panel (Framer Motion AnimatePresence)
        │   └── GameCard.tsx        # reusable card for DashboardPage game grid
        └── stores/
            └── rouletteStore.ts    # Zustand: selectedChip, placedBets[], gamePhase, mute
```

### Pattern 1: GSAP Wheel Rotation to Target Pocket

**What:** Calculate the exact rotation degrees needed to land the wheel on the server-determined pocket, then animate with `power3.out` easing.
**When to use:** Every time the server returns a winning pocket number from `POST /api/games/roulette/bet`.

**European wheel pocket sequence (clockwise, starting at top):**
```
0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
```
Each pocket spans `360 / 37 ≈ 9.73°`.

**Example:**
```typescript
// Source: GSAP official docs (https://gsap.com/resources/React/) + project pattern
import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

const WHEEL_SEQUENCE = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const POCKET_ANGLE = 360 / 37; // ≈ 9.73° per pocket

function RouletteWheel({ winningPocket, onSettled }: { winningPocket: number | null; onSettled: () => void }) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const currentRotationRef = useRef(0);

  useGSAP(() => {
    if (winningPocket === null) return;

    const pocketIndex = WHEEL_SEQUENCE.indexOf(winningPocket);
    const pocketAngle = pocketIndex * POCKET_ANGLE;
    // Add 5 full spins (1800°) + offset to bring pocket under top marker
    // Subtract pocketAngle because clockwise rotation moves pocket to top
    const targetRotation = currentRotationRef.current + 1800 + (360 - pocketAngle % 360);

    gsap.to(wheelRef.current, {
      rotation: targetRotation,
      duration: 6,
      ease: 'power3.out',
      onComplete: () => {
        currentRotationRef.current = targetRotation % 360;
        onSettled();
      },
    });
  }, { dependencies: [winningPocket] });

  return <div ref={wheelRef} className="roulette-wheel">{/* 37 pocket sectors */}</div>;
}
```

### Pattern 2: Multi-Bet State in Zustand

**What:** A Zustand store manages the chip placement list as an append-only array. Undo pops the last entry; Clear empties it; Half/Double scales all entry amounts.
**When to use:** All bet placement interactions on the table layout.

```typescript
// Source: project pattern (balanceStore.ts + Zustand v5 docs)
import { create } from 'zustand';

export type BetZone =
  | 'red' | 'black' | 'odd' | 'even'
  | 'dozen_1' | 'dozen_2' | 'dozen_3'
  | 'col_1' | 'col_2' | 'col_3'
  | `number_${number}`; // 'number_0' through 'number_36'

export interface PlacedChip {
  zone: BetZone;
  amount: number;
}

interface RouletteState {
  selectedChip: number;           // currently selected denomination
  placedChips: PlacedChip[];      // all chips placed this round
  gamePhase: 'betting' | 'spinning' | 'result';
  isMuted: boolean;
  setSelectedChip: (amount: number) => void;
  placeChip: (zone: BetZone) => void;
  undoLast: () => void;
  clearAll: () => void;
  halfBet: () => void;
  doubleBet: () => void;
  rebet: (chips: PlacedChip[]) => void;
  setGamePhase: (phase: RouletteState['gamePhase']) => void;
  toggleMute: () => void;
}

export const useRouletteStore = create<RouletteState>()((set, get) => ({
  selectedChip: 10,
  placedChips: [],
  gamePhase: 'betting',
  isMuted: localStorage.getItem('mute') === 'true',
  setSelectedChip: (amount) => set({ selectedChip: amount }),
  placeChip: (zone) => set((s) => ({
    placedChips: [...s.placedChips, { zone, amount: s.selectedChip }],
  })),
  undoLast: () => set((s) => ({ placedChips: s.placedChips.slice(0, -1) })),
  clearAll: () => set({ placedChips: [] }),
  halfBet: () => set((s) => ({
    placedChips: s.placedChips.map((c) => ({ ...c, amount: Math.max(1, Math.floor(c.amount / 2)) })),
  })),
  doubleBet: () => set((s) => ({
    placedChips: s.placedChips.map((c) => ({ ...c, amount: c.amount * 2 })),
  })),
  rebet: (chips) => set({ placedChips: chips }),
  setGamePhase: (phase) => set({ gamePhase: phase }),
  toggleMute: () => set((s) => {
    const next = !s.isMuted;
    localStorage.setItem('mute', String(next));
    return { isMuted: next };
  }),
}));
```

### Pattern 3: Backend Multi-Bet Roulette Route

**What:** `POST /api/games/roulette/bet` receives an array of typed bets, validates total with Zod, runs single deductBet, resolves outcome, runs single settleBet.

```typescript
// gamesRouter — follows walletRouter pattern (apps/backend/src/routes/wallet.ts)
import { Router, type IRouter } from 'express';
import { randomInt } from 'node:crypto';
import { requireAuth } from '../middleware/requireAuth.js';
import { deductBet, settleBet } from '../services/walletService.js';
import { resolveRouletteBets } from '../services/rouletteService.js';
import { z } from 'zod';

export const gamesRouter: IRouter = Router();

const betZoneSchema = z.union([
  z.literal('red'), z.literal('black'),
  z.literal('odd'), z.literal('even'),
  z.literal('dozen_1'), z.literal('dozen_2'), z.literal('dozen_3'),
  z.literal('col_1'), z.literal('col_2'), z.literal('col_3'),
  z.string().regex(/^number_([0-9]|[12][0-9]|3[0-6])$/, 'Invalid number bet'),
]);

const rouletteBetSchema = z.object({
  bets: z.array(z.object({
    zone: betZoneSchema,
    amount: z.number().int().min(1),
  })).min(1, 'At least one bet required').max(50, 'Too many bets'),
});

gamesRouter.post('/roulette/bet', requireAuth, async (req, res) => {
  const parsed = rouletteBetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid bets' });
    return;
  }

  const userId = req.user!.id;
  const { bets } = parsed.data;
  const totalBet = bets.reduce((sum, b) => sum + b.amount, 0);

  try {
    // Deduct total bet before resolution (GINF-01)
    await deductBet(userId, totalBet, 'roulette');

    // Resolve outcome: crypto.randomInt(0, 37) gives a pocket index (GINF-02, ROUL-01)
    const winningPocketIndex = randomInt(0, 37);
    const WHEEL_SEQUENCE = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
    const winningPocket = WHEEL_SEQUENCE[winningPocketIndex];

    // Calculate net profit from all placed bets
    const profit = resolveRouletteBets(winningPocket, bets);

    // Settle and log (GINF-03, GINF-04)
    const { newBalance } = await settleBet(
      userId,
      profit,
      totalBet,
      String(winningPocket),
      'roulette',
    );

    res.json({ winningPocket, profit, newBalance });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'INSUFFICIENT_FUNDS') {
      res.status(402).json({ error: 'Insufficient funds' });
      return;
    }
    console.error('[games] roulette bet error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});
```

### Pattern 4: Roulette Resolution Service

**What:** Pure function that maps a winning pocket number to the net profit given a set of placed bets.

```typescript
// apps/backend/src/services/rouletteService.ts
// Payout table — European roulette (single zero)
const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

export function resolveRouletteBets(
  winningPocket: number,
  bets: Array<{ zone: string; amount: number }>,
): number {
  let profit = 0;
  for (const bet of bets) {
    const won = isBetWon(winningPocket, bet.zone);
    if (won) {
      const multiplier = getMultiplier(bet.zone);
      profit += bet.amount * multiplier; // e.g. straight-up: 35× + original already deducted
    }
    // Loss: bet.amount already deducted by deductBet; profit += 0
  }
  return profit;
}

function isBetWon(pocket: number, zone: string): boolean {
  if (pocket === 0) {
    // Only straight-up zero wins on zero
    return zone === 'number_0';
  }
  switch (zone) {
    case 'red':    return RED_NUMBERS.has(pocket);
    case 'black':  return !RED_NUMBERS.has(pocket);
    case 'odd':    return pocket % 2 !== 0;
    case 'even':   return pocket % 2 === 0;
    case 'dozen_1': return pocket >= 1 && pocket <= 12;
    case 'dozen_2': return pocket >= 13 && pocket <= 24;
    case 'dozen_3': return pocket >= 25 && pocket <= 36;
    case 'col_1':  return pocket % 3 === 1;
    case 'col_2':  return pocket % 3 === 2;
    case 'col_3':  return pocket % 3 === 0;
    default: {
      // 'number_N'
      const n = parseInt(zone.replace('number_', ''), 10);
      return pocket === n;
    }
  }
}

function getMultiplier(zone: string): number {
  if (zone.startsWith('number_')) return 35; // 35:1 straight up
  if (['dozen_1','dozen_2','dozen_3','col_1','col_2','col_3'].includes(zone)) return 2; // 2:1
  return 1; // Red/Black, Odd/Even — 1:1
}
```

**Note on profit semantics:** `deductBet` already removed the entire `totalBet`. So `profit` passed to `settleBet` is pure winnings added back — on a 1:1 win, `profit = betAmount` (the player gets their bet back plus equal winnings). On 35:1, `profit = betAmount * 35`. On a full loss, `profit = 0`. This matches the existing coin-flip pattern in `walletService.ts`.

### Pattern 5: Web Audio API Sound Effects

**What:** Two synthesized tones (win: short bright chime, loss: short low tone) generated via `OscillatorNode`. AudioContext must be created/resumed from a user click due to browser autoplay policy.

```typescript
// apps/frontend/src/hooks/useGameSounds.ts
export function useGameSounds(isMuted: boolean) {
  const playTone = (frequency: number, duration: number, type: OscillatorType = 'sine') => {
    if (isMuted) return;
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
    // ctx closes automatically when oscillator stops
  };

  return {
    playWin: () => playTone(880, 0.4, 'sine'),   // bright A5 chime
    playLoss: () => playTone(180, 0.5, 'triangle'), // low dull tone
  };
}
```

**Critical:** Call `playWin()` / `playLoss()` only inside the `onComplete` callback of the GSAP animation (which is itself triggered by user's "Spin" button click). This satisfies the browser user-gesture requirement — the AudioContext creation is downstream of a click.

### Pattern 6: Last-Bet Prefill (localStorage)

```typescript
// Save after successful spin
const LAST_BET_KEY = 'lastBet_roulette';
function saveLastBet(chips: PlacedChip[]) {
  localStorage.setItem(LAST_BET_KEY, JSON.stringify(chips));
}
// Rebet button click
function handleRebet() {
  const raw = localStorage.getItem(LAST_BET_KEY);
  if (!raw) return;
  try {
    const chips = JSON.parse(raw) as PlacedChip[];
    useRouletteStore.getState().rebet(chips);
  } catch {
    // Ignore corrupt data
  }
}
```

### Pattern 7: How-To-Play Modal (Framer Motion AnimatePresence)

```typescript
// Framer Motion 12 is already installed — use AnimatePresence for mount/unmount
import { AnimatePresence, motion } from 'framer-motion';

function HowToPlayModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="howto-modal"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          style={{ position: 'fixed', inset: 0, zIndex: 200, /* overlay styles */ }}
        >
          {/* Bet type table: all 6 bet types, payout, win condition */}
          <button onClick={onClose}>Close</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

### Anti-Patterns to Avoid

- **Using `Math.random()` for the winning pocket** — `crypto.randomInt(0, 37)` is mandatory (GINF-02, established in Phase 3). The constant is declared in `walletService.ts` and re-used in the new `gamesRouter`.
- **Deducting bet per individual chip rather than total** — deduct the aggregate total once; settle once. Multiple `deductBet` calls per spin create race conditions and log noise.
- **Creating AudioContext on page load** — browsers will suspend it immediately. Create per sound event OR resume from within the click handler chain.
- **Storing the full chip array in `gameLogs.outcome`** — `outcome` is `varchar(50)`. Store the winning pocket number only (e.g., `"17"`). Chip details are client-side state.
- **Accumulating rotation with `gsap.set()` reset to 0 each spin** — GSAP rotation is stateful. Track `currentRotationRef` and always add to the existing value, not reset to 0, to avoid the wheel jumping backward.
- **Max bet as a fixed constant** — "Max" chip denomination should equal the user's current balance. Read it from `useBalanceStore.getState().balance` at chip-click time, not at page load.
- **Storing access tokens or sensitive data in localStorage** — localStorage is appropriate for `mute` flag and `lastBet_roulette` chip layout only. This aligns with the project's security pattern (access tokens are in closure/React state, never localStorage).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Wheel rotation animation with deceleration | Custom `requestAnimationFrame` loop with manual easing | GSAP `gsap.to(ref, { rotation, ease: 'power3.out' })` | GSAP handles cross-browser transform normalization, cleanup, and the `onComplete` callback precisely; manual RAF loops are error-prone with React's re-render lifecycle |
| React animation cleanup | `useEffect` return for GSAP cleanup | `useGSAP` hook from `@gsap/react` | `useGSAP` auto-wraps in `gsap.context()` which reverts all animations on unmount; prevents StrictMode double-animation in React 19 |
| Win/loss result overlay transition | CSS transitions toggled with state | Framer Motion `AnimatePresence` (already installed) | AnimatePresence handles the exit animation (fade out) which CSS-only cannot do when a component unmounts |
| Bet zone click detection on round visual table | Canvas hit-testing | CSS Grid divs with `onClick` handlers | Standard DOM event handling is simpler, accessible, and sufficient for a static grid |
| Multi-bet validation | Custom validation function in route handler | Zod schema (already installed in backend) | Zod already used for `validateBet`; consistent pattern, type-safe parsed output |

**Key insight:** The wheel animation is the only genuinely hard part of this phase. Everything else (state management, validation, sound, modals) uses patterns already proven in the project.

---

## Common Pitfalls

### Pitfall 1: GSAP Rotation Accumulation Error
**What goes wrong:** The wheel visually snaps backward or over-rotates when starting a second spin.
**Why it happens:** Each `gsap.to()` call sets an absolute `rotation` value. If you reset it to 0 between spins, the wheel jumps. If you don't track `currentRotation`, the math produces a negative or too-small angle.
**How to avoid:** Use a `currentRotationRef.current` (not React state — avoid re-renders) that accumulates the actual final rotation after each spin. Always compute `targetRotation = currentRotationRef.current + minimumFullSpins + offsetToTarget`. Never call `gsap.set(el, { rotation: 0 })` between spins.
**Warning signs:** Wheel jumps at the start of second spin, or lands on wrong pocket consistently.

### Pitfall 2: AudioContext Autoplay Policy Rejection
**What goes wrong:** Sound never plays; browser console shows "AudioContext was not allowed to start".
**Why it happens:** AudioContext created outside a user gesture is auto-suspended by Chrome/Firefox. The spin button click chain must be the source.
**How to avoid:** Create a new `AudioContext()` inside the `playWin`/`playLoss` call itself, which is invoked in the GSAP `onComplete` callback, which is downstream of the user's Spin button click. Do not create a shared AudioContext at module or component initialization time.
**Warning signs:** Silent result regardless of mute state; `AudioContext.state === 'suspended'` in DevTools.

### Pitfall 3: Race Condition — User Spins While Result is Showing
**What goes wrong:** Player clicks Spin again before dismissing result overlay; two API calls in flight simultaneously; balance goes negative.
**Why it happens:** No game phase guard on the UI.
**How to avoid:** The Zustand `gamePhase` field gates interactions. During `'spinning'` and `'result'` phases, the Spin button and table zones are `pointer-events: none` (or `disabled`). Only `'betting'` phase allows new chip placement and spin.
**Warning signs:** Double-deduct errors in backend logs; balance drifts negative.

### Pitfall 4: `gameLogs.outcome` varchar(50) Overflow
**What goes wrong:** Saving the full bet description as `outcome` truncates silently in Postgres.
**Why it happens:** `outcome` is `varchar(50)` in the schema. If you try to serialize all placed bets into it, you'll overflow.
**How to avoid:** `outcome` = the winning pocket number as a string (e.g., `"17"`, `"0"`). Chip placement details are frontend-only state (localStorage + Zustand). Do not change the schema for Phase 4.
**Warning signs:** Truncated outcome strings in game_logs; Postgres constraint violations if column is strict.

### Pitfall 5: "Max" Chip Value Stale at Spin Time
**What goes wrong:** Player with 45 coins clicks Max chip (showed 100 at page load), backend rejects INSUFFICIENT_FUNDS.
**Why it happens:** Max denomination set to balance at page load instead of dynamically at chip placement time.
**How to avoid:** In `placeChip('zone')`, when `selectedChip === 'max'`, substitute `useBalanceStore.getState().balance` at that moment. Or derive Max from balance in a selector.
**Warning signs:** INSUFFICIENT_FUNDS errors even when balance is visible in header.

### Pitfall 6: Roulette Table Column Number Mapping
**What goes wrong:** Column bets pay out on wrong numbers.
**Why it happens:** The three columns on a physical roulette table correspond to a specific modulo pattern: Column 1 = numbers 1,4,7,10,13,16,19,22,25,28,31,34 (i.e., `n % 3 === 1`); Column 2 = 2,5,8,11,14,17,20,23,26,29,32,35 (`n % 3 === 2`); Column 3 = 3,6,9,12,15,18,21,24,27,30,33,36 (`n % 3 === 0`). Zero is NOT in any column.
**How to avoid:** Implement `isBetWon` with the modulo formula above. Note 0 returns false for all column bets.
**Warning signs:** Integration test: pocket 3 should win col_3, pocket 1 should win col_1, pocket 0 should win neither.

### Pitfall 7: Wheel Pocket Angle Off-By-One
**What goes wrong:** The winning pocket highlight lands one pocket off visually.
**Why it happens:** The 37-pocket sequence starts at the top (12 o'clock position, index 0 = pocket 0). If the marker is placed anywhere other than exactly 12 o'clock, the offset formula breaks.
**How to avoid:** Design the wheel SVG/CSS with pocket 0 at the 12 o'clock position (0°). The rotation formula then becomes `targetRotation = baseRotation + 5*360 + (360 - pocketIndex * POCKET_ANGLE)`. Test by spinning to pocket 0 — wheel should stop at exactly where it started.
**Warning signs:** Visual result consistently off by N pockets; spinning to 0 does not return to start position.

---

## Code Examples

### European Roulette Red/Black Reference

```typescript
// Source: Verified against Wikipedia Roulette article + casino.org
// Red numbers in European roulette (18 total)
const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
// Black numbers = all non-zero, non-red numbers (18 total: 2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35)
// Zero (0) = green — not red, not black, not odd, not even for bet purposes

// European wheel sequence (clockwise from 12 o'clock):
const WHEEL_SEQUENCE = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
```

### Registering gamesRouter in app.ts

```typescript
// apps/backend/src/app.ts — add ONE line (follows walletRouter pattern)
import { gamesRouter } from './routes/games.js';
// ...
app.use('/api/games', gamesRouter);
```

### DashboardPage Game Cards Integration

```typescript
// Add below <DailyBonusCard> in DashboardPage.tsx
// Four cards in a horizontal row — Roulette live, others "Coming Soon"
const GAMES = [
  { id: 'roulette', name: 'Roulette', icon: '🎡', description: 'European wheel, 37 pockets', route: '/games/roulette', available: true },
  { id: 'plinko',   name: 'Plinko',   icon: '⚫', description: 'Drop the ball, ride the pegs', route: '/games/plinko',   available: false },
  { id: 'mines',    name: 'Mines',    icon: '💣', description: 'Avoid the mines, cash out big', route: '/games/mines',   available: false },
  { id: 'blackjack',name: 'Blackjack',icon: '🃏', description: 'Beat the dealer to 21',       route: '/games/blackjack',available: false },
];
```

### App.tsx Route Addition

```typescript
// Add to App.tsx Routes
import { RoulettePage } from './pages/RoulettePage';
// ...
<Route
  path="/games/roulette"
  element={
    <ProtectedRoute>
      <RoulettePage />
    </ProtectedRoute>
  }
/>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GSAP Club (paid membership for premium plugins) | GSAP fully free including all plugins | April 30, 2025 (Webflow acquisition) | No license cost; all plugins including SplitText/MorphSVG available — for this project, only the free-tier core was needed anyway |
| Separate `requestAnimationFrame` loops for game animations | GSAP `useGSAP` hook with auto-cleanup | 2023 (useGSAP released) | React StrictMode double-animation bug eliminated |
| Framer Motion v10 `motion.div` transition prop | Framer Motion v12 (same API, backward compatible for AnimatePresence) | 2024 | No migration needed; existing `BalanceDisplay` spring pattern unchanged |
| `react-countup` for balance animation | Framer Motion `useSpring + useTransform` | Phase 3 (react-countup incompatible with React 19) | Already resolved; `BalanceDisplay.tsx` handles it |

---

## European Roulette Bet Reference

| Bet Type | Covers | Payout | Winning Condition (server) |
|----------|--------|--------|---------------------------|
| Red | 18 numbers | 1:1 | `RED_NUMBERS.has(pocket)` |
| Black | 18 numbers | 1:1 | `!RED_NUMBERS.has(pocket) && pocket !== 0` |
| Odd | 18 numbers | 1:1 | `pocket % 2 !== 0` (0 loses) |
| Even | 18 numbers | 1:1 | `pocket % 2 === 0 && pocket !== 0` |
| Dozen 1–12 | 12 numbers | 2:1 | `pocket >= 1 && pocket <= 12` |
| Dozen 13–24 | 12 numbers | 2:1 | `pocket >= 13 && pocket <= 24` |
| Dozen 25–36 | 12 numbers | 2:1 | `pocket >= 25 && pocket <= 36` |
| Column 1 | 12 numbers | 2:1 | `pocket % 3 === 1` |
| Column 2 | 12 numbers | 2:1 | `pocket % 3 === 2` |
| Column 3 | 12 numbers | 2:1 | `pocket % 3 === 0 && pocket !== 0` |
| Straight Up | 1 number | 35:1 | `pocket === N` |

**House edge:** 2.70% on all bets (single zero European rule). No La Partage rule in scope.

---

## Open Questions

1. **Wheel Rendering Approach (SVG vs CSS conic-gradient vs Canvas)**
   - What we know: Three approaches work. SVG gives precise per-pocket hit zones and text placement. CSS `conic-gradient` is elegant but pocket labels require absolute positioning calculations. Canvas is lowest-level but most performant.
   - What's unclear: At 37 pockets, all approaches are functionally equivalent at this scale (no performance issue). The decision affects label legibility while spinning.
   - Recommendation: Use CSS `conic-gradient` for the background color sectors (simple, no SVG complexity) + absolutely positioned number labels that rotate with the wheel. GSAP animates the container div's CSS `transform: rotate()`. This avoids SVG path math while keeping the implementation in the DOM (accessible, debuggable).

2. **Roulette Table Layout — Grid vs Absolute Positioning**
   - What we know: The classic table has a 12×3 number grid plus outside bet zones that don't align perfectly with the grid.
   - What's unclear: CSS Grid can handle the number grid (3 columns, 12 rows, pocket 0 spanning full width at top), but the outside bets (Red/Black/Odd/Even on one axis, Dozens on another) need a nested grid or flexbox for the side sections.
   - Recommendation: Use CSS Grid for the main number grid; use a separate horizontal flex strip below for outside bets. Do not use a single mega-grid — it gets complex and doesn't match any standard CSS layout primitively.

3. **Spin Button State During Animation**
   - What we know: `gamePhase: 'spinning'` gates the UI.
   - What's unclear: Should the table layout remain visible (greyed out) during the spin, or hidden?
   - Recommendation: Keep visible but `pointer-events: none` during spinning — the player can see where their chips are placed while the wheel spins, which is more immersive and matches real casino UX.

---

## Sources

### Primary (HIGH confidence)
- GSAP official React docs (`https://gsap.com/resources/React/`) — `useGSAP` hook, `@gsap/react` package, registration pattern
- npm registry — gsap@3.14.2, @gsap/react@2.1.2, framer-motion@12.34.4 (verified via `npm info`)
- MDN Web Audio API (`https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API`) — OscillatorNode, GainNode, autoplay policy
- GSAP Standard License (`https://gsap.com/community/standard-license/`) — fully free as of April 30, 2025
- Project codebase (read directly) — walletService.ts, schema.ts, walletRouter, validateBet.ts, balanceStore.ts

### Secondary (MEDIUM confidence)
- Wikipedia Roulette + casino.org + Wizard of Odds — European wheel sequence, red/black sets, payout ratios (multiple sources agree)
- Chrome Autoplay Policy docs (`https://developer.chrome.com/blog/autoplay`) — AudioContext user gesture requirement
- MDN AudioContext (`https://developer.mozilla.org/en-US/docs/Web/API/AudioContext`) — state management (suspended/running), resume()

### Tertiary (LOW confidence)
- WebSearch results for CSS Grid roulette table layout — general layout description, no specific React implementation found; architecture recommendation is based on reasoning from known CSS Grid capabilities

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — GSAP version verified via npm, @gsap/react version verified via npm, project dependencies read directly
- Architecture: HIGH — based on direct reading of existing project code (walletService.ts, walletRouter, schema.ts); gamesRouter pattern is identical to walletRouter
- Roulette rules: HIGH — wheel sequence and red/black sets verified against multiple authoritative sources (Wikipedia, casino.org, Wizard of Odds)
- Pitfalls: MEDIUM-HIGH — GSAP rotation accumulation and AudioContext autoplay policy verified with official docs; UI race conditions and varchar overflow are reasoning-based from schema read
- Sound effects: HIGH — Web Audio API OscillatorNode pattern verified with MDN

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (GSAP stable; no fast-moving dependencies in this phase)
