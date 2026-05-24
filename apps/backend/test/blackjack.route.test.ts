import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { gameLogs } from '../src/db/schema.js';
import { resetDb, createUser, getBalance } from './helpers.js';

const app = createApp();

interface BJHandView {
  bet: number;
  isDoubled: boolean;
  profit: number | null;
  outcome: string | null;
}
interface BJView {
  sessionId: number;
  phase: 'player_turn' | 'dealer_turn' | 'settled';
  hands: BJHandView[];
  newBalance?: number;
}

function bearer(method: 'post', path: string, token: string) {
  return request(app)[method](path).set('Authorization', `Bearer ${token}`);
}

// Stand on every hand until the round settles. (Deals are randomly shuffled, so
// these tests assert money invariants rather than a fixed outcome — the
// settlement maths itself is covered by blackjackService unit tests.)
async function standUntilSettled(token: string, sessionId: number, start: BJView): Promise<BJView> {
  let body = start;
  let guard = 0;
  while (body.phase === 'player_turn' && guard++ < 64) {
    const res = await bearer('post', '/api/games/blackjack/action', token).send({
      sessionId,
      action: 'stand',
    });
    expect(res.status).toBe(200);
    body = res.body as BJView;
  }
  return body;
}

describe('POST /api/games/blackjack — money path', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/api/games/blackjack/deal').send({ bets: [10] });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid bet shape with 400', async () => {
    const { token } = await createUser();
    const res = await bearer('post', '/api/games/blackjack/deal', token).send({ bets: [] });
    expect(res.status).toBe(400);
  });

  it('deducts the full stake immediately on deal', async () => {
    const { user, token } = await createUser({ balance: 1000 });
    const res = await bearer('post', '/api/games/blackjack/deal', token).send({ bets: [100, 50] });
    expect(res.status).toBe(200);
    const body = res.body as BJView;
    const bal = await getBalance(user.id);

    if (body.phase === 'settled') {
      // All hands were naturals and settled instantly — balance already reflects payouts.
      expect(bal).toBe(body.newBalance);
    } else {
      // Stake of 150 removed up front, before any outcome is known.
      expect(bal).toBe(850);
    }
  });

  it('settles to a balance consistent with the reported hand profits', async () => {
    const { user, token } = await createUser({ balance: 1000 });
    const deal = await bearer('post', '/api/games/blackjack/deal', token).send({ bets: [100] });
    expect(deal.status).toBe(200);
    const dealt = deal.body as BJView;

    const final =
      dealt.phase === 'settled' ? dealt : await standUntilSettled(token, dealt.sessionId, dealt);
    expect(final.phase).toBe('settled');

    // settleBet credits each hand's gross profit; deductBet removed the stake up front.
    const grossCredited = final.hands.reduce((s, h) => s + (h.profit ?? 0), 0);
    const expected = 1000 - 100 + grossCredited;

    const bal = await getBalance(user.id);
    expect(bal).toBe(expected);
    expect(final.newBalance).toBe(bal); // API response matches persisted balance

    // Net change must be one of the legal single-hand results.
    const delta = bal - 1000;
    expect([Math.floor(100 * 1.5), 100, 0, -100]).toContain(delta);

    // Exactly one settled game_logs row, chained to the final balance.
    const logs = await db.select().from(gameLogs).where(eq(gameLogs.userId, user.id));
    expect(logs).toHaveLength(1);
    expect(logs[0]!.gameType).toBe('blackjack');
    expect(logs[0]!.balanceAfter).toBe(bal);
    expect(logs[0]!.profit).toBe(grossCredited);
  });

  it('writes one settled log per hand for a multi-hand deal', async () => {
    const { user, token } = await createUser({ balance: 1000 });
    const deal = await bearer('post', '/api/games/blackjack/deal', token).send({ bets: [50, 50] });
    expect(deal.status).toBe(200);
    const dealt = deal.body as BJView;

    const final =
      dealt.phase === 'settled' ? dealt : await standUntilSettled(token, dealt.sessionId, dealt);
    expect(final.phase).toBe('settled');

    const grossCredited = final.hands.reduce((s, h) => s + (h.profit ?? 0), 0);
    const bal = await getBalance(user.id);
    expect(bal).toBe(1000 - 100 + grossCredited);

    // One log row per pre-deal hand (no split here → exactly 2).
    const logs = await db.select().from(gameLogs).where(eq(gameLogs.userId, user.id));
    expect(logs).toHaveLength(2);
    // The last-written row carries the final running balance.
    const last = logs.reduce((a, b) => (b.id > a.id ? b : a));
    expect(last.balanceAfter).toBe(bal);
  });

  it('returns 402 and leaves balance untouched when the stake exceeds funds', async () => {
    const { user, token } = await createUser({ balance: 30 });
    const res = await bearer('post', '/api/games/blackjack/deal', token).send({ bets: [100] });
    expect(res.status).toBe(402);
    expect(await getBalance(user.id)).toBe(30);
    const logs = await db.select().from(gameLogs).where(eq(gameLogs.userId, user.id));
    expect(logs).toHaveLength(0);
  });
});
