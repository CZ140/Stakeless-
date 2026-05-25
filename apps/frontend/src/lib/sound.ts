// Procedural Web Audio sound engine — a single AudioContext shared by every game.
//
// Why synthesis instead of Howler + samples: it ships zero binary assets, works
// offline, needs no licensing, and gives us per-frame control we want anyway (e.g.
// pitching the Crash tone with the live multiplier). The public surface is
// sample-ready — if we later want recorded realism we can back these methods with
// Howler + audio sprites without touching call sites.
//
// All cues no-op until the context is unlocked by a user gesture (browser autoplay
// policy) and while muted. Mute/volume are applied on a single master gain node.

type Maybe<T> = T | null;

/** A handle for a sustained/looping sound so the caller can stop or modulate it. */
export interface SoundHandle {
  stop: (fadeMs?: number) => void;
  /** Re-pitch a running tone (1 = original). Used by the Crash tension loop. */
  setRate?: (rate: number) => void;
}

const NOOP_HANDLE: SoundHandle = { stop: () => {}, setRate: () => {} };

class SoundManager {
  private ctx: Maybe<AudioContext> = null;
  private master: Maybe<GainNode> = null;
  private noiseBuffer: Maybe<AudioBuffer> = null;
  private _muted = false;
  private _volume = 0.6;
  private unlocked = false;

  /** Create (once) and resume the context. Safe to call repeatedly. */
  private ensure(): Maybe<{ ctx: AudioContext; master: GainNode }> {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : this._volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx && this.master ? { ctx: this.ctx, master: this.master } : null;
  }

  /** Call from a real user gesture (first bet/click) to satisfy autoplay policy. */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    this.ensure();
  }

  setMuted(muted: boolean): void {
    this._muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : this._volume, this.ctx.currentTime, 0.02);
    }
  }

  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(1, volume));
    if (this.master && this.ctx && !this._muted) {
      this.master.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.02);
    }
  }

  get muted(): boolean {
    return this._muted;
  }

  // ── low-level primitives ──────────────────────────────────────────────────

  private getNoise(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer) {
      const len = Math.floor(ctx.sampleRate * 1.0);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    return this.noiseBuffer;
  }

  /** One enveloped oscillator. `slideTo` glides the frequency over the duration. */
  private tone(opts: {
    freq: number;
    type?: OscillatorType;
    dur: number;
    gain?: number;
    attack?: number;
    slideTo?: number;
    delay?: number;
  }): void {
    const got = this.ensure();
    if (!got || this._muted) return;
    const { ctx, master } = got;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.slideTo), t0 + opts.dur);
    const peak = opts.gain ?? 0.25;
    const attack = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.02);
  }

  /** A filtered noise burst — clicks, rattles, impacts, cascades. */
  private noise(opts: {
    dur: number;
    gain?: number;
    type?: BiquadFilterType;
    freq?: number;
    q?: number;
    delay?: number;
  }): void {
    const got = this.ensure();
    if (!got || this._muted) return;
    const { ctx, master } = got;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.getNoise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = opts.type ?? 'bandpass';
    filter.frequency.value = opts.freq ?? 1200;
    filter.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.2;
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + opts.dur + 0.02);
  }

  // ── UI cues ─────────────────────────────────────────────────────────────────

  uiClick(): void {
    this.noise({ dur: 0.05, gain: 0.12, type: 'highpass', freq: 2200 });
  }
  bet(): void {
    this.tone({ freq: 520, type: 'triangle', dur: 0.12, gain: 0.18 });
    this.tone({ freq: 780, type: 'triangle', dur: 0.1, gain: 0.12, delay: 0.04 });
  }
  error(): void {
    this.tone({ freq: 160, type: 'sawtooth', dur: 0.22, gain: 0.16, slideTo: 110 });
  }
  tick(): void {
    this.noise({ dur: 0.03, gain: 0.1, type: 'bandpass', freq: 3000, q: 2 });
  }

  // ── Slots ─────────────────────────────────────────────────────────────────

  /** Looping reel whir while reels travel. */
  reelSpin(): SoundHandle {
    const got = this.ensure();
    if (!got || this._muted) return NOOP_HANDLE;
    const { ctx, master } = got;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoise(ctx);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.08);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
    return {
      stop: (fadeMs = 80) => {
        const now = ctx.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + fadeMs / 1000);
        src.stop(now + fadeMs / 1000 + 0.02);
      },
    };
  }

  /** A reel coming to rest — a short pitched thunk. `pitch` shifts per reel. */
  reelStop(pitch = 1): void {
    this.noise({ dur: 0.08, gain: 0.22, type: 'lowpass', freq: 1400 * pitch, q: 1 });
    this.tone({ freq: 220 * pitch, type: 'sine', dur: 0.1, gain: 0.14 });
  }

  // ── Win / loss stingers (scaled by tier) ────────────────────────────────────

  private arp(freqs: number[], step: number, type: OscillatorType = 'triangle', gain = 0.2): void {
    freqs.forEach((f, i) => this.tone({ freq: f, type, dur: 0.18, gain, delay: i * step }));
  }
  winSmall(): void {
    this.arp([660, 880], 0.07);
  }
  winMed(): void {
    this.arp([523, 659, 784], 0.07);
  }
  winBig(): void {
    this.arp([523, 659, 784, 1047, 1319], 0.08, 'triangle', 0.22);
    this.coinCascade(10);
  }
  lose(): void {
    this.tone({ freq: 300, type: 'triangle', dur: 0.32, gain: 0.16, slideTo: 150 });
  }
  /** A rolling shower of bright ticks (payout cascade). */
  coinCascade(count = 8): void {
    for (let i = 0; i < count; i++) {
      this.noise({ dur: 0.04, gain: 0.1, type: 'bandpass', freq: 2600 + Math.random() * 1400, q: 3, delay: i * 0.05 });
    }
  }

  // ── Roulette ────────────────────────────────────────────────────────────────

  whir(): SoundHandle {
    return this.reelSpin();
  }
  ballDrop(): void {
    this.noise({ dur: 0.14, gain: 0.3, type: 'lowpass', freq: 900, q: 1 });
    this.tone({ freq: 180, type: 'sine', dur: 0.16, gain: 0.16 });
  }

  // ── Dice ────────────────────────────────────────────────────────────────────

  diceRoll(): void {
    this.noise({ dur: 0.22, gain: 0.16, type: 'bandpass', freq: 1600, q: 0.7 });
  }

  // ── Crash ─────────────────────────────────────────────────────────────────

  /** Rising-tension loop; call setRate(rate) each frame, rate grows with multiplier. */
  crashTone(): SoundHandle {
    const got = this.ensure();
    if (!got || this._muted) return NOOP_HANDLE;
    const { ctx, master } = got;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 110;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.2);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    osc.connect(filter);
    filter.connect(g);
    g.connect(master);
    osc.start();
    return {
      stop: (fadeMs = 60) => {
        const now = ctx.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + fadeMs / 1000);
        osc.stop(now + fadeMs / 1000 + 0.02);
      },
      setRate: (rate: number) => {
        if (!this.ctx) return;
        osc.frequency.setTargetAtTime(110 * rate, this.ctx.currentTime, 0.05);
      },
    };
  }
  cashout(mult = 1): void {
    const base = 660 * Math.min(2.2, 1 + Math.log10(Math.max(1, mult)));
    this.arp([base, base * 1.26, base * 1.5], 0.06, 'triangle', 0.22);
  }
  bust(): void {
    this.noise({ dur: 0.5, gain: 0.4, type: 'lowpass', freq: 600, q: 0.5 });
    this.tone({ freq: 200, type: 'sawtooth', dur: 0.4, gain: 0.18, slideTo: 60 });
  }

  // ── Blackjack ────────────────────────────────────────────────────────────────

  cardDeal(): void {
    this.noise({ dur: 0.06, gain: 0.16, type: 'highpass', freq: 2600 });
  }
  cardFlip(): void {
    this.noise({ dur: 0.09, gain: 0.18, type: 'bandpass', freq: 1800, q: 1.2 });
  }
  chip(): void {
    this.tone({ freq: 1200, type: 'sine', dur: 0.06, gain: 0.14 });
    this.noise({ dur: 0.05, gain: 0.1, type: 'highpass', freq: 4000 });
  }
}

export const sound = new SoundManager();
