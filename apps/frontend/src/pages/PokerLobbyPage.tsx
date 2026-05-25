import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from '../components/vault/AppShell';
import { XIcon, ArrowRightIcon, PokerIcon } from '../components/vault/icons';
import { apiClient } from '../api/client';
import { usePokerStore } from '../stores/pokerStore';
import { POKER_STAKES, type PokerStakeId, type PokerTableSummary } from '@gambling/shared';

function CreateTableForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [name, setName] = useState('');
  const [stake, setStake] = useState<PokerStakeId>('micro');
  const [type, setType] = useState<'public' | 'private'>('public');
  const [saving, setSaving] = useState(false);

  async function create() {
    const blinds = POKER_STAKES.find((s) => s.id === stake)!;
    setSaving(true);
    try {
      const res = await apiClient.post<{ id: number }>('/poker/tables', {
        name: name.trim() || `${blinds.label} Table`,
        type,
        smallBlind: blinds.smallBlind,
        bigBlind: blinds.bigBlind,
      });
      toast.success('Table created');
      onCreated(res.data.id);
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } } };
      toast.error(ax.response?.data?.error ?? 'Could not create table');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fg-create card" style={{ padding: 20, marginBottom: 20 }}>
      <div className="fg-create-head">
        <span className="section-title">New table</span>
        <button className="fg-icon-btn" onClick={onClose} aria-label="Close"><XIcon size={14} /></button>
      </div>
      <div className="pkr-create-grid">
        <div>
          <label className="label">Table name <span className="fg-dim">· optional</span></label>
          <input className="input" maxLength={50} placeholder="e.g. Friday Night" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Stakes</label>
          <div className="pkr-stake-row">
            {POKER_STAKES.map((s) => (
              <button key={s.id} className={'pkr-stake' + (stake === s.id ? ' active' : '')} onClick={() => setStake(s.id)}>
                {s.label}<span>{s.smallBlind}/{s.bigBlind}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Visibility</label>
          <div className="pkr-stake-row">
            <button className={'pkr-stake' + (type === 'public' ? ' active' : '')} onClick={() => setType('public')}>Public<span>anyone</span></button>
            <button className={'pkr-stake' + (type === 'private' ? ' active' : '')} onClick={() => setType('private')}>Private<span>invite</span></button>
          </div>
        </div>
      </div>
      <div className="fg-create-foot">
        <span className="fg-mono fg-dim">6-max · buy-in 40–100× the big blind · sit down, then tap empty seats to add bots</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving} onClick={create}>Create table</button>
        </div>
      </div>
    </div>
  );
}

function TableCard({ t, onJoin }: { t: PokerTableSummary; onJoin: () => void }) {
  const players = t.seatedHumans + t.botCount;
  return (
    <button className="pkr-table-card" onClick={onJoin}>
      <div className="pkr-table-top">
        <div className="pkr-table-name">{t.name}</div>
        <span className={'tag' + (t.type === 'private' ? ' gold' : '')}>{t.type === 'private' ? 'PRIVATE' : 'PUBLIC'}</span>
      </div>
      <div className="pkr-table-stakes fg-mono">{t.smallBlind}/{t.bigBlind} · buy-in {t.minBuyIn}–{t.maxBuyIn}</div>
      <div className="pkr-table-foot">
        <span className="fg-mono fg-dim">{players}/{t.maxSeats} seated{t.botCount > 0 ? ` · ${t.botCount} 🤖` : ''}</span>
        <span className="pkr-table-go">
          {t.iAmSeated ? 'Resume' : t.handInProgress ? 'Watch' : 'Sit'} <ArrowRightIcon size={13} />
        </span>
      </div>
    </button>
  );
}

export function PokerLobbyPage() {
  const navigate = useNavigate();
  const lobby = usePokerStore((s) => s.lobby);
  const [creating, setCreating] = useState(false);

  function refresh() {
    apiClient.get<{ tables: PokerTableSummary[] }>('/poker/tables').then((r) => usePokerStore.getState().setLobby(r.data.tables)).catch(() => {});
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000); // light polling of the lobby
    return () => clearInterval(t);
  }, []);

  return (
    <AppShell>
      <div className="crumb"><span>HOME</span><span className="crumb-sep">/</span><span>POKER</span></div>
      <div className="welcome" style={{ marginBottom: 22 }}>
        <div>
          <h1 className="h-title">Poker</h1>
          <p className="h-subtitle">No-Limit Texas Hold'em · play live against friends and bots · no rake</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating((v) => !v)}><PokerIcon size={15} /> Create table</button>
      </div>

      {creating && <CreateTableForm onClose={() => setCreating(false)} onCreated={(id) => navigate(`/games/poker/${id}`)} />}

      <div className="fg-sub-head"><span className="section-title">Tables · {lobby.length}</span><span className="fg-mono fg-dim">tap to sit</span></div>
      {lobby.length === 0 ? (
        <div className="fg-empty">
          <div className="fg-empty-mark">♠</div>
          <h4>No tables yet</h4>
          <p>Create one, set a couple of bots to fill seats, and start playing.</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>Create table</button>
        </div>
      ) : (
        <div className="pkr-table-grid">
          {lobby.map((t) => <TableCard key={t.id} t={t} onJoin={() => navigate(`/games/poker/${t.id}`)} />)}
        </div>
      )}
    </AppShell>
  );
}
