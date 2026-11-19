import { useState, type ReactNode } from 'react';
import { LANGUAGES, MAX_TEAMS, MAX_TEAM_SIZE, SELECTION_TIME_OPTIONS, type RoomSettings, type RoomView } from '@blankblitz/shared';
import { copyText } from '../lib/scorecard';
import { roomUrl } from '../lib/router';
import { request } from '../lib/socket';
import { act, toast } from '../lib/store';
import { Avatar } from './Avatar';
import { PlayerBadges, me } from './common';

type Opt<T> = { value: T; label: string };

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const numOpts = (vals: number[], suffix = ''): Opt<number>[] => vals.map((v) => ({ value: v, label: `${v}${suffix}` }));

export function Lobby({ view }: { view: RoomView }) {
  const isHost = view.hostId === view.youId;
  const you = me(view);
  const [starting, setStarting] = useState(false);
  const s = view.settings;

  const update = (patch: Partial<RoomSettings>) => act(() => request('lobby:settings', patch));
  const start = async () => {
    setStarting(true);
    await act(() => request('game:start'));
    setStarting(false);
  };
  const share = async () => {
    if (await copyText(roomUrl(view.code, view.roomKey))) {
      toast(view.roomKey ? 'Invite link copied — it includes the password' : 'Invite link copied!', 'info');
    }
  };

  return (
    <div className="lobby">
      <div className="card share">
        <div>
          <div className="muted small">
            Room code · {s.visibility === 'public' ? '🌍 Public (listed)' : '🔒 Private (code/link only)'}
          </div>
          <div className="big-code">{view.code}</div>
          {view.roomKey && (
            <div className="small">
              Password: <b className="mono">{view.roomKey}</b>{' '}
              <span className="muted">(not needed with the invite link)</span>
            </div>
          )}
        </div>
        <button className="btn" onClick={share}>
          Copy invite link
        </button>
      </div>

      <div className="teams-grid">
        {view.teams.map((team) => {
          const members = view.players.filter((p) => p.teamId === team.id);
          const full = members.length >= s.teamSize;
          return (
            <div key={team.id} className="card team-card" style={{ borderTopColor: team.color }}>
              <h3>
                {team.emoji} {team.name}{' '}
                <span className="muted small">
                  {members.length}/{s.teamSize}
                </span>
              </h3>
              <ul className="player-list">
                {members.map((p) => (
                  <li key={p.id}>
                    <Avatar avatar={p.avatar} picture={p.picture} isBot={p.isBot} name={p.name} size={26} />
                    <span className="pname">{p.name}</span>
                    <PlayerBadges view={view} player={p} />
                    {isHost && p.id !== view.youId && (
                      <button
                        className="btn btn-tiny btn-danger"
                        onClick={() => act(() => request('lobby:kick', { playerId: p.id }))}
                      >
                        Kick
                      </button>
                    )}
                  </li>
                ))}
                {Array.from({ length: Math.max(0, s.teamSize - members.length) }, (_, i) => (
                  <li key={`empty-${i}`} className="muted">
                    {s.botLevel === 'off' ? 'Empty seat' : 'Bot will fill'}
                  </li>
                ))}
              </ul>
              {you && you.teamId !== team.id && !full && (
                <button className="btn btn-small" onClick={() => act(() => request('lobby:team', { teamId: team.id }))}>
                  Join {team.name}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="card settings">
        <h3>Match settings {!isHost && <span className="muted small">(host only)</span>}</h3>
        <div className="settings-grid">
          <Select label="Room type" disabled={!isHost} value={s.visibility} onChange={(visibility) => update({ visibility })}
            options={[{ value: 'private', label: '🔒 Private — code/link only' }, { value: 'public', label: '🌍 Public — listed for anyone' }]} />
          <Select label="Chat language" disabled={!isHost} value={s.language} onChange={(language) => update({ language })}
            options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))} />
          <Select label="Mode" disabled={!isHost} value={s.mode} onChange={(mode) => update({ mode })}
            options={[{ value: 'blitz', label: 'Blitz — simultaneous race' }, { value: 'spotlight', label: 'Spotlight — turn-based' }]} />
          <Select label="Teams" disabled={!isHost} value={s.teamCount} onChange={(teamCount) => update({ teamCount })}
            options={numOpts(range(2, MAX_TEAMS), ' teams')} />
          <Select label="Players per team" disabled={!isHost} value={s.teamSize} onChange={(teamSize) => update({ teamSize })}
            options={range(1, MAX_TEAM_SIZE).map((v) => ({ value: v, label: `${v} (${Array(s.teamCount).fill(v).join('v')})` }))} />
          <Select label="Rounds" disabled={!isHost} value={s.totalRounds} onChange={(totalRounds) => update({ totalRounds })}
            options={[{ value: 'auto' as const, label: 'Auto (5, or 3 for multi-word)' }, ...numOpts(range(1, 10))]} />
          <Select label="Words per round" disabled={!isHost} value={s.wordsPerRound} onChange={(wordsPerRound) => update({ wordsPerRound })}
            options={[
              { value: 1 as const, label: '1 word' },
              { value: 3 as const, label: '3 words' },
              { value: 4 as const, label: '4 words' },
              { value: 'perPlayer' as const, label: 'One per player' },
            ]} />
          <Select label="Word length" disabled={!isHost} value={s.wordLength} onChange={(wordLength) => update({ wordLength })}
            options={[{ value: 'any' as const, label: 'Any (4–8)' }, ...numOpts(range(4, 8), ' letters')]} />
          <Select label="Random words" disabled={!isHost} value={s.wordDifficulty} onChange={(wordDifficulty) => update({ wordDifficulty })}
            options={[
              { value: 'easy', label: '🟢 Easy — everyday words' },
              { value: 'medium', label: '🟡 Medium — less common' },
              { value: 'hard', label: '🔴 Hard — rare & tricky' },
              { value: 'mixed', label: '🎲 Mixed' },
            ]} />
          <Select label="Time to pick words" disabled={!isHost} value={s.selectionTimeSec} onChange={(selectionTimeSec) => update({ selectionTimeSec })}
            options={SELECTION_TIME_OPTIONS.map((v) => ({ value: v as number, label: `${v}s (starts early when all locked)` }))} />
          <Select label="Attempts" disabled={!isHost} value={s.attempts} onChange={(attempts) => update({ attempts })}
            options={[{ value: 'auto' as const, label: 'Auto (5 → 8)' }, ...numOpts(range(1, 20))]} />
          <Select label="Round timer" disabled={!isHost} value={s.roundTimeSec} onChange={(roundTimeSec) => update({ roundTimeSec })}
            options={[{ value: 'auto' as const, label: 'Auto (45s → 90s)' }, ...numOpts([15, 30, 45, 60, 75, 90, 120, 180, 300], 's')]} />
          <Select label="Team input" disabled={!isHost} value={s.inputControl} onChange={(inputControl) => update({ inputControl })}
            options={[
              { value: 'open', label: 'Open (revokable)' },
              { value: 'captain', label: 'Captain only' },
              { value: 'relay', label: 'Relay shot-clock' },
            ]} />
          {s.inputControl === 'relay' && (
            <Select label="Shot-clock" disabled={!isHost} value={s.shotClockSec} onChange={(shotClockSec) => update({ shotClockSec })}
              options={numOpts([3, 5, 8, 10, 15], 's / turn')} />
          )}
          <Select label="Bot backfill" disabled={!isHost} value={s.botLevel} onChange={(botLevel) => update({ botLevel })}
            options={[{ value: 'off', label: 'Off' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }]} />
          <Select label="In-game voice" disabled={!isHost} value={s.voice} onChange={(voice) => update({ voice })}
            options={[{ value: true, label: 'On (built-in voice)' }, { value: false, label: 'Off (Discord / in person)' }]} />
        </div>
      </div>

      <div className="lobby-footer">
        {isHost ? (
          <button className="btn btn-primary btn-big" disabled={starting} onClick={start}>
            Start match
          </button>
        ) : (
          <p className="muted">Waiting for the host to start…</p>
        )}
      </div>
    </div>
  );
}

function Select<T extends string | number | boolean>(props: {
  label: ReactNode;
  value: T;
  options: Opt<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const idx = props.options.findIndex((o) => o.value === props.value);
  return (
    <label className="field">
      <span>{props.label}</span>
      <select
        value={idx}
        disabled={props.disabled}
        onChange={(e) => {
          const opt = props.options[Number(e.target.value)];
          if (opt) props.onChange(opt.value);
        }}
      >
        {props.options.map((o, i) => (
          <option key={String(o.value)} value={i}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
