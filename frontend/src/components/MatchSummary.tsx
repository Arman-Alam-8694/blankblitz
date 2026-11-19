import type { RoomView } from '@blankblitz/shared';
import { buildScorecard, copyText } from '../lib/scorecard';
import { request } from '../lib/socket';
import { act, toast } from '../lib/store';
import { teamOf } from './common';

export function MatchSummary({ view }: { view: RoomView }) {
  const ranked = [...view.teams].sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const tie = ranked.length > 1 && ranked[1]?.score === top?.score;
  const isHost = view.hostId === view.youId;

  const copy = async () => {
    if (await copyText(buildScorecard(view))) toast('Scorecard copied — paste it in WhatsApp/Discord!', 'info');
  };

  return (
    <div className="card summary">
      <h2>{tie ? '🤝 It’s a draw!' : `🏆 ${top?.emoji} ${top?.name} wins!`}</h2>
      <table className="score-table">
        <thead>
          <tr>
            <th>Round</th>
            {view.teams.map((t) => (
              <th key={t.id} style={{ color: t.color }}>
                {t.emoji} {t.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.history.map((r) => (
            <tr key={r.round}>
              <td>R{r.round}</td>
              {view.teams.map((t) => {
                const res = r.teams.find((x) => x.teamId === t.id);
                return (
                  <td key={t.id}>
                    {res ? `${'✅'.repeat(res.wordsSolved)}${'❌'.repeat(res.wordsTotal - res.wordsSolved)} +${res.points}` : '—'}
                    <div className="muted small">{res?.words.join(', ')}</div>
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="total">
            <td>Total</td>
            {view.teams.map((t) => (
              <td key={t.id}>
                <b>{teamOf(view, t.id)?.score}</b>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <div className="row">
        <button className="btn btn-accent" onClick={copy}>
          📋 Copy scorecard
        </button>
        {isHost ? (
          <button className="btn btn-primary" onClick={() => act(() => request('game:lobby'))}>
            Back to lobby
          </button>
        ) : (
          <span className="muted">Waiting for host…</span>
        )}
      </div>
    </div>
  );
}
