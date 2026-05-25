import { Link } from 'react-router-dom';
import { gameArt } from './gameArt';

export interface GameCardData {
  id: string;
  name: string;
  route: string;
  /** Short category descriptor (Classic, Live, Fast, Risk, …). */
  tag: string;
  /** Live games: real return-to-player. */
  rtp?: string;
  /** Coming-soon games: estimated ship window. */
  eta?: string;
}

// Dashboard game tile (Claude Design handoff — VCasino.html). Live tiles link to
// the game with a pulsing LIVE badge + players/RTP stats; "soon" tiles show a SOON
// ribbon + ETA and aren't clickable.
export function VaultGameCard({ game, soon = false }: { game: GameCardData; soon?: boolean }) {
  const Art = gameArt[game.id];
  const inner = (
    <>
      <div className={`banner banner-${game.id}`}>
        {Art && <div className="icon-art"><Art /></div>}
        {soon && <div className="soon-ribbon">SOON</div>}
      </div>
      <div className="meta">
        <div className="name">
          <span>{game.name}</span>
          {soon ? <span className="soon-label">◆ SOON</span> : <span className="live">LIVE</span>}
        </div>
        <div className="stats">
          {soon ? (
            <>
              <span>{game.tag}</span>
              <span>ETA <strong>{game.eta}</strong></span>
            </>
          ) : (
            <>
              <span>{game.tag}</span>
              <span>RTP <strong>{game.rtp}</strong></span>
            </>
          )}
        </div>
      </div>
    </>
  );

  if (soon) {
    return <div className="game-card soon">{inner}</div>;
  }
  return (
    <Link to={game.route} className="game-card">
      {inner}
    </Link>
  );
}
