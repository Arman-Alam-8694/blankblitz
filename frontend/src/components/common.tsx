import type { PlayerView, RoomView, TeamView } from '@blankblitz/shared';
import { secondsLeft, useNow } from '../lib/time';
import { VoiceBadge } from './Voice';

export function me(view: RoomView): PlayerView | undefined {
  return view.players.find((p) => p.id === view.youId);
}

export function teamOf(view: RoomView, teamId: number): TeamView | undefined {
  return view.teams.find((t) => t.id === teamId);
}

export function playerName(view: RoomView, id: string | null | undefined): string {
  if (!id) return '—';
  return view.players.find((p) => p.id === id)?.name ?? 'someone';
}

export function Countdown({ deadline, warnAt = 10 }: { deadline: number | null; warnAt?: number }) {
  const now = useNow();
  const s = secondsLeft(deadline, now);
  return <span className={`timer ${s <= warnAt ? 'timer-warn' : ''}`}>⏱ {s}s</span>;
}

export function PhaseTimer({ view }: { view: RoomView }) {
  if (!view.phaseEndsAt || view.phase === 'LOBBY' || view.phase === 'GAME_END') return null;
  return <Countdown deadline={view.phaseEndsAt} />;
}

export function PlayerBadges({ view, player }: { view: RoomView; player: PlayerView }) {
  const team = teamOf(view, player.teamId);
  return (
    <>
      {player.isHost && <span className="badge" title="Host">👑</span>}
      {player.isBot && <span className="badge badge-bot">BOT</span>}
      {team?.captainId === player.id && <span className="badge" title="Captain">©</span>}
      {player.id === view.youId && <span className="badge badge-you">you</span>}
      {!player.connected && <span className="badge badge-off">offline</span>}
      {player.revoked && <span className="badge badge-off" title="Input revoked">⛔</span>}
      {player.teamMuted && view.settings.voice && <span className="badge" title="Team-muted by vote">🚫🎙️</span>}
      {view.settings.voice && <VoiceBadge view={view} player={player} />}
    </>
  );
}
