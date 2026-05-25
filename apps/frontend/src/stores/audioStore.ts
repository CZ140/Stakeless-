import { create } from 'zustand';
import { sound } from '../lib/sound';

// Global audio preferences shared by every game. Replaces the per-game `isMuted`
// flags as each game migrates. Mute/volume are persisted and pushed to the sound
// engine's master gain on every change.

const MUTED_KEY = 'stakeless.audio.muted';
const VOLUME_KEY = 'stakeless.audio.volume';

const initialMuted = localStorage.getItem(MUTED_KEY) === 'true';
const storedVolume = Number(localStorage.getItem(VOLUME_KEY));
const initialVolume = Number.isFinite(storedVolume) && storedVolume > 0 ? Math.min(1, storedVolume) : 0.6;

// Apply persisted prefs to the engine up front (before any context exists).
sound.setMuted(initialMuted);
sound.setVolume(initialVolume);

interface AudioState {
  muted: boolean;
  volume: number;
  toggleMute: () => void;
  setVolume: (v: number) => void;
}

export const useAudioStore = create<AudioState>()((set) => ({
  muted: initialMuted,
  volume: initialVolume,
  toggleMute: () =>
    set((s) => {
      const muted = !s.muted;
      sound.setMuted(muted);
      localStorage.setItem(MUTED_KEY, String(muted));
      return { muted };
    }),
  setVolume: (v) => {
    const volume = Math.max(0, Math.min(1, v));
    sound.setVolume(volume);
    localStorage.setItem(VOLUME_KEY, String(volume));
    set({ volume });
  },
}));
