# Stakeless — Game Animation Overhaul Plan

> Goal: make the games feel **fluid, weighty, interactive, and satisfying** instead of stiff.
> Approach decided with the user: **GSAP-only** (no PixiJS / no 3D), **full motion + sound + confetti**,
> **Slots first**, **2D Stake-style Dice**. Executed **one game at a time**.

---

## 1. Diagnosis (why it feels stiff)

The stiffness is an **animation-quality** problem, not a rendering one. Per game, the current baseline:

| Game | Current technique | Why it feels stiff |
|------|-------------------|--------------------|
| **Dice** | Pure CSS; marker `left` set inline, no transition | Result *teleports*. Zero motion, zero feedback. |
| **Slots** | `setInterval` symbol-scramble (70ms) + CSS blur; reels "lock" by swapping React state | Symbols flicker in place — no real reel travel, no momentum, no snap, no stagger payoff. |
| **Crash** | SVG `<path>` redrawn each rAF frame; socket `crash:bust`/`crash:cashout` hard-cut the state | Curve is OK but the camera never follows, and bust/cashout are instant cuts with no payoff. |
| **Roulette** | GSAP already (`power3.out` on wheel + ball arm); conic-gradient wheel | The ball is **fake** — it's an eased rotation + a linear `y` slide, not an orbit that decelerates and drops into a pocket. |
| **Blackjack** | Framer Motion deal/flip (0.32s `easeOut`) | The most polished already; needs arc-dealing, sequenced reveal, and chip/win juice. |

Shared gaps everywhere: **default/linear eases** (no anticipation→overshoot→settle), **no count-ups**, **no celebration scaling**, **near-silent audio** (two Web-Audio tones), **no screen shake / confetti / haptics**.

## 2. Tooling decisions (locked)

- **GSAP** for *all* orchestration (already installed `gsap@3.14`, `@gsap/react@2.1`). All plugins are now 100 % free (MotionPath, CustomEase, CustomBounce, Flip, Physics2D). Use the `useGSAP()` hook for React-19/StrictMode-safe cleanup.
- **canvas-confetti** for win celebrations (tiny, imperative, no asset files). **New dependency.**
- **Audio:** a **procedural Web Audio synthesis engine** (expand the existing `useGameSounds`). 
  - ⚠️ **Deviation from the "Howler + CC0 samples" option:** Howler is useless without binary sample files, which would mean sourcing/hosting CC0 packs (Kenney/Pixabay). To deliver audible improvement *immediately* — offline, zero-licensing, tiny, and with per-frame control we need anyway (e.g. pitch the Crash tone with the live multiplier) — the implementation synthesizes SFX in code. The `SoundManager` interface is sample-ready: if we later want recorded realism we drop in Howler + assets behind the same API. Flagged for the user to course-correct.
- **No** PixiJS, Phaser, or Three.js. (Can revisit Pixi for Slots/Crash later if synth-DOM hits a ceiling.)
- **Accessibility:** honor `prefers-reduced-motion` (reduce, don't remove), keyboard-accessible **global mute**, persisted in `localStorage`.

## 3. Shared foundation (built during Slots, reused by every game)

Created once, before/with the first game:

1. **`apps/frontend/src/lib/sound.ts`** — `SoundManager` singleton over a single `AudioContext` (lazy, unlocked on first gesture), master-gain mute/volume persisted to `localStorage`. Procedural cues: `uiClick`, `bet`, `reelSpin`(loop)/`reelStop`, `tick`, `winSmall|winMed|winBig`, `lose`, `coinCascade`, `whir`(loop), `ballDrop`, `cardDeal`, `cardFlip`, `chip`, `crashTone`(loop, pitch-mapped), `cashout`, `bust`, `error`. Sample-ready API.
2. **`apps/frontend/src/stores/audioStore.ts`** — global `{ muted, volume, toggleMute, setVolume }` (Zustand, double-parens). Replaces per-game `isMuted` as games migrate; the header/game mute buttons drive it.
3. **`apps/frontend/src/lib/juice.ts`** — GSAP + confetti helpers, all `prefers-reduced-motion` aware:
   - `countUp(el, from, to, opts)` — animate a number with `power2.out`, integer/currency snap.
   - `screenShake(el, intensity, dur)` — eased, win-scaled.
   - `flash(el, color)` — quick overlay flash.
   - `celebrate(tier, originEl?)` — `none|small|med|big|jackpot`; fires confetti + shake + sound scaled to win size.
   - `winTier(profit, bet)` — maps payout multiple → tier (single source of truth for "how big a deal is this win").
   - `pressFx(el)` / `releaseFx(el)` — button micro-interaction (`power2.in` down, `back.out(2.5)` release).
4. **`useReducedMotion()`** hook (matchMedia) so components can branch.

**Deterministic-outcome rule (all games):** the server decides the result. Every animation *projects* that result — animate **toward a known endpoint**; the only randomness is cosmetic (spin count, jitter, blur). Never let the animation pick the outcome.

---

## 4. Per-game plans (in execution order)

### ▶ Game 1 — SLOTS  *(first)*

**Files:** `apps/frontend/src/pages/SlotsPage.tsx`, new `components/vault/SlotReel.tsx`, `styles/vault.css` (`.slots-*`), `stores/slotsStore.ts` (migrate to global audio store). Shared math in `packages/shared/src/slots.ts` is **unchanged** (server still decides the grid).

**Target experience:** real reels that spin with momentum, stop **left→right** with a satisfying overshoot-and-snap, motion-blur while travelling, a **near-miss slow-down** on the third reel, a win-line sweep + cell pulse, win-amount **count-up**, and **confetti/shake scaled to win size**.

**Technique:**
- Replace the scramble with a `SlotReel` component: an `overflow:hidden` window over a tall vertical **strip** of cells (many random symbols ending in the 3 server-decided finals). Driven **imperatively** via `useGSAP` + refs (never per-frame React state).
- Spin timeline per reel: `set(y,0)` → accelerate (`power1.in`) → decelerate past target (`power3.out`, slight overshoot **down**) → snap back (`back.out(2.2)`) to land finals in the window.
- **Stagger** stops ~0.22s apart L→R; play `reelStop` click on each (slight pitch variation per reel).
- **Blur** class on the strip while velocity is high; removed on snap.
- **Near-miss:** if reels 0 & 1 already match a line symbol, `timeScale` the third reel's stop to ~0.5 and add a small wiggle before it lands.
- On settle: `celebrate(winTier(profit,bet))`, draw/pulse the winning lines, `countUp` the banner payout, coin-cascade sound for medium+ wins.

**Acceptance:** reels visibly travel & snap; stops cascade L→R; win lines highlight; payout counts up; big wins get confetti+shake; muted toggle silences everything; reduced-motion shortens travel & skips confetti; `pnpm --filter frontend build` + `typecheck` green; verified in browser.

---

### ▶ Game 2 — ROULETTE  *(the "fake ball" fix)*

**Files:** `components/RouletteWheel.tsx`, `pages/RoulettePage.tsx`, `components/ResultOverlay.tsx`, `styles/vault.css`.

**Target experience:** a ball that **orbits the rim fast, decelerates, wobbles, and drops along a curved path into the winning pocket**, with the wheel counter-spinning and a strong momentum decel — landing **deterministically** on the server's number.

**Technique:**
- Keep the wheel as-is but spin with `power4.out`/`expo.out` for real momentum; small sub-pocket jitter so it doesn't stop dead-center.
- Rebuild the ball: register `MotionPathPlugin`. Phase 1 fast orbit (`power1.in`, counter to wheel) → Phase 2 rim decel (`power3.out`) → Phase 3 **MotionPath curved drop** (rim → mid → pocket-XY computed from `winIndex`, `alignOrigin:[0.5,0.5]`, small `bounce.out` settle). Then parent the ball into the wheel group so it sticks as the wheel keeps turning.
- Audio: `whir` loop (fades as it slows) + ball-rattle ticks fired from `onUpdate` when it crosses a pocket boundary + `ballDrop` thunk on settle + win chime.
- Endpoint = `winIndex` from server result; orbit count is the only randomness.

**Acceptance:** ball clearly orbits, slows, and drops into the *correct* pocket every time; wheel + ball feel physical; audio synced; reduced-motion = shorter spin, no rattle spam; build/typecheck green; browser-verified across several numbers incl. 0.

---

### ▶ Game 3 — DICE  *(2D Stake-style)*

**Files:** `pages/DicePage.tsx`, `styles/vault.css` (`.dice-*`), `stores/diceStore.ts` (global audio). Shared dice math unchanged.

**Target experience:** the slider result marker **shoots to the rolled value with a `back.out(2)` overshoot and settles**, the number **counts up** to the roll, the win-zone **glows**, and a win/loss **color flash** + sound fires. Tiered confetti on big multipliers.

**Technique:** animate marker `left` to `roll%` with overshoot; `countUp` the roll readout; flash the track green/red; `celebrate(winTier)` for wins; `tick` sound on land, win/lose stinger. Reduced-motion = instant marker, no flash spam.

**Acceptance:** marker glides+overshoots to the exact server roll; number counts; win/loss feedback obvious; big wins celebrate; build/typecheck green; browser-verified (under & over, win & loss).

---

### ▶ Game 4 — CRASH  *(live socket game)*

**Files:** `pages/CrashPage.tsx`, `styles/vault.css` (`.crash-*`). Socket contract unchanged; server stays source of truth.

**Target experience:** the rising curve with a **glowing head + trail**, a **camera/viewport that follows** the curve (lagging slightly = sense of speed), a **rising tension tone** pitched to the multiplier, a **cash-out elastic pop + green flash + winnings count-up**, and a **bust = screen shake + red flash + particle burst**.

**Technique:**
- Keep server-clock-synced rAF for the curve math; drive it off `gsap.ticker` for one shared clock. Add a glow filter + fading trail to the head.
- Camera: tween `{scaleY, offsetY}` proxy toward the head with `power2.out`, `overwrite:true`, read in the draw loop.
- `crashTone` loop: map multiplier→playbackRate/frequency each frame.
- `crash:cashout` → kill loop, `cashout` sound, `elastic.out(1,0.4)` badge pop, green `flash`, `countUp` winnings, `celebrate(winTier)`. `crash:bust` → kill loop, `bust` sound, `screenShake` + red `flash` + particle burst at head.
- **Do not** route the per-frame multiplier through React state.

**Acceptance:** curve glows & camera follows; tone pitches with multiplier; cash-out vs bust are clearly distinct & satisfying; resume-on-reconnect still works; reduced-motion tones down shake/flash; build/typecheck green; browser-verified live.

---

### ▶ Game 5 — BLACKJACK  *(polish the most-finished one)*

**Files:** `pages/BlackjackPage.tsx`, `styles/vault.css` (`.playing-card`, `.felt`, etc.).

**Target experience:** cards **deal in an arc from a shoe** to each seat with stagger, the hole card **flips in 3D** on reveal, **chips arc to the pot** with an impact squash, totals **count up**, and win/blackjack gets a celebration.

**Technique:** GSAP `MotionPath` deal arcs (or keep Framer Motion but add stagger + arc + `back.out` settle); true `rotateY` flip with `preserve-3d` + `backface-visibility`; chip arc + squash; `countUp` hand totals; `celebrate` on win/blackjack; deal/flip/chip sounds. (GSAP `Flip` optional if layout shifts get tricky.)

**Acceptance:** deal is sequenced & arced; hole-card flip is 3D; chips animate; win celebrates; build/typecheck green; browser-verified (win, loss, push, blackjack, split if present).

---

## 5. New dependencies

| Package | Why | Size |
|---------|-----|------|
| `canvas-confetti` (+ `@types/canvas-confetti`) | win celebrations | ~6 KB |

GSAP plugins (MotionPath, CustomEase, CustomBounce) ship inside the installed `gsap` package — no new install. Audio is procedural — no `howler`, no asset files (revisit if sampled realism is wanted).

## 6. Cross-cutting requirements (every game)

- `useGSAP()` for all tweens (scoped refs, auto-cleanup); transforms/opacity only; no per-frame `setState`.
- Every meaningful event = **anticipation → overshoot → settle**; celebrations scale with `winTier`.
- Global mute works and persists; `prefers-reduced-motion` reduces motion + skips confetti/shake.
- After each game: `pnpm --filter frontend typecheck` **and** `pnpm --filter frontend build` green, then **manual browser verification** before moving on.
- Commit per game on a feature branch; backend/shared game math stays untouched (outcomes unchanged).

## 7. Status

- [x] **Foundation** — sound engine (`lib/sound.ts`), audio store, juice toolkit (`lib/juice.ts`), reduced-motion hook
- [x] **Game 1: Slots** — `SlotReel` windowed strips, staggered GSAP stops, near-miss suspense, count-up, tiered confetti. Verified in browser.
- [x] **Game 2: Roulette** — real ball: fast orbit → independent decel (keeps moving after wheel slows) → bounce drop into pocket, rattle ticks + whir + drop audio, tiered celebrate. Motion verified via transform trace.
- [ ] **Game 3: Dice**
- [ ] **Game 4: Crash**
- [ ] **Game 5: Blackjack**
