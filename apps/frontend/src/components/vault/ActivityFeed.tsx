import { useEffect, useState } from 'react';
import { gameIcons } from './icons';
import { apiClient } from '../../api/client';

interface RawActivity {
  id: number;
  gameType: string;
  betAmount: number;
  outcome: string;
  profit: number;
  net: number;
  multiplier: number;
  balanceAfter: number;
  createdAt: string;
}

const GAME_LABEL: Record<string, string> = {
  roulette: 'Roulette',
  plinko: 'Plinko',
  mines: 'Mines',
  blackjack: 'Blackjack',
  flip: 'Coin Flip',
};

const ROULETTE_RED = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

// Turn a raw game_logs outcome into a human description. Only the data the
// backend actually stores is used — no fabricated bet details.
function describe(row: RawActivity): string {
  const { gameType, outcome } = row;
  switch (gameType) {
    case 'roulette': {
      const pocket = Number(outcome);
      if (Number.isNaN(pocket)) return 'Spin settled';
      const color = pocket === 0 ? 'green' : ROULETTE_RED.has(pocket) ? 'red' : 'black';
      return `Landed ${pocket} ${color}`;
    }
    case 'plinko': {
      const m = /^bucket_(\d+)$/.exec(outcome);
      return m ? `Ball into slot ${m[1]}` : 'Ball dropped';
    }
    case 'mines': {
      if (outcome === 'exploded') return 'Hit a mine';
      const m = /^cashout_(\d+)$/.exec(outcome);
      if (m) {
        const n = Number(m[1]);
        return `Cashed out · ${n} gem${n === 1 ? '' : 's'}`;
      }
      return 'Round settled';
    }
    case 'flip': {
      // outcome is stored as `${call}=${result}` (e.g. "heads=tails").
      const m = /^(heads|tails)=(heads|tails)$/.exec(outcome);
      return m ? `Landed ${m[2]}` : 'Coin flipped';
    }
    case 'blackjack':
      switch (outcome) {
        case 'player_blackjack': return 'Blackjack!';
        case 'player_win': return 'Won the hand';
        case 'dealer_bust': return 'Dealer busted';
        case 'push': return 'Push';
        case 'player_bust': return 'Busted';
        case 'dealer_win': return 'Dealer won';
        default: return 'Hand settled';
      }
    default:
      return outcome;
  }
}

// Show the gross return multiple only when something was credited (profit > 0).
function multiplierLabel(row: RawActivity): string {
  if (row.profit <= 0 || row.betAmount <= 0) return '';
  const m = row.multiplier;
  return (Number.isInteger(m) ? m.toFixed(1) : m.toFixed(2).replace(/0$/, '')) + '×';
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 45) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface Props {
  /** Whose activity to show. When absent, renders the empty state. */
  username?: string | null;
  limit?: number;
  /** Bump this to force a refetch (e.g. after the viewer places a bet). */
  refreshKey?: number;
}

export function ActivityFeed({ username, limit = 8, refreshKey = 0 }: Props) {
  const [rows, setRows] = useState<RawActivity[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!username) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<{ activity: RawActivity[] }>(
        `/profile/${encodeURIComponent(username)}/activity?limit=${limit}`,
      )
      .then((res) => {
        if (!cancelled) setRows(res.data.activity);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [username, limit, refreshKey]);

  if (loading) {
    return <div className="activity-empty">Loading activity…</div>;
  }
  if (!rows || rows.length === 0) {
    return (
      <div className="activity-empty">
        No recent activity yet — play a game and your bets will show up here.
      </div>
    );
  }

  return (
    <div className="activity">
      {rows.map((row) => {
        const Icon = gameIcons[row.gameType];
        const label = GAME_LABEL[row.gameType] ?? row.gameType;
        const net = row.net;
        const resClass = net > 0 ? 'win' : net < 0 ? 'loss' : 'flat';
        const resText =
          (net > 0 ? '+' : net < 0 ? '−' : '') + Math.abs(net).toLocaleString('en-US') + ' V';
        return (
          <div className="activity-row" key={row.id}>
            <div className="ico">{Icon && <Icon size={14} />}</div>
            <div className="time">{relativeTime(row.createdAt)}</div>
            <div className="desc">
              <strong>{label}</strong> — {describe(row)}
            </div>
            <div className="mult">{multiplierLabel(row)}</div>
            <div className={'res ' + resClass}>{resText}</div>
          </div>
        );
      })}
    </div>
  );
}
