import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from '../components/vault/AppShell';
import { Avatar } from '../components/vault/Avatar';
import { PlayingCard } from '../components/vault/PlayingCard';
import { apiClient } from '../api/client';
import { socket } from '../socket';
import { sound } from '../lib/sound';
import { useAuth } from '../contexts/AuthContext';
import { usePokerStore } from '../stores/pokerStore';
import { useFriendsStore } from '../stores/friendsStore';
import { XIcon } from '../components/vault/icons';
import { legalActions, POKER_CHAT_MAX_LEN, type PublicTableState, type PrivateHand, type PokerHandResult, type PublicSeat, type PokerChatMessage } from '@gambling/shared';

// Fixed seat anchors around the felt (percent of the table box). Seat 0 sits at
// the bottom (the usual hero position); the rest fan out clockwise.
const SEAT_POS = [
  { left: '50%', top: '90%' },
  { left: '11%', top: '66%' },
  { left: '15%', top: '20%' },
  { left: '50%', top: '7%' },
  { left: '85%', top: '20%' },
  { left: '89%', top: '66%' },
];

export function PokerTablePage() {
  const { id } = useParams<{ id: string }>();
  const tableId = Number(id);
  const navigate = useNavigate();
  const { username } = useAuth();

  const table = usePokerStore((s) => s.table);
  const myHole = usePokerStore((s) => s.myHole);
  const lastResult = usePokerStore((s) => s.lastResult);

  const [buyInSeat, setBuyInSeat] = useState<number | null>(null);
  const [inviting, setInviting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [now, setNow] = useState(Date.now());
  const prevStreetCards = useRef(0);

  // Subscribe to the live table on mount.
  useEffect(() => {
    if (!Number.isInteger(tableId)) {
      navigate('/games/poker');
      return;
    }
    apiClient
      .get<{ table: PublicTableState; hand: PrivateHand | null }>(`/poker/tables/${tableId}`)
      .then((r) => {
        usePokerStore.getState().setTable(r.data.table);
        usePokerStore.getState().setHand(r.data.hand);
      })
      .catch(() => navigate('/games/poker'));

    function onState(d: { tableId: number; state: PublicTableState }) {
      if (d.tableId !== tableId) return;
      usePokerStore.getState().setTable(d.state);
      if (d.state.board.length > prevStreetCards.current) {
        sound.cardDeal();
        prevStreetCards.current = d.state.board.length;
      }
      if (d.state.street === 'preflop') prevStreetCards.current = 0;
    }
    function onHand(d: { tableId: number; hand: PrivateHand }) {
      if (d.tableId === tableId) usePokerStore.getState().setHand(d.hand);
    }
    function onResult(d: { tableId: number; result: PokerHandResult }) {
      if (d.tableId !== tableId) return;
      usePokerStore.getState().setResult(d.result);
      usePokerStore.getState().addHandResult(d.result); // accumulate into the history log
      const mine = d.result.seats.find((s) => s.username === username);
      if (mine && mine.won > 0) sound.winMed();
      window.setTimeout(() => usePokerStore.getState().setResult(null), 4500);
    }
    function onHandHistory(d: { tableId: number; hands: PokerHandResult[] }) {
      if (d.tableId === tableId) usePokerStore.getState().setHandHistory(d.hands);
    }

    function onChat(d: { tableId: number; message: PokerChatMessage }) {
      if (d.tableId === tableId) usePokerStore.getState().addChatMessage(d.message);
    }
    function onChatHistory(d: { tableId: number; messages: PokerChatMessage[] }) {
      if (d.tableId === tableId) usePokerStore.getState().setChatHistory(d.messages);
    }

    if (!socket.connected) socket.connect();
    socket.on('poker:state', onState);
    socket.on('poker:hand', onHand);
    socket.on('poker:result', onResult);
    socket.on('poker:chat', onChat);
    socket.on('poker:chathistory', onChatHistory);
    socket.on('poker:handhistory', onHandHistory);
    socket.emit('poker:subscribe', tableId);
    return () => {
      socket.emit('poker:unsubscribe', tableId);
      socket.off('poker:state', onState);
      socket.off('poker:hand', onHand);
      socket.off('poker:result', onResult);
      socket.off('poker:chat', onChat);
      socket.off('poker:chathistory', onChatHistory);
      socket.off('poker:handhistory', onHandHistory);
      usePokerStore.getState().reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  // Tick for the turn timer ring.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  if (!table) {
    return (
      <AppShell>
        <div className="crumb"><Link to="/games/poker">HOME / POKER</Link></div>
        <div className="fg-search-hint">Loading table…</div>
      </AppShell>
    );
  }

  const mySeatObj = table.seats.find((s) => s.username === username && s.userId !== null) ?? null;
  const iAmSeated = mySeatObj !== null;
  const isMyTurn = iAmSeated && table.actingSeat === mySeatObj!.seatIndex;

  async function act(type: 'fold' | 'check' | 'call' | 'raise', amount?: number) {
    sound.chip();
    try {
      await apiClient.post(`/poker/tables/${tableId}/action`, { type, ...(amount != null ? { amount } : {}) });
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } } };
      toast.error(ax.response?.data?.error ?? 'Action failed');
    }
  }

  async function leave() {
    try {
      await apiClient.post(`/poker/tables/${tableId}/leave`);
      navigate('/games/poker');
    } catch {
      toast.error('Could not leave');
    }
  }

  async function addBot(seatIndex: number) {
    sound.chip();
    try {
      await apiClient.post(`/poker/tables/${tableId}/bots`, { seatIndex });
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } } };
      toast.error(ax.response?.data?.error ?? 'Could not add bot');
    }
  }

  async function removeBot(seatIndex: number) {
    try {
      await apiClient.delete(`/poker/tables/${tableId}/bots/${seatIndex}`);
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } } };
      toast.error(ax.response?.data?.error ?? 'Could not remove bot');
    }
  }

  const secsLeft = table.actionDeadline ? Math.max(0, Math.ceil((table.actionDeadline - now) / 1000)) : null;

  return (
    <AppShell>
      <div className="pkr-hero">
        <div>
          <div className="crumb"><Link to="/games/poker">HOME / POKER</Link><span className="crumb-sep">/</span><span>{table.name.toUpperCase()}</span></div>
          <h1 className="h-title">{table.name}</h1>
          <p className="h-subtitle fg-mono">{table.smallBlind}/{table.bigBlind} · hand #{table.handNumber} · {table.street}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => setShowHistory(true)}>History</button>
          {iAmSeated && <button className="btn btn-outline" onClick={() => setInviting(true)}>+ Invite</button>}
          {iAmSeated && <button className="btn btn-ghost" onClick={leave}>Leave table</button>}
        </div>
      </div>

      <div className="pkr-felt">
        {/* Community board + pot */}
        <div className="pkr-center">
          <div className="pkr-pot fg-mono">POT {table.totalPot.toLocaleString()}</div>
          <div className="pkr-board">
            {[0, 1, 2, 3, 4].map((i) => <PlayingCard key={i} card={table.board[i] ?? null} />)}
          </div>
          {lastResult && (
            <div className="pkr-result fg-mono">
              {lastResult.showdown
                ? lastResult.seats.filter((s) => s.won > 0).map((s) => `${s.username} +${s.won}${s.handName ? ` (${s.handName})` : ''}`).join(' · ')
                : `${lastResult.seats.find((s) => s.won > 0)?.username ?? '—'} wins ${lastResult.potTotal}`}
            </div>
          )}
        </div>

        {/* Seats */}
        {SEAT_POS.map((pos, i) => {
          const seat = table.seats[i];
          return (
            <Seat
              key={i}
              pos={pos}
              seat={seat}
              table={table}
              now={now}
              mine={seat?.username === username}
              iAmSeated={iAmSeated}
              onSit={() => setBuyInSeat(i)}
              onAddBot={() => addBot(i)}
              onRemoveBot={() => removeBot(i)}
            />
          );
        })}
      </div>

      {/* Action bar (my turn) */}
      {isMyTurn && mySeatObj && (
        <ActionBar table={table} seat={mySeatObj} onAct={act} secsLeft={secsLeft} />
      )}
      {iAmSeated && !isMyTurn && (
        <div className="pkr-actionbar idle fg-mono">
          {table.street === 'idle' || table.street === 'showdown' ? 'Waiting for the next hand…' : 'Waiting for your turn…'}
        </div>
      )}
      {!iAmSeated && (
        <div className="pkr-actionbar idle fg-mono">Tap an empty seat to sit down.</div>
      )}

      {/* My hole cards */}
      {iAmSeated && myHole && myHole.length > 0 && (
        <div className="pkr-myhand">
          {myHole.map((c, i) => <PlayingCard key={i} card={c} size="lg" />)}
        </div>
      )}

      <ChatPanel tableId={tableId} username={username} />

      {buyInSeat !== null && (
        <BuyInModal table={table} seatIndex={buyInSeat} onClose={() => setBuyInSeat(null)} tableId={tableId} />
      )}
      {inviting && <InviteModal table={table} tableId={tableId} onClose={() => setInviting(false)} />}
      {showHistory && <HistoryModal onClose={() => setShowHistory(false)} />}
    </AppShell>
  );
}

// Recent finished hands at this table (in-memory, last ~30). Backlog arrives on
// subscribe (poker:handhistory); live hands are appended as poker:result fires.
function HistoryModal({ onClose }: { onClose: () => void }) {
  const history = usePokerStore((s) => s.history);
  return (
    <div className="fg-modal-shade" onClick={onClose}>
      <div className="fg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fg-modal-head">
          <div className="section-title">Hand history</div>
          <button className="fg-icon-btn" onClick={onClose} aria-label="Close"><XIcon size={14} /></button>
        </div>
        <div className="pkr-hist-list">
          {history.length === 0 ? (
            <div className="fg-picker-empty">No hands yet — play a few and they'll show up here.</div>
          ) : (
            history.map((h) => <HandRow key={h.handNumber} h={h} />)
          )}
        </div>
      </div>
    </div>
  );
}

function HandRow({ h }: { h: PokerHandResult }) {
  const winners = h.seats.filter((s) => s.won > 0);
  const shown = h.seats.filter((s) => s.holeCards && s.holeCards.length > 0);
  return (
    <div className="pkr-hist-row">
      <div className="pkr-hist-top fg-mono">
        <span>Hand #{h.handNumber}</span>
        <span className="pkr-hist-pot">POT {h.potTotal.toLocaleString()}{h.showdown ? '' : ' · no showdown'}</span>
      </div>
      <div className="pkr-hist-board">
        {h.board.length > 0
          ? h.board.map((c, i) => <PlayingCard key={i} card={c} />)
          : <span className="fg-dim" style={{ fontSize: 12 }}>(folded preflop)</span>}
      </div>
      <div className="pkr-hist-win">
        {winners.length > 0
          ? winners.map((w) => (
              <span className="pkr-hist-winner" key={w.seatIndex}>
                {w.username} <span className="pkr-hist-amt">+{w.won.toLocaleString()}</span>
                {w.handName && <span className="pkr-hist-hand"> · {w.handName}</span>}
              </span>
            ))
          : <span className="fg-dim">—</span>}
      </div>
      {h.showdown && shown.length > 0 && (
        <div className="pkr-hist-shown">
          {shown.map((s) => (
            <span className="pkr-hist-show" key={s.seatIndex}>
              <span className="pkr-hist-show-name">{s.username}</span>
              {s.holeCards!.map((c, i) => <PlayingCard key={i} card={c} />)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Live table chat over the poker:<id> room. Seated players and railbirds alike can
// post; the server gates private tables, rate-limits, and assigns each line an id.
function ChatPanel({ tableId, username }: { tableId: number; username: string | null }) {
  const chat = usePokerStore((s) => s.chat);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Stick to the newest line as messages arrive.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    socket.emit('poker:chat', { tableId, text: t.slice(0, POKER_CHAT_MAX_LEN) });
    setText('');
  }

  return (
    <div className="pkr-chat">
      <div className="pkr-chat-head fg-mono">Table chat</div>
      <div className="pkr-chat-msgs" ref={listRef}>
        {chat.length === 0 ? (
          <div className="pkr-chat-empty fg-dim">No messages yet — say hi 👋</div>
        ) : (
          chat.map((m) => (
            <div className={'pkr-chat-msg' + (m.username === username ? ' mine' : '')} key={m.id}>
              <Avatar username={m.username} avatarColor={m.avatarColor} className="fg-ava s22" />
              <span className="pkr-chat-name">{m.username}</span>
              <span className="pkr-chat-text">{m.text}</span>
            </div>
          ))
        )}
      </div>
      <form className="pkr-chat-input" onSubmit={send}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={POKER_CHAT_MAX_LEN}
          placeholder="Say something…"
          aria-label="Table chat message"
        />
        <button className="btn btn-primary" type="submit" disabled={!text.trim()}>Send</button>
      </form>
    </div>
  );
}

function InviteModal({ table, tableId, onClose }: { table: PublicTableState; tableId: number; onClose: () => void }) {
  const friends = useFriendsStore((s) => s.friends);
  const [invited, setInvited] = useState<Set<number>>(new Set());
  // Friends already seated here can't be invited again.
  const seatedNames = new Set(table.seats.filter((s) => s.username).map((s) => s.username));

  async function invite(userId: number, username: string) {
    setInvited((s) => new Set(s).add(userId));
    try {
      await apiClient.post(`/poker/tables/${tableId}/invite`, { username });
      toast.success(`Invited ${username}`);
    } catch (e) {
      setInvited((s) => {
        const n = new Set(s);
        n.delete(userId);
        return n;
      });
      const ax = e as { response?: { data?: { error?: string } } };
      toast.error(ax.response?.data?.error ?? 'Could not invite');
    }
  }

  return (
    <div className="fg-modal-shade" onClick={onClose}>
      <div className="fg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fg-modal-head">
          <div>
            <div className="section-title">Invite friends to {table.name}</div>
            <div className="h-subtitle" style={{ marginTop: 6, fontSize: 13 }}>
              Only friends can be invited. <Link className="fg-link" to="/friends" onClick={onClose}>Add more friends →</Link>
            </div>
          </div>
          <button className="fg-icon-btn" onClick={onClose} aria-label="Close"><XIcon size={14} /></button>
        </div>
        <div className="fg-picker-list" style={{ maxHeight: 320 }}>
          {friends.length === 0 && <div className="fg-picker-empty">No friends yet — add some on the Friends page.</div>}
          {friends.map((f) => {
            const here = seatedNames.has(f.username);
            const sent = invited.has(f.userId);
            return (
              <div className="fg-picker-row" key={f.userId}>
                <Avatar username={f.username} avatarColor={f.avatarColor} avatarImage={f.avatarImage} className="fg-ava s30" />
                <div className="fg-picker-meta"><div className="fg-picker-name">{f.username}</div></div>
                {here ? (
                  <span className="tag fg-picker-tag">At table</span>
                ) : sent ? (
                  <span className="tag fg-picker-tag">Invited</span>
                ) : (
                  <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => invite(f.userId, f.username)}>Invite</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Seat({
  pos, seat, table, now, mine, iAmSeated, onSit, onAddBot, onRemoveBot,
}: {
  pos: { left: string; top: string };
  seat: PublicSeat | undefined;
  table: PublicTableState;
  now: number;
  mine: boolean;
  iAmSeated: boolean;
  onSit: () => void;
  onAddBot: () => void;
  onRemoveBot: () => void;
}) {
  if (!seat || seat.userId === null) {
    // Empty seat: sit yourself, and (once you're seated) add a bot here.
    return (
      <div className="pkr-seat empty" style={pos}>
        <button className="pkr-seat-add" onClick={onSit}>＋ Sit</button>
        {iAmSeated && <button className="pkr-seat-add bot" onClick={onAddBot}>＋ Bot</button>}
      </div>
    );
  }
  const isActing = table.actingSeat === seat.seatIndex;
  const isButton = table.buttonIndex === seat.seatIndex;
  const folded = seat.status === 'folded';
  const secs = isActing && table.actionDeadline ? Math.max(0, Math.ceil((table.actionDeadline - now) / 1000)) : null;
  return (
    <div className={'pkr-seat' + (isActing ? ' acting' : '') + (folded ? ' folded' : '') + (mine ? ' mine' : '')} style={pos}>
      {seat.isBot && iAmSeated && (
        <button className="pkr-seat-remove" title="Remove bot" onClick={onRemoveBot}>×</button>
      )}
      <div className="pkr-seat-cards">
        {seat.revealedCards
          ? seat.revealedCards.map((c, i) => <PlayingCard key={i} card={c} />)
          : seat.status !== 'empty' && seat.status !== 'sittingOut' && table.street !== 'idle' && table.street !== 'showdown' && !folded
            ? <><PlayingCard /><PlayingCard /></>
            : null}
      </div>
      <div className="pkr-seat-body">
        <Avatar username={seat.username ?? '?'} avatarColor={seat.avatarColor} className="fg-ava s30" />
        <div className="pkr-seat-meta">
          <div className="pkr-seat-name">{seat.username}{seat.isBot && <span className="pkr-bot-tag">BOT</span>}</div>
          <div className="pkr-seat-stack fg-mono">{seat.stack.toLocaleString()}</div>
        </div>
        {isButton && <span className="pkr-dealer">D</span>}
        {seat.status === 'allin' && <span className="pkr-allin">ALL-IN</span>}
      </div>
      {seat.committedThisStreet > 0 && <div className="pkr-bet fg-mono">{seat.committedThisStreet.toLocaleString()}</div>}
      {secs !== null && <div className="pkr-timer">{secs}</div>}
    </div>
  );
}

function ActionBar({
  table, seat, onAct, secsLeft,
}: {
  table: PublicTableState;
  seat: PublicSeat;
  onAct: (type: 'fold' | 'check' | 'call' | 'raise', amount?: number) => void;
  secsLeft: number | null;
}) {
  const la = legalActions({
    stack: seat.stack,
    currentBet: table.currentBet,
    committedThisStreet: seat.committedThisStreet,
    minRaise: table.minRaise,
    bigBlind: table.bigBlind,
  });
  const [raiseTo, setRaiseTo] = useState(la.minRaiseTo);
  // Keep the slider within the current legal range as state changes.
  useEffect(() => {
    setRaiseTo((v) => Math.max(la.minRaiseTo, Math.min(la.maxRaiseTo, v)));
  }, [la.minRaiseTo, la.maxRaiseTo]);

  const pot = table.totalPot;
  const presets: { label: string; to: number }[] = [
    { label: '½ pot', to: table.currentBet + Math.round(pot * 0.5) },
    { label: '¾ pot', to: table.currentBet + Math.round(pot * 0.75) },
    { label: 'Pot', to: table.currentBet + pot },
    { label: 'All-in', to: la.maxRaiseTo },
  ];
  const clamp = (to: number) => Math.max(la.minRaiseTo, Math.min(la.maxRaiseTo, to));

  return (
    <div className="pkr-actionbar">
      <div className="pkr-act-left">
        <button className="btn btn-ghost" onClick={() => onAct('fold')}>Fold</button>
        {la.canCheck ? (
          <button className="btn btn-outline" onClick={() => onAct('check')}>Check</button>
        ) : (
          <button className="btn btn-outline" onClick={() => onAct('call')} disabled={!la.canCall}>
            Call {la.callAmount.toLocaleString()}
          </button>
        )}
      </div>
      {la.canRaise && (
        <div className="pkr-raise">
          <div className="pkr-raise-presets">
            {presets.map((p) => (
              <button key={p.label} className="pkr-preset" onClick={() => setRaiseTo(clamp(p.to))} disabled={clamp(p.to) < la.minRaiseTo && p.to !== la.maxRaiseTo}>{p.label}</button>
            ))}
          </div>
          <input
            type="range"
            className="pkr-slider"
            min={la.minRaiseTo}
            max={la.maxRaiseTo}
            value={raiseTo}
            onChange={(e) => setRaiseTo(Number(e.target.value))}
          />
          <button className="btn btn-primary" onClick={() => onAct('raise', raiseTo)}>
            {raiseTo >= la.maxRaiseTo ? 'All-in' : `Raise to ${raiseTo.toLocaleString()}`}
          </button>
        </div>
      )}
      {secsLeft !== null && <div className="pkr-act-timer fg-mono">{secsLeft}s</div>}
    </div>
  );
}

function BuyInModal({ table, seatIndex, tableId, onClose }: { table: PublicTableState; seatIndex: number; tableId: number; onClose: () => void }) {
  // Buy-in bounds come from the stakes (40–100× BB), matching the server.
  const min = table.bigBlind * 40;
  const max = table.bigBlind * 100;
  const [amount, setAmount] = useState(max);
  const [saving, setSaving] = useState(false);

  async function sit() {
    setSaving(true);
    try {
      await apiClient.post(`/poker/tables/${tableId}/sit`, { seatIndex, buyIn: amount });
      sound.bet();
      onClose();
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } } };
      toast.error(ax.response?.data?.error ?? 'Could not sit');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fg-modal-shade" onClick={onClose}>
      <div className="fg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fg-modal-head">
          <div className="section-title">Buy in — seat {seatIndex + 1}</div>
        </div>
        <div className="fg-mono fg-dim">Blinds {table.smallBlind}/{table.bigBlind} · range {min}–{max}</div>
        <input type="range" className="pkr-slider" min={min} max={max} step={table.bigBlind} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        <div className="pkr-buyin-amt fg-mono">{amount.toLocaleString()} chips</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving} onClick={sit}>Sit down</button>
        </div>
      </div>
    </div>
  );
}
