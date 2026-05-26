import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/vault/AppShell';
import { gameIcons, CoinIcon, TrophyIcon, ZapIcon } from '../components/vault/icons';
import { TierBadge, tierColor } from '../components/vault/TierBadge';
import { Avatar } from '../components/vault/Avatar';
import { EditProfileModal } from '../components/vault/EditProfileModal';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../api/client';
import { TIERS } from '@gambling/shared';

// ─── Types (mirror GET /profile/:username) ──────────────────────────────────────
interface DailyRow { date: string; pnl: number; wagered: number; games: number; }
interface GameMixRow { gameType: string; games: number; }
interface BiggestWin { net: number; gameType: string; multiplier: number; at: string; }
interface ProfileData {
  username: string;
  balance: number;
  balanceRank: number;
  totalWagered: number;
  totalProfit: number;
  gamesPlayed: number;
  gamesToday: number;
  todayNet: number;
  winRate: number;
  streak: number;
  role: string;
  isVerified: boolean;
  avatarColor: string | null;
  avatarImage: string | null;
  joinedAt: string;
  daily: DailyRow[];
  gameMix: GameMixRow[];
  biggestWin: BiggestWin | null;
}
interface ActivityRow {
  id: number; gameType: string; betAmount: number; outcome: string;
  profit: number; net: number; multiplier: number; createdAt: string;
}

const GAME_LABEL: Record<string, string> = { roulette: 'Roulette', plinko: 'Plinko', mines: 'Mines', blackjack: 'Blackjack' };
const GAME_COLOR: Record<string, string> = { roulette: 'var(--accent)', plinko: 'var(--blue)', mines: 'var(--loss)', blackjack: 'var(--purple)' };
const ROULETTE_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

type ChartTab = 'pnl' | 'wagered' | 'games';

// Small inline tag icons (no emoji/clipart, matching the design).
const StarIco = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.7L12 17.3 5.9 20.3l1.4-6.7L2.2 9l6.9-.7z" /></svg>;
const DiamondIco = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12l4 6-10 12L2 9z" /></svg>;
const ShieldIco = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" /><path d="M9 12l2 2 4-4" /></svg>;
const FireIco = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1 3-1 4-2 6s0 4 2 4 2-3 1-5c2 1 4 4 4 7a7 7 0 0 1-14 0c0-3 2-5 3-7 1 2 3 1 3-2 0-1 0-2 0-3z" /></svg>;
const EditIco = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;

function deriveHandle(username: string): string {
  const letters = (username.replace(/[^a-z]/gi, '').slice(0, 3) || 'STK').toUpperCase();
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) >>> 0;
  return `${letters}-${String(1000 + (h % 9000))}`;
}

function describe(row: ActivityRow): string {
  switch (row.gameType) {
    case 'roulette': {
      const p = Number(row.outcome);
      if (Number.isNaN(p)) return 'Spin settled';
      return `Landed ${p} ${p === 0 ? 'green' : ROULETTE_RED.has(p) ? 'red' : 'black'}`;
    }
    case 'plinko': { const m = /^bucket_(\d+)$/.exec(row.outcome); return m ? `Ball into slot ${m[1]}` : 'Ball dropped'; }
    case 'mines': {
      if (row.outcome === 'exploded') return 'Hit a mine';
      const m = /^cashout_(\d+)$/.exec(row.outcome);
      return m ? `Cashed out · ${m[1]} gem${m[1] === '1' ? '' : 's'}` : 'Round settled';
    }
    case 'blackjack':
      return ({ player_blackjack: 'Blackjack!', player_win: 'Won the hand', dealer_bust: 'Dealer busted', push: 'Push', player_bust: 'Busted', dealer_win: 'Dealer won' } as Record<string, string>)[row.outcome] ?? 'Hand settled';
    default: return row.outcome;
  }
}

function relTime(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function StatCard({ label, value, valSmall, sub, subCls, chipBg, chipFg, chip }: {
  label: string; value: string; valSmall?: string; sub?: string; subCls?: string;
  chipBg: string; chipFg: string; chip: ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="head">
        <span className="lab">{label}</span>
        <span className="chip" style={{ background: chipBg, color: chipFg }}>{chip}</span>
      </div>
      <div className="val">{value}{valSmall && <small>{valSmall}</small>}</div>
      {sub && <div className={'sub ' + (subCls ?? '')}>{sub}</div>}
    </div>
  );
}

function PnlChart({ daily, tab }: { daily: DailyRow[]; tab: ChartTab }) {
  const values = daily.map((d) => (tab === 'pnl' ? d.pnl : tab === 'wagered' ? d.wagered : d.games));
  const max = Math.max(1, ...values.map(Math.abs));
  if (daily.length === 0) return <div className="chart-wrap"><div className="chart-empty-bars">No activity in the last 30 days.</div></div>;
  return (
    <div className="chart-wrap">
      {tab === 'pnl' && <div className="chart-zero" />}
      <div className="bars">
        {daily.map((d, i) => {
          const v = values[i]!;
          const pct = (Math.abs(v) / max) * (tab === 'pnl' ? 48 : 92);
          const label = tab === 'pnl'
            ? `${d.date} · ${v >= 0 ? '+' : ''}${v.toLocaleString()} coins`
            : tab === 'wagered' ? `${d.date} · ${v.toLocaleString()} coins` : `${d.date} · ${v} games`;
          if (tab === 'pnl') {
            return (
              <div className="bar-col" key={i}>
                <span className={'bar ' + (v >= 0 ? 'up' : 'down')} style={{ height: pct + '%' }} />
                <span className="tooltip">{label}</span>
              </div>
            );
          }
          return (
            <div className="bar-col" key={i} style={{ justifyContent: 'flex-end' }}>
              <span className="bar up" style={{ height: pct + '%', bottom: 0, top: 'auto', background: tab === 'wagered' ? 'linear-gradient(180deg, var(--blue), rgba(91,141,239,0.3))' : 'linear-gradient(180deg, var(--purple), rgba(179,146,240,0.3))' }} />
              <span className="tooltip">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { username: routeUsername } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { username: authUsername, updateLocalProfile } = useAuth();
  const [data, setData] = useState<ProfileData | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<ChartTab>('pnl');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!routeUsername) return;
    setIsLoading(true);
    setNotFound(false);
    setData(null);
    const u = encodeURIComponent(routeUsername);
    Promise.all([
      apiClient.get<ProfileData>(`/profile/${u}`),
      apiClient.get<{ activity: ActivityRow[] }>(`/profile/${u}/activity?limit=8`).catch(() => null),
    ])
      .then(([profileRes, activityRes]) => {
        setData(profileRes.data);
        if (activityRes) setActivity(activityRes.data.activity);
      })
      .catch((err: { response?: { status?: number } }) => {
        if (err.response?.status === 404) setNotFound(true);
      })
      .finally(() => setIsLoading(false));
  }, [routeUsername]);

  const tier = useMemo(() => {
    const wagered = data?.totalWagered ?? 0;
    let idx = 0;
    for (let i = 0; i < TIERS.length; i++) if (wagered >= TIERS[i]!.minWagered) idx = i;
    const cur = TIERS[idx]!;
    const next = TIERS[idx + 1];
    const progress = next ? Math.min(1, (wagered - cur.minWagered) / (next.minWagered - cur.minWagered)) : 1;
    const fillPct = ((idx + progress) / (TIERS.length - 1)) * 100;
    return { idx, cur, next, progress, fillPct, wagered };
  }, [data?.totalWagered]);

  if (isLoading) {
    return <AppShell><div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 80 }}>Loading…</div></AppShell>;
  }
  if (notFound || !data) {
    return (
      <AppShell>
        <div className="crumb"><span>HOME</span><span className="crumb-sep">/</span><span>ACCOUNT</span></div>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 64 }}>{notFound ? 'User not found.' : 'Could not load this profile.'}</div>
      </AppShell>
    );
  }

  const net30 = data.daily.reduce((s, d) => s + d.pnl, 0);
  const totalMixGames = data.gameMix.reduce((s, g) => s + g.games, 0) || 1;
  const joined = new Date(data.joinedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase();
  const profitPos = data.totalProfit >= 0;
  const isOwn = !!authUsername && authUsername.toLowerCase() === data.username.toLowerCase();

  return (
    <AppShell>
      <div className="crumb">
        <span>HOME</span><span className="crumb-sep">/</span><span style={{ color: 'var(--text-secondary)' }}>ACCOUNT</span>
        <span className="crumb-sep">/</span><span>{data.username.toUpperCase()}</span>
      </div>

      {/* Hero */}
      <div className="acc-hero">
        <Avatar username={data.username} avatarColor={data.avatarColor} avatarImage={data.avatarImage} className="acc-ava" />
        <div className="acc-id">
          <h1>{data.username}<span className="handle">{deriveHandle(data.username)}</span></h1>
          <div className="meta-line">
            <span>{data.role.toUpperCase()}</span>
            <span className="pip">·</span>
            <span>JOINED {joined}</span>
            {data.streak > 0 && <><span className="pip">·</span><span className="streak"><FireIco /> {data.streak}-DAY STREAK</span></>}
          </div>
          <div className="tag-row">
            <span className="tag gold"><StarIco /> RANK #{data.balanceRank}</span>
            <span className="tag tier-tag" style={{ color: tierColor(tier.idx), borderColor: tierColor(tier.idx) }}>
              <TierBadge level={tier.idx} size={11} /> TIER · {tier.cur.name.toUpperCase()}
            </span>
            {data.isVerified && <span className="tag"><ShieldIco /> VERIFIED</span>}
          </div>
        </div>
        <div className="acc-hero-actions">
          {isOwn && (
            <button className="btn btn-ghost" type="button" onClick={() => setEditing(true)}>
              <EditIco /> Edit profile
            </button>
          )}
          <span className="id-code">ID · {deriveHandle(data.username)}</span>
        </div>
      </div>

      {/* Tier ladder */}
      <div className="tier-bar">
        <div>
          <div className="tier-track">
            <div className="tier-fill" style={{ width: tier.fillPct + '%' }} />
            {TIERS.map((t, i) => (
              <div key={t.name} className={'tier-pip ' + (i < tier.idx ? 'done' : i === tier.idx ? 'now' : '')} style={{ left: (i / (TIERS.length - 1)) * 100 + '%' }} />
            ))}
          </div>
          <div className="tier-labels">
            {TIERS.map((t, i) => <span key={t.name} className={i === tier.idx ? 'cur' : ''}>{t.name}</span>)}
          </div>
        </div>
        <div className="tier-progress">
          {tier.next ? (
            <>
              <div className="pct">{tier.wagered.toLocaleString()}<small> / {tier.next.minWagered.toLocaleString()} coins</small></div>
              <div className="sub">TO {tier.next.name.toUpperCase()} · WAGERED</div>
            </>
          ) : (
            <>
              <div className="pct">MAX</div>
              <div className="sub">TOP TIER REACHED</div>
            </>
          )}
        </div>
      </div>

      {/* Tier perks — what this tier grants, and what's next */}
      <div className="tier-perks">
        <div className="tier-perk">
          <span className="tier-perk-ico" style={{ color: 'var(--accent)' }}><ZapIcon size={14} /></span>
          <span className="tier-perk-txt">Daily bonus <strong>{tier.cur.dailyBonus.toLocaleString()}</strong>/day</span>
        </div>
        {tier.next ? (
          <div className="tier-perk">
            <span className="tier-perk-ico" style={{ color: tierColor(tier.idx + 1) }}><CoinIcon size={14} /></span>
            <span className="tier-perk-txt">
              Next: <strong style={{ color: tierColor(tier.idx + 1) }}>{tier.next.name}</strong> unlocks{' '}
              <strong>+{tier.next.reward.toLocaleString()}</strong> &amp; {tier.next.dailyBonus.toLocaleString()}/day
            </span>
          </div>
        ) : (
          <div className="tier-perk">
            <span className="tier-perk-ico" style={{ color: tierColor(tier.idx) }}><TrophyIcon size={14} /></span>
            <span className="tier-perk-txt">Highest tier — all perks unlocked</span>
          </div>
        )}
      </div>

      {/* Stat grid */}
      <div className="acc-stat-grid">
        <StatCard label="BALANCE" value={data.balance.toLocaleString()} valSmall=" coins" chipBg="rgba(0,224,130,0.15)" chipFg="var(--accent)" chip={<CoinIcon size={14} />}
          sub={data.todayNet !== 0 ? `${data.todayNet > 0 ? '+' : '−'}${Math.abs(data.todayNet).toLocaleString()} today` : 'no change today'} subCls={data.todayNet > 0 ? 'pos' : data.todayNet < 0 ? 'neg' : ''} />
        <StatCard label="RANK" value={`#${data.balanceRank}`} chipBg="rgba(212,168,87,0.2)" chipFg="var(--gold)" chip={<StarIco />} sub="by balance" />
        <StatCard label="TOTAL WAGERED" value={data.totalWagered.toLocaleString()} valSmall=" coins" chipBg="rgba(91,141,239,0.18)" chipFg="var(--blue)" chip={<DiamondIco />} sub="lifetime" />
        <StatCard label="TOTAL PROFIT" value={`${profitPos ? '+' : '−'}${Math.abs(data.totalProfit).toLocaleString()}`} valSmall=" coins" chipBg="rgba(33,208,122,0.18)" chipFg="var(--win)" chip={<TrophyIcon size={11} color="var(--win)" />} sub="net all time" subCls={profitPos ? 'pos' : 'neg'} />
        <StatCard label="GAMES PLAYED" value={data.gamesPlayed.toLocaleString()} chipBg="rgba(179,146,240,0.18)" chipFg="var(--purple)" chip={<DiamondIco />} sub={`${data.gamesToday} today`} />
        <StatCard label="WIN RATE" value={data.winRate.toFixed(1)} valSmall="%" chipBg="rgba(0,224,130,0.15)" chipFg="var(--accent)" chip={<ShieldIco />} sub="of rounds won" />
      </div>

      {/* Chart + game mix */}
      <div className="acc-grid">
        <div className="panel">
          <div className="panel-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <h3>Profit / Loss</h3>
              <span className="net">NET 30D <strong className={net30 < 0 ? 'neg' : ''}>{net30 >= 0 ? '+' : '−'}{Math.abs(net30).toLocaleString()} coins</strong></span>
            </div>
            <div className="seg">
              {([['pnl', 'P/L'], ['wagered', 'WAGERED'], ['games', 'GAMES']] as [ChartTab, string][]).map(([k, l]) => (
                <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)} type="button">{l}</button>
              ))}
            </div>
          </div>
          <PnlChart daily={data.daily} tab={tab} />
          {data.daily.length > 0 && (
            <div className="bar-axis">
              <div>{data.daily[0]!.date.slice(5)}</div>
              {data.daily.length > 2 && <div style={{ textAlign: 'center' }}>{data.daily[Math.floor(data.daily.length / 2)]!.date.slice(5)}</div>}
              <div style={{ textAlign: 'right' }}>{data.daily[data.daily.length - 1]!.date.slice(5)}</div>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head" style={{ marginBottom: 16 }}>
            <h3>Game mix</h3>
            <span className="net" style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}>{data.gamesPlayed.toLocaleString()} ROUNDS</span>
          </div>
          <div className="mix">
            {data.gameMix.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No rounds played yet.</div>}
            {data.gameMix.slice().sort((a, b) => b.games - a.games).map((g) => {
              const Ico = gameIcons[g.gameType];
              const color = GAME_COLOR[g.gameType] ?? 'var(--accent)';
              const pct = Math.round((g.games / totalMixGames) * 100);
              return (
                <div key={g.gameType} className="mix-row">
                  <span className="gico" style={{ background: 'rgba(255,255,255,0.04)', color }}>{Ico && <Ico size={13} />}</span>
                  <span className="gname">{GAME_LABEL[g.gameType] ?? g.gameType}</span>
                  <span className="gtrack"><span className="gfill" style={{ width: pct + '%', background: color }} /></span>
                  <span className="gpct">{pct}%<small>of play</small></span>
                </div>
              );
            })}
          </div>
          {data.biggestWin && (
            <div className="biggest">
              <div className="lab">Biggest win</div>
              <div className="val">+{data.biggestWin.net.toLocaleString()} coins</div>
              <div className="ctx">
                on <strong>{GAME_LABEL[data.biggestWin.gameType] ?? data.biggestWin.gameType}</strong>
                {' · '}{(Number.isInteger(data.biggestWin.multiplier) ? data.biggestWin.multiplier : data.biggestWin.multiplier.toFixed(1))}× multiplier
                {' · '}{new Date(data.biggestWin.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent bets */}
      <div className="panel">
        <div className="panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h3>Recent bets</h3>
            <span className="tag muted">LATEST</span>
          </div>
        </div>
        {activity.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>No bets yet.</div>
        ) : (
          <>
            <div className="table-scroll">
            <table className="act-table">
              <thead>
                <tr><th>Game</th><th>Description</th><th className="r">Time</th><th className="r">Multiplier</th><th className="r">Result</th></tr>
              </thead>
              <tbody>
                {activity.map((r) => {
                  const Ico = gameIcons[r.gameType];
                  const color = GAME_COLOR[r.gameType] ?? 'var(--accent)';
                  const showMult = r.profit > 0;
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="gcell">
                          <span className="gicon" style={{ color }}>{Ico && <Ico size={14} />}</span>
                          <div>
                            <div className="gname">{GAME_LABEL[r.gameType] ?? r.gameType}</div>
                            <div className="gtype">ROUND #{String(r.id).padStart(4, '0')}</div>
                          </div>
                        </div>
                      </td>
                      <td className="desc">{describe(r)}</td>
                      <td className="time">{relTime(r.createdAt)}</td>
                      <td className="mult">{showMult ? `${Number.isInteger(r.multiplier) ? r.multiplier : r.multiplier.toFixed(2)}×` : '—'}</td>
                      <td className={'res ' + (r.net > 0 ? 'win' : r.net < 0 ? 'loss' : '')}>
                        {r.net > 0 ? '+' : r.net < 0 ? '−' : ''}{Math.abs(r.net).toLocaleString()}<small> coins</small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <div className="act-foot">
              <span>SHOWING {activity.length} OF {data.gamesPlayed.toLocaleString()} ROUNDS</span>
            </div>
          </>
        )}
      </div>

      {editing && (
        <EditProfileModal
          initial={{ username: data.username, avatarColor: data.avatarColor, avatarImage: data.avatarImage }}
          onClose={() => setEditing(false)}
          onSaved={(p) => {
            setEditing(false);
            updateLocalProfile(p);
            const renamed = p.username !== data.username;
            setData((prev) => (prev ? { ...prev, username: p.username, avatarColor: p.avatarColor, avatarImage: p.avatarImage } : prev));
            if (renamed) navigate(`/profile/${p.username}`, { replace: true });
          }}
        />
      )}
    </AppShell>
  );
}
