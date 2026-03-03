export function useGameSounds(isMuted: boolean) {
  const playTone = (frequency: number, duration: number, type: OscillatorType = 'sine') => {
    if (isMuted) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
    // AudioContext auto-closes when oscillator stops
  };

  return {
    playWin: () => playTone(880, 0.4, 'sine'),
    playLoss: () => playTone(180, 0.5, 'triangle'),
  };
}
