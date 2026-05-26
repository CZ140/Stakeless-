import { describe, it, expect, beforeEach } from 'vitest';
import { markOnline, markOffline, isOnline, _resetPresence } from './presence.js';

describe('presence registry', () => {
  beforeEach(_resetPresence);

  it('reports the offline→online transition only on the first socket', () => {
    expect(isOnline(1)).toBe(false);
    expect(markOnline(1)).toBe(true); // first socket → transition
    expect(isOnline(1)).toBe(true);
    expect(markOnline(1)).toBe(false); // second tab → no transition
    expect(isOnline(1)).toBe(true);
  });

  it('reports the online→offline transition only when the last socket closes', () => {
    markOnline(7);
    markOnline(7); // two tabs open
    expect(markOffline(7)).toBe(false); // one tab left → still online
    expect(isOnline(7)).toBe(true);
    expect(markOffline(7)).toBe(true); // last tab closed → transition
    expect(isOnline(7)).toBe(false);
  });

  it('never goes negative and stays offline when an unknown user disconnects', () => {
    expect(markOffline(99)).toBe(false); // was never online
    expect(isOnline(99)).toBe(false);
    expect(markOffline(99)).toBe(false);
    expect(isOnline(99)).toBe(false);
  });

  it('tracks several users independently', () => {
    markOnline(1);
    markOnline(2);
    expect(isOnline(1)).toBe(true);
    expect(isOnline(2)).toBe(true);
    expect(isOnline(3)).toBe(false);
    markOffline(1);
    expect(isOnline(1)).toBe(false);
    expect(isOnline(2)).toBe(true);
  });
});
