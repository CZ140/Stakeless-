import { describe, it, expect, beforeEach } from 'vitest';
import { sanitizeChat, allowChat, addChatMessage, chatHistory, clearChat } from './chat.js';

const sender = (text: string) => ({ userId: 1, username: 'alice', avatarColor: null, text });

describe('poker chat service', () => {
  beforeEach(() => clearChat());

  describe('sanitizeChat', () => {
    it('trims, collapses whitespace, and rejects empties / non-strings', () => {
      expect(sanitizeChat('  hi   there\n\n ')).toBe('hi there');
      expect(sanitizeChat('   ')).toBeNull();
      expect(sanitizeChat('')).toBeNull();
      expect(sanitizeChat(42 as unknown)).toBeNull();
      expect(sanitizeChat(undefined as unknown)).toBeNull();
    });

    it('clamps to the max length', () => {
      const long = 'a'.repeat(500);
      expect(sanitizeChat(long)).toHaveLength(300);
    });
  });

  describe('allowChat', () => {
    it('permits a burst up to the cap then blocks until the window slides', () => {
      const t0 = 1_000_000;
      for (let i = 0; i < 5; i++) expect(allowChat(1, t0 + i)).toBe(true); // 5 allowed
      expect(allowChat(1, t0 + 6)).toBe(false); // 6th within 5s blocked
      expect(allowChat(1, t0 + 6000)).toBe(true); // window passed → allowed again
    });

    it('rate-limits each user independently', () => {
      const t0 = 2_000_000;
      for (let i = 0; i < 5; i++) allowChat(1, t0);
      expect(allowChat(1, t0)).toBe(false);
      expect(allowChat(2, t0)).toBe(true); // a different user is unaffected
    });
  });

  describe('addChatMessage / history', () => {
    it('stores messages per table with server id + timestamp', () => {
      const m = addChatMessage(7, sender('gg'), 123);
      expect(m).toMatchObject({ userId: 1, username: 'alice', text: 'gg', ts: 123 });
      expect(m.id).toBeGreaterThan(0);
      expect(chatHistory(7)).toEqual([m]);
      expect(chatHistory(99)).toEqual([]); // unrelated table is empty
    });

    it('assigns increasing ids and keeps tables separate', () => {
      const a = addChatMessage(1, sender('one'));
      const b = addChatMessage(2, sender('two'));
      expect(b.id).toBeGreaterThan(a.id);
      expect(chatHistory(1)).toHaveLength(1);
      expect(chatHistory(2)).toHaveLength(1);
    });

    it('caps history to the most recent 50 lines (ring buffer)', () => {
      for (let i = 0; i < 60; i++) addChatMessage(1, sender(`m${i}`));
      const hist = chatHistory(1);
      expect(hist).toHaveLength(50);
      expect(hist[0]!.text).toBe('m10'); // oldest 10 dropped
      expect(hist[49]!.text).toBe('m59');
    });
  });
});
