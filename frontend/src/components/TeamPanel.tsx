import { useState } from 'react';
import type { PlayerView, RoomView, VoteType, VoteView } from '@blankblitz/shared';
import { request } from '../lib/socket';
import { act } from '../lib/store';
import { Avatar } from './Avatar';
import { Countdown, PlayerBadges, me, playerName, teamOf } from './common';

const VOTE_LABEL: Record<VoteType, [string, string]> = {
  revoke: ['Revoke input', 'Restore input'],
  mute: ['Team mute', 'Unmute'],
  kick: ['Vote kick', 'Vote kick'],
};

export function TeamPanel({ view }: { view: RoomView }) {
  const you = me(view);
  const [open, setOpen] = useState<string | null>(null);
  if (!you || view.phase === 'LOBBY') return null;
  const team = teamOf(view, you.teamId);
  const mates = view.players.filter((p) => p.teamId === you.teamId);
  const isCaptain = team?.captainId === you.id;

  return (
    <div className="card team-panel" style={{ borderTopColor: team?.color }}>
      <h3>
        {team?.emoji} Your team
      </h3>
      <ul className="player-list">
        {mates.map((p) => (
          // Hover (or keyboard focus) reveals the actions; on touch screens tap ⋯ instead.
          <li key={p.id} className={`player-row ${open === p.id ? 'open' : ''}`} onMouseLeave={() => open === p.id && setOpen(null)}>
            <Avatar avatar={p.avatar} picture={p.picture} isBot={p.isBot} name={p.name} size={26} />
            <span className="pname">{p.name}</span>
            <PlayerBadges view={view} player={p} />
            {p.id !== you.id && (
              <>
                <button
                  className="btn btn-tiny more-btn"
                  onClick={() => setOpen(open === p.id ? null : p.id)}
                  aria-label={`Actions for ${p.name}`}
                  aria-expanded={open === p.id}
                >
                  ⋯
                </button>
                <PlayerActions
                  view={view}
                  target={p}
                  canCaptain={view.settings.inputControl === 'captain' && (isCaptain || view.hostId === you.id)}
                  done={() => setOpen(null)}
                />
              </>
            )}
          </li>
        ))}
      </ul>
      {view.votes.map((v) => (
        <VoteCard key={v.id} view={view} vote={v} />
      ))}
    </div>
  );
}

function PlayerActions({ view, target, canCaptain, done }: { view: RoomView; target: PlayerView; canCaptain: boolean; done: () => void }) {
  const start = async (type: VoteType) => {
    await act(() => request('vote:start', { type, targetId: target.id }));
    done();
  };
  return (
    <div className="actions-menu" role="menu" aria-label={`Actions for ${target.name}`}>
      {canCaptain && (
        <button
          className="btn btn-tiny"
          onClick={async () => {
            await act(() => request('team:captain', { playerId: target.id }));
            done();
          }}
        >
          Make captain
        </button>
      )}
      <button className="btn btn-tiny" onClick={() => start('revoke')}>
        {VOTE_LABEL.revoke[target.revoked ? 1 : 0]}
      </button>
      {view.settings.voice && (
        <button className="btn btn-tiny" onClick={() => start('mute')}>
          {VOTE_LABEL.mute[target.teamMuted ? 1 : 0]}
        </button>
      )}
      <button className="btn btn-tiny btn-danger" onClick={() => start('kick')}>
        Vote kick
      </button>
    </div>
  );
}

function VoteCard({ view, vote }: { view: RoomView; vote: VoteView }) {
  const label = VOTE_LABEL[vote.type][vote.reverse ? 1 : 0];
  const isTarget = vote.targetId === view.youId;
  return (
    <div className="vote">
      <div className="small">
        🗳 {label}: <b>{playerName(view, vote.targetId)}</b> ({vote.yes}/{vote.needed} yes) <Countdown deadline={vote.expiresAt} warnAt={5} />
      </div>
      {!vote.voted && !isTarget && (
        <div className="row">
          <button className="btn btn-tiny btn-primary" onClick={() => act(() => request('vote:cast', { voteId: vote.id, yes: true }))}>
            Yes
          </button>
          <button className="btn btn-tiny" onClick={() => act(() => request('vote:cast', { voteId: vote.id, yes: false }))}>
            No
          </button>
        </div>
      )}
    </div>
  );
}
