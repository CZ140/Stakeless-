// In-memory registry of live poker table engines + the money/persistence layer.
// The single writer for poker tables: it owns the PokerTable engines, moves coins
// between users.balance and seat stacks atomically, and persists each human's
// stack at hand end. The realtime + bot layer (P4) attaches via `hooks` and calls
// startNextHandIfReady() on a delay; nothing here touches sockets directly.
import { eq, and, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users, pokerTables, pokerSeats, pokerInvites, groupMembers } from '../../db/schema.js';
import { PokerTable } from './table.js';
import { decideBotAction, BOT_NAMES } from './bot.js';
import { areFriends } from '../friendService.js';
import { isGroupMember } from '../groupService.js';
import { POKER } from '@gambling/shared';
import type { PokerAction, PublicTableState, PrivateHand, PokerTableSummary, PokerInvite } from '@gambling/shared';

function err(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}
function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;
  return code === '23505';
}

export interface CreateTableInput {
  name: string;
  type: 'public' | 'private';
  smallBlind: number;
  bigBlind: number;
  maxSeats?: number;
  groupId?: number | null;
  botTarget?: number;
}

// P4 attaches these to push state / arm turn timers / drive bots.
export interface ManagerHooks {
  onStateChange?: (tableId: number) => void;
  onHandResult?: (tableId: number) => void;
  onActorChanged?: (tableId: number) => void;
  onHandEnded?: (tableId: number) => void; // schedule the next hand (with a delay)
}

interface TableMeta {
  botTarget: number;
  maxBuyIn: number;
  bigBlind: number;
}

class TableManager {
  private engines = new Map<number, PokerTable>();
  private meta = new Map<number, TableMeta>();
  hooks: ManagerHooks = {};

  // Build (or fetch) the live engine for a table, seating the persisted humans.
  private async loadEngine(tableId: number): Promise<PokerTable> {
    const existing = this.engines.get(tableId);
    if (existing) return existing;

    const [cfg] = await db.select().from(pokerTables).where(eq(pokerTables.id, tableId));
    if (!cfg) throw err('NOT_FOUND', 'Table not found');
    this.meta.set(tableId, { botTarget: cfg.botTarget, maxBuyIn: cfg.maxBuyIn, bigBlind: cfg.bigBlind });
    const eng = new PokerTable({
      id: cfg.id,
      name: cfg.name,
      smallBlind: cfg.smallBlind,
      bigBlind: cfg.bigBlind,
      maxSeats: cfg.maxSeats,
    });
    const seats = await db
      .select({
        seatIndex: pokerSeats.seatIndex,
        stack: pokerSeats.stack,
        userId: users.id,
        username: users.username,
        avatarColor: users.avatarColor,
      })
      .from(pokerSeats)
      .innerJoin(users, eq(pokerSeats.userId, users.id))
      .where(eq(pokerSeats.tableId, tableId));
    for (const s of seats) {
      eng.seatPlayer(s.seatIndex, { userId: s.userId, username: s.username, avatarColor: s.avatarColor, isBot: false, stack: s.stack });
    }
    this.engines.set(tableId, eng);
    return eng;
  }

  // ─── Access control (private tables) ────────────────────────────────────────
  // Public tables are open to everyone. A PRIVATE table may only be sat at / viewed
  // by its owner, a member of the group it's scoped to, or someone who's been
  // invited (a persisted poker_invites grant). Lobby visibility (listTables) is
  // gated by the same rule, so a private table is genuinely private — not merely
  // hidden from the lobby while remaining joinable by anyone with its id.
  private async isPrivateMember(userId: number, cfg: typeof pokerTables.$inferSelect): Promise<boolean> {
    if (cfg.ownerId === userId) return true;
    if (cfg.groupId != null && (await isGroupMember(userId, cfg.groupId))) return true;
    const [inv] = await db
      .select({ id: pokerInvites.id })
      .from(pokerInvites)
      .where(and(eq(pokerInvites.tableId, cfg.id), eq(pokerInvites.inviteeId, userId)));
    return !!inv;
  }

  // Non-throwing check for the socket spectate path (guest sockets pass undefined).
  async canAccessTable(userId: number | undefined, tableId: number): Promise<boolean> {
    const [cfg] = await db.select().from(pokerTables).where(eq(pokerTables.id, tableId));
    if (!cfg) return false;
    if (cfg.type !== 'private') return true;
    if (userId === undefined) return false;
    return this.isPrivateMember(userId, cfg);
  }

  // Throwing check for REST reads — distinguishes a missing table from a private one.
  async assertCanAccess(userId: number, tableId: number): Promise<void> {
    const [cfg] = await db.select().from(pokerTables).where(eq(pokerTables.id, tableId));
    if (!cfg) throw err('NOT_FOUND', 'Table not found');
    if (cfg.type === 'private' && !(await this.isPrivateMember(userId, cfg))) throw err('PRIVATE_TABLE', 'This table is private');
  }

  // ─── Lobby ────────────────────────────────────────────────────────────────
  async createTable(userId: number, input: CreateTableInput): Promise<number> {
    const name = input.name.trim();
    if (name.length < 1 || name.length > 50) throw err('INVALID_NAME', 'Name must be 1–50 characters');
    if (input.bigBlind <= 0 || input.smallBlind <= 0 || input.smallBlind > input.bigBlind) throw err('INVALID_STAKES', 'Invalid blinds');
    const maxSeats = Math.min(POKER.MAX_SEATS, Math.max(2, input.maxSeats ?? POKER.MAX_SEATS));
    const minBuyIn = input.bigBlind * POKER.MIN_BUYIN_BB;
    const maxBuyIn = input.bigBlind * POKER.MAX_BUYIN_BB;
    if (input.type === 'private' && input.groupId != null) {
      // Must be a member of the group to scope a private table to it.
      const [m] = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.userId, userId)));
      if (!m) throw err('NOT_AUTHORIZED', 'Not a member of that group');
    }
    const botTarget = Math.max(0, Math.min(maxSeats - 1, input.botTarget ?? 0));
    const [row] = await db
      .insert(pokerTables)
      .values({
        name,
        type: input.type,
        ownerId: input.type === 'private' ? userId : null,
        groupId: input.type === 'private' ? input.groupId ?? null : null,
        smallBlind: input.smallBlind,
        bigBlind: input.bigBlind,
        maxSeats,
        minBuyIn,
        maxBuyIn,
        botTarget,
      })
      .returning({ id: pokerTables.id });
    return row!.id;
  }

  async listTables(userId: number): Promise<PokerTableSummary[]> {
    // Public tables + private tables in my groups + any table where I'm seated.
    const myGroupRows = await db.select({ groupId: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.userId, userId));
    const myGroupIds = myGroupRows.map((g) => g.groupId);
    const mySeatRows = await db.select({ tableId: pokerSeats.tableId }).from(pokerSeats).where(eq(pokerSeats.userId, userId));
    const mySeatTableIds = new Set(mySeatRows.map((s) => s.tableId));
    const myInviteRows = await db.select({ tableId: pokerInvites.tableId }).from(pokerInvites).where(eq(pokerInvites.inviteeId, userId));
    const myInvitedTableIds = new Set(myInviteRows.map((r) => r.tableId));

    const allTables = await db.select().from(pokerTables);
    const seatCounts = await db
      .select({ tableId: pokerSeats.tableId, n: sql<number>`count(*)`.mapWith(Number) })
      .from(pokerSeats)
      .groupBy(pokerSeats.tableId);
    const countByTable = new Map(seatCounts.map((c) => [c.tableId, c.n]));

    const visible = allTables.filter(
      (t) =>
        t.type === 'public' ||
        mySeatTableIds.has(t.id) ||
        myInvitedTableIds.has(t.id) ||
        (t.groupId != null && myGroupIds.includes(t.groupId)),
    );
    return visible.map((t) => {
      const eng = this.engines.get(t.id);
      return {
        id: t.id,
        name: t.name,
        type: t.type as 'public' | 'private',
        smallBlind: t.smallBlind,
        bigBlind: t.bigBlind,
        maxSeats: t.maxSeats,
        minBuyIn: t.minBuyIn,
        maxBuyIn: t.maxBuyIn,
        seatedHumans: countByTable.get(t.id) ?? 0,
        botCount: eng ? eng.occupiedSeats().filter((s) => s.isBot).length : 0,
        handInProgress: eng ? eng.isHandInProgress() : false,
        iAmSeated: mySeatTableIds.has(t.id),
        groupId: t.groupId ?? null,
      };
    });
  }

  async getView(userId: number, tableId: number): Promise<{ table: PublicTableState; hand: PrivateHand | null }> {
    await this.assertCanAccess(userId, tableId); // private tables: owner / group / invited only
    const eng = await this.loadEngine(tableId);
    return { table: eng.toPublicState(), hand: eng.privateHandFor(userId) };
  }

  // ─── Sit / leave (money) ─────────────────────────────────────────────────────
  async sit(userId: number, tableId: number, seatIndex: number, buyIn: number): Promise<void> {
    const [cfg] = await db.select().from(pokerTables).where(eq(pokerTables.id, tableId));
    if (!cfg) throw err('NOT_FOUND', 'Table not found');
    if (seatIndex < 0 || seatIndex >= cfg.maxSeats) throw err('BAD_SEAT', 'Invalid seat');
    if (buyIn < cfg.minBuyIn || buyIn > cfg.maxBuyIn) throw err('BAD_BUYIN', `Buy-in must be ${cfg.minBuyIn}–${cfg.maxBuyIn}`);
    if (cfg.type === 'private' && !(await this.isPrivateMember(userId, cfg))) throw err('PRIVATE_TABLE', 'This table is private');

    const eng = await this.loadEngine(tableId);
    if (eng.seatOfUser(userId)) throw err('ALREADY_SEATED', 'You are already at this table');
    if (eng.occupiedSeats().some((s) => s.seatIndex === seatIndex)) throw err('SEAT_TAKEN', 'Seat taken');

    const u = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ balance: users.balance, username: users.username, avatarColor: users.avatarColor })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');
      if (!row) throw err('NOT_FOUND', 'User not found');
      if (row.balance < buyIn) throw err('INSUFFICIENT_FUNDS', 'Not enough coins for that buy-in');
      await tx.update(users).set({ balance: row.balance - buyIn }).where(eq(users.id, userId));
      try {
        await tx.insert(pokerSeats).values({ tableId, userId, seatIndex, stack: buyIn });
      } catch (e) {
        if (isUniqueViolation(e)) throw err('SEAT_TAKEN', 'Seat taken');
        throw e;
      }
      return row;
    });

    eng.seatPlayer(seatIndex, { userId, username: u.username, avatarColor: u.avatarColor, isBot: false, stack: buyIn });
    this.maybeStartHand(tableId, eng);
    this.hooks.onStateChange?.(tableId);
  }

  async leave(userId: number, tableId: number): Promise<{ cashedOut: number }> {
    const eng = await this.loadEngine(tableId);
    const seat = eng.seatOfUser(userId);
    if (!seat) throw err('NOT_SEATED', 'You are not at this table');

    if (eng.isHandInProgress() && seat.inHand && seat.status !== 'folded') {
      // Fold and flag leaving; cash-out + removal happen at hand end.
      eng.forceFold(seat.seatIndex);
      if (!eng.isHandInProgress()) await this.settle(tableId, eng);
      else this.hooks.onStateChange?.(tableId);
      return { cashedOut: 0 };
    }
    // Between hands → cash out the persisted stack now.
    const stack = seat.stack;
    await this.cashOut(userId, tableId, stack);
    eng.removeSeat(seat.seatIndex);
    this.hooks.onStateChange?.(tableId);
    return { cashedOut: stack };
  }

  private async cashOut(userId: number, tableId: number, amount: number): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.update(users).set({ balance: sql`${users.balance} + ${amount}` }).where(eq(users.id, userId));
      await tx.delete(pokerSeats).where(and(eq(pokerSeats.tableId, tableId), eq(pokerSeats.userId, userId)));
    });
  }

  // ─── Crash recovery ──────────────────────────────────────────────────────────
  // Called ONCE on server boot. Live hands are in-memory only, so a restart
  // abandons them; this returns every parked seat stack to its owner's balance and
  // clears the seats so no coins are stranded. Since the persisted stack is the
  // pre-hand snapshot, an abandoned mid-hand pot is effectively refunded too.
  // Tables (lobby config) survive — players just re-sit. Idempotent (no-op when no
  // seats exist) and run in one transaction so a partial refund can't occur.
  async refundAllSeats(): Promise<{ seats: number; chips: number }> {
    return db.transaction(async (tx) => {
      const seats = await tx
        .select({ userId: pokerSeats.userId, stack: pokerSeats.stack })
        .from(pokerSeats);
      if (seats.length === 0) return { seats: 0, chips: 0 };
      // Sum by user — a player can hold a seat at more than one table.
      const byUser = new Map<number, number>();
      for (const s of seats) byUser.set(s.userId, (byUser.get(s.userId) ?? 0) + s.stack);
      for (const [userId, amount] of byUser) {
        await tx.update(users).set({ balance: sql`${users.balance} + ${amount}` }).where(eq(users.id, userId));
      }
      await tx.delete(pokerSeats);
      const chips = seats.reduce((sum, s) => sum + s.stack, 0);
      this.engines.clear();
      return { seats: seats.length, chips };
    });
  }

  // ─── Actions ────────────────────────────────────────────────────────────────
  async act(userId: number, tableId: number, action: PokerAction): Promise<void> {
    const eng = await this.loadEngine(tableId);
    const seat = eng.seatOfUser(userId);
    if (!seat) throw err('NOT_SEATED', 'You are not at this table');
    if (eng.actingIndex !== seat.seatIndex) throw err('NOT_YOUR_TURN', 'It is not your turn');
    eng.applyAction(seat.seatIndex, action); // throws coded ILLEGAL_ACTION / NOT_YOUR_TURN
    await this.afterAction(tableId, eng);
  }

  // After ANY action (human, bot, or timeout): settle if the hand ended, else
  // notify the realtime layer to push state + arm the next actor (timer / bot).
  private async afterAction(tableId: number, eng: PokerTable): Promise<void> {
    if (!eng.isHandInProgress() && eng.street === 'showdown') {
      await this.settle(tableId, eng);
    } else {
      this.hooks.onActorChanged?.(tableId);
      this.hooks.onStateChange?.(tableId);
    }
  }

  // Apply the current bot's decision (called by the realtime layer on a delay, or
  // synchronously by tests). Returns false if the actor isn't a bot.
  async runBotAction(tableId: number): Promise<boolean> {
    const eng = this.engines.get(tableId);
    if (!eng || eng.actingIndex === null) return false;
    const seat = eng.occupiedSeats().find((s) => s.seatIndex === eng.actingIndex);
    if (!seat || !seat.isBot) return false;
    const legal = eng.legalFor(seat.seatIndex);
    const pot = eng.toPublicState().totalPot;
    const action = decideBotAction({
      holeCards: seat.holeCards,
      board: eng.board,
      legal,
      pot,
      toCall: Math.max(0, eng.currentBet - seat.committedThisStreet),
      currentBet: eng.currentBet,
      committedThisStreet: seat.committedThisStreet,
      bigBlind: eng.config.bigBlind,
      stack: seat.stack,
    });
    eng.applyAction(seat.seatIndex, action);
    await this.afterAction(tableId, eng);
    return true;
  }

  // The acting seat ran out of time: auto-check if legal, otherwise fold.
  async timeoutCurrentActor(tableId: number): Promise<void> {
    const eng = this.engines.get(tableId);
    if (!eng || eng.actingIndex === null) return;
    const la = eng.legalFor(eng.actingIndex);
    eng.applyAction(eng.actingIndex, la.canCheck ? { type: 'check' } : { type: 'fold' });
    await this.afterAction(tableId, eng);
  }

  // ─── Hand lifecycle ───────────────────────────────────────────────────────────
  private hasHuman(eng: PokerTable): boolean {
    return eng.occupiedSeats().some((s) => !s.isBot);
  }

  // Pick a bot display name not already in use at the table.
  private pickBotName(eng: PokerTable): string {
    const used = new Set(eng.occupiedSeats().filter((s) => s.isBot).map((s) => s.username));
    const free = BOT_NAMES.find((n) => !used.has(`Bot ${n}`));
    return free ? `Bot ${free}` : `Bot ${eng.occupiedSeats().length + 1}`;
  }

  // Add a bot to a specific empty seat. Bots are OPTIONAL and added on demand by a
  // seated player (click an empty seat → "+ Bot"); they have a synthetic negative
  // userId and a house-funded stack and are never persisted. Adding the player
  // that brings the table to two may kick off the first hand.
  async addBot(userId: number, tableId: number, seatIndex: number): Promise<void> {
    const eng = await this.loadEngine(tableId);
    if (!eng.seatOfUser(userId)) throw err('NOT_SEATED', 'Sit down before adding bots');
    if (seatIndex < 0 || seatIndex >= eng.config.maxSeats) throw err('BAD_SEAT', 'Invalid seat');
    if (eng.occupiedSeats().some((s) => s.seatIndex === seatIndex)) throw err('SEAT_TAKEN', 'That seat is taken');
    const m = this.meta.get(tableId);
    const stack = m?.maxBuyIn ?? eng.config.bigBlind * 100;
    eng.seatPlayer(seatIndex, { userId: -(seatIndex + 1), username: this.pickBotName(eng), avatarColor: null, isBot: true, stack });
    this.maybeStartHand(tableId, eng);
    this.hooks.onStateChange?.(tableId);
  }

  // Remove a bot from a seat. Mid-hand the bot folds and is removed at hand end;
  // otherwise it leaves immediately. Only a seated player may manage bots.
  async removeBot(userId: number, tableId: number, seatIndex: number): Promise<void> {
    const eng = await this.loadEngine(tableId);
    if (!eng.seatOfUser(userId)) throw err('NOT_SEATED', 'You are not at this table');
    const seat = eng.occupiedSeats().find((s) => s.seatIndex === seatIndex);
    if (!seat || !seat.isBot) throw err('NOT_A_BOT', 'That seat is not a bot');
    if (eng.isHandInProgress() && seat.inHand && seat.status !== 'folded') {
      eng.forceFold(seatIndex); // flagged leaving; removed at settle
      if (!eng.isHandInProgress()) await this.settle(tableId, eng);
      else this.hooks.onStateChange?.(tableId);
    } else {
      eng.removeSeat(seatIndex);
      this.hooks.onStateChange?.(tableId);
    }
  }

  // Invite a friend to this table (friend-gated, mirroring group invites). The
  // inviter must be seated; the invitee must be an accepted friend and not already
  // here. Returns the payload for the route to push to the invitee's user room.
  async invite(inviterId: number, tableId: number, inviteeUsername: string): Promise<{ inviteeId: number; payload: PokerInvite }> {
    const eng = await this.loadEngine(tableId);
    if (!eng.seatOfUser(inviterId)) throw err('NOT_SEATED', 'Sit down before inviting');
    const [invitee] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = lower(${inviteeUsername})`);
    if (!invitee) throw err('USER_NOT_FOUND', 'No user with that username');
    if (invitee.id === inviterId) throw err('CANNOT_INVITE_SELF', 'You cannot invite yourself');
    if (!(await areFriends(inviterId, invitee.id))) throw err('NOT_FRIENDS', 'You can only invite friends');
    if (eng.seatOfUser(invitee.id)) throw err('ALREADY_SEATED', 'They are already at this table');
    // Persist the access grant so the invitee may actually sit at / view a private
    // table (and see it in their lobby). Idempotent — re-inviting is a no-op.
    await db.insert(pokerInvites).values({ tableId, inviterId, inviteeId: invitee.id }).onConflictDoNothing();
    const [inviter] = await db
      .select({ id: users.id, username: users.username, avatarColor: users.avatarColor, avatarImage: users.avatarImage, tierLevel: users.tierLevel })
      .from(users)
      .where(eq(users.id, inviterId));
    return {
      inviteeId: invitee.id,
      payload: {
        tableId,
        tableName: eng.config.name,
        inviter: { userId: inviter!.id, username: inviter!.username, avatarColor: inviter!.avatarColor, avatarImage: inviter!.avatarImage, tierLevel: inviter!.tierLevel },
      },
    };
  }

  private maybeStartHand(tableId: number, eng: PokerTable): void {
    if (eng.canStartHand() && this.hasHuman(eng)) {
      eng.startHand();
      this.hooks.onActorChanged?.(tableId);
      this.hooks.onStateChange?.(tableId);
    }
  }

  // Called by P4 (after a short delay) or directly by tests to deal the next hand.
  async startNextHandIfReady(tableId: number): Promise<boolean> {
    const eng = await this.loadEngine(tableId);
    if (!eng.canStartHand() || !this.hasHuman(eng)) return false;
    eng.startHand();
    this.hooks.onActorChanged?.(tableId);
    this.hooks.onStateChange?.(tableId);
    return true;
  }

  // Persist stacks, cash out leavers + busted seats, fire result hooks. Leaves the
  // table in 'showdown'; P4 schedules the next hand via startNextHandIfReady.
  private async settle(tableId: number, eng: PokerTable): Promise<void> {
    const humans = eng.occupiedSeats().filter((s) => !s.isBot);
    // Persist every human's post-hand stack.
    await Promise.all(
      humans.map((s) =>
        db.update(pokerSeats).set({ stack: s.stack }).where(and(eq(pokerSeats.tableId, tableId), eq(pokerSeats.userId, s.userId))),
      ),
    );
    // Cash out + remove any human who asked to leave.
    for (const s of humans.filter((x) => x.leaving)) {
      await this.cashOut(s.userId, tableId, s.stack);
      eng.removeSeat(s.seatIndex);
    }
    // Remove any bot that was taken off the table mid-hand (no cash-out — house chips).
    for (const s of eng.occupiedSeats().filter((x) => x.isBot && x.leaving)) {
      eng.removeSeat(s.seatIndex);
    }
    // House-fund any remaining busted bot back to a full buy-in so it keeps playing.
    const m = this.meta.get(tableId);
    if (m) {
      for (const s of eng.occupiedSeats().filter((x) => x.isBot && x.stack < m.bigBlind)) {
        eng.refillSeat(s.seatIndex, m.maxBuyIn);
      }
    }
    this.hooks.onHandResult?.(tableId);
    this.hooks.onStateChange?.(tableId);
    // Only keep the game going while a human is present.
    if (this.hasHuman(eng)) this.hooks.onHandEnded?.(tableId);
  }

  // Test helper: drop all in-memory engines (the DB is truncated between tests, so
  // cached engines keyed by reused table ids must be cleared too).
  _resetAll(): void {
    this.engines.clear();
  }
  _engine(tableId: number): PokerTable | undefined {
    return this.engines.get(tableId);
  }
}

export const tableManager = new TableManager();
