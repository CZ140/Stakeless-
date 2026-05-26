// Authoritative in-memory No-Limit Hold'em table state machine. Drives one table:
// seating, button/blinds, dealing, the per-street betting loop, all-in handling,
// and showdown settlement (using the pure helpers in @gambling/shared). NO sockets
// or DB here — the realtime/money layers (P3/P4) drive this via method calls and
// read toPublicState()/privateHandFor() to serialize.
//
// Determinism: startHand(deckOverride) accepts a pre-arranged deck so tests can
// script exact hands; in production the caller passes shuffledDeck().
import {
  evaluateHand,
  buildPots,
  awardPots,
  legalActions,
  type Card,
  type PokerAction,
  type SeatStatus,
  type Street,
  type PublicTableState,
  type PrivateHand,
  type SeatContribution,
  type PokerHandResult,
  type PokerHandResultSeat,
} from '@gambling/shared';
import { shuffledDeck } from './deck.js';

export interface SeatInfo {
  userId: number;
  username: string;
  avatarColor: string | null;
  isBot: boolean;
  stack: number;
}

interface EngineSeat {
  seatIndex: number;
  userId: number;
  username: string;
  avatarColor: string | null;
  isBot: boolean;
  stack: number;
  holeCards: Card[];
  status: SeatStatus;
  committedThisStreet: number;
  committedThisHand: number;
  hasActedThisStreet: boolean;
  inHand: boolean;
  leaving: boolean;
}

export interface TableConfig {
  id: number;
  name: string;
  smallBlind: number;
  bigBlind: number;
  maxSeats: number;
}

const HAND_NAMES = [
  'High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight',
  'Flush', 'Full House', 'Four of a Kind', 'Straight Flush',
];

export class PokerTable {
  readonly config: TableConfig;
  private seats: (EngineSeat | null)[];
  private deck: Card[] = [];
  board: Card[] = [];
  street: Street = 'idle';
  buttonIndex = -1;
  actingIndex: number | null = null;
  currentBet = 0;
  minRaise = 0;
  handNumber = 0;
  lastResult: PokerHandResult | null = null;
  // Seats whose hole cards were revealed at the last showdown (for the public view).
  private shown = new Set<number>();

  constructor(config: TableConfig) {
    this.config = config;
    this.seats = Array.from({ length: config.maxSeats }, () => null);
  }

  // ─── Seating ────────────────────────────────────────────────────────────────
  seatPlayer(seatIndex: number, info: SeatInfo): void {
    if (seatIndex < 0 || seatIndex >= this.config.maxSeats) throw new Error('Invalid seat');
    if (this.seats[seatIndex]) throw new Error('Seat taken');
    this.seats[seatIndex] = {
      seatIndex,
      userId: info.userId,
      username: info.username,
      avatarColor: info.avatarColor,
      isBot: info.isBot,
      stack: info.stack,
      holeCards: [],
      status: 'sittingOut',
      committedThisStreet: 0,
      committedThisHand: 0,
      hasActedThisStreet: false,
      inHand: false,
      leaving: false,
    };
  }

  // Top a seat's stack up to `amount` (used to house-fund a busted bot between
  // hands). Only valid when no hand is in progress.
  refillSeat(seatIndex: number, amount: number): void {
    const s = this.seats[seatIndex];
    // startHand() re-derives eligibility from stack > 0, so just topping up the
    // stack makes the seat playable on the next deal.
    if (s && !this.isHandInProgress()) s.stack = amount;
  }

  // Remove a seat. Returns the chips that seat should cash out (its stack).
  removeSeat(seatIndex: number): number {
    const s = this.seats[seatIndex];
    if (!s) return 0;
    const stack = s.stack;
    this.seats[seatIndex] = null;
    if (this.actingIndex === seatIndex) this.actingIndex = null;
    return stack;
  }

  seatOfUser(userId: number): EngineSeat | null {
    return this.seats.find((s) => s?.userId === userId) ?? null;
  }
  occupiedSeats(): EngineSeat[] {
    return this.seats.filter((s): s is EngineSeat => s !== null);
  }
  isHandInProgress(): boolean {
    return this.street !== 'idle' && this.street !== 'showdown';
  }

  // ─── Hand lifecycle ───────────────────────────────────────────────────────────
  // Eligible to be dealt: seated, not flagged sitting-out by the player, has chips.
  private eligible(): EngineSeat[] {
    return this.occupiedSeats().filter((s) => s.stack > 0 && !s.leaving);
  }

  canStartHand(): boolean {
    return !this.isHandInProgress() && this.eligible().length >= 2;
  }

  // Next occupied+eligible seat index strictly after `from` (wraps).
  private nextEligibleAfter(from: number): number {
    for (let step = 1; step <= this.config.maxSeats; step++) {
      const idx = (from + step) % this.config.maxSeats;
      const s = this.seats[idx];
      if (s && s.stack > 0 && !s.leaving) return idx;
    }
    return from;
  }
  // Next seat strictly after `from` that was dealt into this hand (wraps). Unlike
  // nextEligibleAfter this ignores stack, so a seat that posted a blind all-in
  // still receives cards / counts for dealing order.
  private nextInHandAfter(from: number): number {
    for (let step = 1; step <= this.config.maxSeats; step++) {
      const idx = (from + step) % this.config.maxSeats;
      if (this.seats[idx]?.inHand) return idx;
    }
    return from;
  }
  // Next seat strictly after `from` that still needs to act (wraps); -1 if none.
  private nextToActAfter(from: number): number {
    for (let step = 1; step <= this.config.maxSeats; step++) {
      const idx = (from + step) % this.config.maxSeats;
      const s = this.seats[idx];
      if (s && this.needsToAct(s)) return idx;
    }
    return -1;
  }
  private needsToAct(s: EngineSeat): boolean {
    return s.inHand && s.status === 'active' && (!s.hasActedThisStreet || s.committedThisStreet < this.currentBet);
  }

  startHand(deckOverride?: Card[]): boolean {
    if (!this.canStartHand()) return false;
    this.deck = deckOverride ? [...deckOverride] : shuffledDeck();
    this.board = [];
    this.shown.clear();
    this.lastResult = null;

    const elig = this.eligible();
    // Reset every seat for the new hand.
    for (const s of this.occupiedSeats()) {
      s.holeCards = [];
      s.committedThisStreet = 0;
      s.committedThisHand = 0;
      s.hasActedThisStreet = false;
      const inHand = elig.includes(s);
      s.inHand = inHand;
      s.status = inHand ? 'active' : 'sittingOut';
    }

    // Button moves to the next eligible seat.
    this.buttonIndex = this.buttonIndex < 0 ? elig[0]!.seatIndex : this.nextEligibleAfter(this.buttonIndex);

    const heads = elig.length === 2;
    const sbIndex = heads ? this.buttonIndex : this.nextEligibleAfter(this.buttonIndex);
    const bbIndex = this.nextEligibleAfter(sbIndex);

    this.currentBet = 0;
    this.minRaise = this.config.bigBlind;
    this.postBlind(sbIndex, this.config.smallBlind);
    this.postBlind(bbIndex, this.config.bigBlind);
    this.currentBet = this.config.bigBlind;

    // Deal two hole cards, starting left of the button (SB), clockwise. Walk
    // in-hand seats (not stack>0) so a blind-all-in seat is still dealt in.
    for (let round = 0; round < 2; round++) {
      let idx = sbIndex;
      for (let n = 0; n < elig.length; n++) {
        this.seats[idx]!.holeCards.push(this.deck.shift()!);
        idx = this.nextInHandAfter(idx);
      }
    }

    this.street = 'preflop';
    this.handNumber++;
    // First to act preflop = seat after the BB (UTG); heads-up that's the SB/button.
    this.actingIndex = this.advanceOrClose(bbIndex);
    return true;
  }

  private postBlind(seatIndex: number, amount: number): void {
    const s = this.seats[seatIndex]!;
    const pay = Math.min(amount, s.stack);
    s.stack -= pay;
    s.committedThisStreet += pay;
    s.committedThisHand += pay;
    if (s.stack === 0) s.status = 'allin';
  }

  // ─── Actions ────────────────────────────────────────────────────────────────
  legalFor(seatIndex: number) {
    const s = this.seats[seatIndex];
    if (!s) throw err('NO_SEAT', 'No such seat');
    return legalActions({
      stack: s.stack,
      currentBet: this.currentBet,
      committedThisStreet: s.committedThisStreet,
      minRaise: this.minRaise,
      bigBlind: this.config.bigBlind,
    });
  }

  applyAction(seatIndex: number, action: PokerAction): void {
    if (this.actingIndex !== seatIndex) throw err('NOT_YOUR_TURN', 'It is not your turn');
    const s = this.seats[seatIndex]!;
    const la = this.legalFor(seatIndex);

    switch (action.type) {
      case 'fold':
        s.status = 'folded';
        s.hasActedThisStreet = true;
        break;
      case 'check':
        if (!la.canCheck) throw err('ILLEGAL_ACTION', 'Cannot check');
        s.hasActedThisStreet = true;
        break;
      case 'call':
        if (!la.canCall) throw err('ILLEGAL_ACTION', 'Cannot call');
        this.commit(s, la.callAmount);
        s.hasActedThisStreet = true;
        break;
      case 'raise': {
        if (!la.canRaise) throw err('ILLEGAL_ACTION', 'Cannot raise');
        const to = action.amount ?? 0;
        const isShove = to === la.maxRaiseTo;
        if (to < la.minRaiseTo && !isShove) throw err('ILLEGAL_ACTION', 'Raise too small');
        if (to > la.maxRaiseTo) throw err('ILLEGAL_ACTION', 'Raise exceeds stack');
        const raiseSize = to - this.currentBet;
        this.commit(s, to - s.committedThisStreet);
        if (raiseSize >= this.minRaise) this.minRaise = raiseSize; // full raise sets the new min
        this.currentBet = Math.max(this.currentBet, s.committedThisStreet);
        s.hasActedThisStreet = true;
        break;
      }
      default:
        throw err('ILLEGAL_ACTION', 'Unknown action');
    }
    this.advance();
  }

  // Mark a seat as leaving and fold it out of the current hand. If it is their
  // turn this is just a normal fold; otherwise they are mucked and skipped (and
  // the hand ends if only one live seat remains). The seat is removed/cashed out
  // by the manager at hand end.
  forceFold(seatIndex: number): void {
    const s = this.seats[seatIndex];
    if (!s) return;
    s.leaving = true;
    if (!this.isHandInProgress() || !s.inHand || s.status === 'folded' || s.status === 'allin') return;
    if (this.actingIndex === seatIndex) {
      this.applyAction(seatIndex, { type: 'fold' });
      return;
    }
    s.status = 'folded';
    s.hasActedThisStreet = true;
    const live = this.occupiedSeats().filter((x) => x.inHand && x.status !== 'folded');
    if (live.length <= 1) this.endUncontested(live[0]);
  }

  private commit(s: EngineSeat, amount: number): void {
    const pay = Math.min(amount, s.stack);
    s.stack -= pay;
    s.committedThisStreet += pay;
    s.committedThisHand += pay;
    if (s.stack === 0) s.status = 'allin';
  }

  // After an action: end the hand if one player remains, else either pass action
  // to the next seat or close the betting round.
  private advance(): void {
    const live = this.occupiedSeats().filter((s) => s.inHand && s.status !== 'folded');
    if (live.length <= 1) {
      this.endUncontested(live[0]);
      return;
    }
    const next = this.nextToActAfter(this.actingIndex!);
    if (next >= 0) {
      this.actingIndex = next;
    } else {
      this.closeRound();
    }
  }

  // Returns the next seat to act from a starting point, or closes the round/runs
  // it out if nobody can act. Used at the start of preflop.
  private advanceOrClose(from: number): number | null {
    const next = this.nextToActAfter(from);
    if (next >= 0) return next;
    this.closeRound();
    return this.actingIndex;
  }

  private closeRound(): void {
    // Sweep this street's commitments into the running hand totals (already are).
    for (const s of this.occupiedSeats()) {
      s.committedThisStreet = 0;
      s.hasActedThisStreet = false;
    }
    this.currentBet = 0;
    this.minRaise = this.config.bigBlind;

    // If at most one player can still bet (others all-in), run the board out.
    const canBet = this.occupiedSeats().filter((s) => s.inHand && s.status === 'active' && s.stack > 0);
    const runItOut = canBet.length <= 1;

    while (true) {
      if (this.street === 'preflop') {
        this.board.push(this.deck.shift()!, this.deck.shift()!, this.deck.shift()!);
        this.street = 'flop';
      } else if (this.street === 'flop') {
        this.board.push(this.deck.shift()!);
        this.street = 'turn';
      } else if (this.street === 'turn') {
        this.board.push(this.deck.shift()!);
        this.street = 'river';
      } else if (this.street === 'river') {
        this.goToShowdown();
        return;
      }
      if (!runItOut) break;
      // running out: keep dealing until showdown
      if (this.street === 'river') {
        this.goToShowdown();
        return;
      }
    }

    // New street betting: first to act = first eligible seat left of the button.
    const first = this.nextToActAfter(this.buttonIndex);
    if (first >= 0) {
      this.actingIndex = first;
    } else {
      // No one to act (shouldn't happen unless all all-in) → continue running out.
      this.closeRound();
    }
  }

  // Showdown: build pots from each in-hand seat's total contribution, evaluate the
  // non-folded hands, award pots (with side pots + tie splits), credit stacks.
  private goToShowdown(): void {
    this.street = 'showdown';
    const inHand = this.occupiedSeats().filter((s) => s.inHand);
    const contributions: SeatContribution[] = inHand.map((s) => ({
      seat: s.seatIndex,
      committed: s.committedThisHand,
      folded: s.status === 'folded',
    }));
    const pots = buildPots(contributions);

    const scores = new Map<number, number>();
    const handCats = new Map<number, number>();
    for (const s of inHand) {
      if (s.status === 'folded') continue;
      const evald = evaluateHand([...s.holeCards, ...this.board]);
      scores.set(s.seatIndex, evald.score);
      handCats.set(s.seatIndex, evald.category);
      this.shown.add(s.seatIndex);
    }
    const oddChipOrder = this.seatsLeftOfButton();
    const winnings = awardPots(pots, scores, oddChipOrder);
    this.applyWinnings(winnings, pots, true, handCats);
  }

  // Everyone else folded — the lone live seat takes the whole pot (no showdown).
  private endUncontested(winner: EngineSeat | undefined): void {
    this.street = 'showdown';
    const inHand = this.occupiedSeats().filter((s) => s.inHand);
    const total = inHand.reduce((sum, s) => sum + s.committedThisHand, 0);
    const winnings = new Map<number, number>();
    if (winner) winnings.set(winner.seatIndex, total);
    this.applyWinnings(winnings, [{ amount: total }], false, new Map());
  }

  private applyWinnings(
    winnings: Map<number, number>,
    pots: { amount: number }[],
    showdown: boolean,
    handCats: Map<number, number>,
  ): void {
    const inHand = this.occupiedSeats().filter((s) => s.inHand);
    const potTotal = pots.reduce((a, p) => a + p.amount, 0);
    const resultSeats: PokerHandResultSeat[] = inHand.map((s) => {
      const won = winnings.get(s.seatIndex) ?? 0;
      s.stack += won;
      const reveal = showdown && this.shown.has(s.seatIndex) && s.status !== 'folded';
      const catLabel = handCats.has(s.seatIndex) ? HAND_NAMES[handCats.get(s.seatIndex)!] : undefined;
      return {
        seatIndex: s.seatIndex,
        userId: s.userId,
        username: s.username,
        won,
        net: won - s.committedThisHand,
        committed: s.committedThisHand,
        holeCards: reveal ? [...s.holeCards] : null,
        ...(catLabel ? { handName: catLabel } : {}),
        folded: s.status === 'folded',
      };
    });
    this.lastResult = {
      handNumber: this.handNumber,
      board: [...this.board],
      potTotal,
      showdown,
      seats: resultSeats,
      winners: [...winnings.keys()].filter((k) => (winnings.get(k) ?? 0) > 0),
    };
    this.actingIndex = null;
    // Seats with no chips left fall to sitting out; others stay active for next hand.
    for (const s of this.occupiedSeats()) {
      if (s.stack === 0 && s.status !== 'folded') s.status = 'sittingOut';
    }
  }

  // Seat order starting immediately left of the button (for odd-chip assignment).
  private seatsLeftOfButton(): number[] {
    const order: number[] = [];
    for (let step = 1; step <= this.config.maxSeats; step++) {
      const idx = (this.buttonIndex + step) % this.config.maxSeats;
      if (this.seats[idx]?.inHand) order.push(idx);
    }
    return order;
  }

  // Between hands (street still 'showdown'), let a player who didn't fold show
  // their hole cards voluntarily — e.g. the winner of an uncontested pot revealing
  // a bluff. Adds them to `shown` so toPublicState exposes the cards, and reflects
  // it in the finished-hand result. Returns true if newly revealed.
  revealSeat(seatIndex: number): boolean {
    if (this.street !== 'showdown') return false;
    const s = this.seats[seatIndex];
    if (!s || !s.inHand || s.status === 'folded' || s.holeCards.length === 0) return false;
    if (this.shown.has(seatIndex)) return false;
    this.shown.add(seatIndex);
    const rs = this.lastResult?.seats.find((x) => x.seatIndex === seatIndex);
    if (rs) rs.holeCards = [...s.holeCards];
    return true;
  }

  // ─── Views ────────────────────────────────────────────────────────────────
  toPublicState(): PublicTableState {
    const seats = this.seats.map((s, i) => {
      if (!s) {
        return {
          seatIndex: i, userId: null, username: null, avatarColor: null,
          isBot: false, stack: 0, committedThisStreet: 0, status: 'empty' as SeatStatus,
        };
      }
      const reveal = this.street === 'showdown' && this.shown.has(s.seatIndex) && s.status !== 'folded';
      return {
        seatIndex: s.seatIndex,
        userId: s.userId,
        username: s.username,
        avatarColor: s.avatarColor,
        isBot: s.isBot,
        stack: s.stack,
        committedThisStreet: s.committedThisStreet,
        status: s.status,
        ...(reveal ? { revealedCards: [...s.holeCards] } : {}),
      };
    });
    const potTotal = this.occupiedSeats().reduce((a, s) => a + s.committedThisHand, 0);
    return {
      id: this.config.id,
      name: this.config.name,
      smallBlind: this.config.smallBlind,
      bigBlind: this.config.bigBlind,
      maxSeats: this.config.maxSeats,
      seats,
      board: [...this.board],
      pots: [{ amount: potTotal }],
      totalPot: potTotal,
      buttonIndex: this.buttonIndex,
      street: this.street,
      actingSeat: this.actingIndex,
      actionDeadline: null, // set by the realtime layer (P4)
      handNumber: this.handNumber,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
    };
  }

  privateHandFor(userId: number): PrivateHand | null {
    const s = this.seatOfUser(userId);
    if (!s || s.holeCards.length === 0) return null;
    return { seatIndex: s.seatIndex, holeCards: [...s.holeCards] };
  }
}

function err(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}
