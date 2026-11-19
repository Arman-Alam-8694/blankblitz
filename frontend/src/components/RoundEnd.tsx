import type { RoomView } from '@blankblitz/shared';
import { Countdown, teamOf } from './common';

export function RoundEnd({ view }: { view: RoomView }) {
  const result = view.history[view.history.length - 1];
  const last = view.round >= view.totalRounds;
  return (
    <div className="card round-end">
      <div className="row-between">
        <h2>Round {view.round} complete</h2>
        <span className="muted">
          {last ? 'Final results in' : 'Next round in'} <Countdown deadline={view.phaseEndsAt} warnAt={0} />
        </span>
      </div>
      <div className="results">
        {result?.teams.map((t) => {
          const team = teamOf(view, t.teamId);
          return (
            <div key={t.teamId} className="result" style={{ borderLeftColor: team?.color }}>
              <div className="row-between">
                <b>
                  {team?.emoji} {team?.name}
                </b>
                <span className="points">+{t.points}</span>
              </div>
              <div className="revealed">
                {t.words.map((w) => (
                  <span key={w} className="chip chip-word">
                    {w}
                  </span>
                ))}
              </div>
              <div className="small muted">
                {t.wordsSolved}/{t.wordsTotal} solved · {t.status === 'solved' ? 'cleared!' : t.status === 'failed' ? 'out of attempts' : 'time up'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
