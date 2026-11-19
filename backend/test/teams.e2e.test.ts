/**
 * Multi-human scenario: Spotlight + Relay shot-clock with four real clients.
 * Covers input control, ghost previews, spectator secrecy and team votes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AckResponse, ClientToServerEvents, GhostPreview, JoinResult, RoomView, ServerToClientEvents } from '@blankblitz/shared';
import { loadConfig } from '../src/config';
import { startServer, type RunningServer } from '../src/server';

type Client = Socket<ServerToClientEvents, ClientToServerEvents> & { last?: RoomView };

let server: RunningServer;
let url: string;
beforeAll(async () => {
  server = await startServer(loadConfig({ NODE_ENV: 'test', PORT: '0', HOST: '127.0.0.1', PAUSE_SCALE: '0', LOG_LEVEL: 'error' }));
  url = `http://127.0.0.1:${server.port}`;
});
afterAll(() => server.close());

function client(): Promise<Client> {
  return new Promise((resolve, reject) => {
    const s: Client = connect(url, { transports: ['websocket'], forceNew: true });
    s.on('room:state', (v) => (s.last = v));
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}
function call<T>(fn: (ack: (r: AckResponse<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => fn((r) => (r.ok ? resolve(r.data) : reject(new Error(r.error)))));
}
async function until(s: Client, pred: (v: RoomView) => boolean, ms = 5000): Promise<RoomView> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (s.last && pred(s.last)) return s.last;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('condition not met');
}

describe('spotlight + relay with four humans', () => {
  it('enforces relay control, ghosts, secrecy and votes', async () => {
    const [host, p2, p3, p4] = await Promise.all([client(), client(), client(), client()]);
    const h = await call<JoinResult>((a) =>
      host!.emit('room:create', {
        nickname: 'Host',
        settings: { mode: 'spotlight', inputControl: 'relay', botLevel: 'off', totalRounds: 1, shotClockSec: 15, wordLength: 5 },
      }, a),
    );
    const ids: Record<string, string> = { Host: h.playerId };
    for (const [s, name] of [[p2, 'Bea'], [p3, 'Cal'], [p4, 'Dee']] as const) {
      ids[name] = (await call<JoinResult>((a) => s!.emit('room:join', { code: h.code, nickname: name, key: h.roomKey ?? undefined }, a))).playerId;
    }
    const lobby = await until(host!, (v) => v.players.length === 4);
    const teamOf = (id: string) => lobby.players.find((p) => p.id === id)!.teamId;
    expect(teamOf(ids.Host!)).toBe(teamOf(ids.Cal!));
    expect(teamOf(ids.Bea!)).toBe(teamOf(ids.Dee!));

    await call((a) => host!.emit('game:start', a));
    await until(host!, (v) => v.phase === 'SELECTING');
    const words = ['APPLE', 'MANGO', 'GRAPE', 'LEMON'];
    for (const [i, s] of [host, p2, p3, p4].entries()) {
      const v = await until(s!, (x) => x.phase !== 'LOBBY');
      if (v.phase !== 'SELECTING') break; // all slots locked already -> play started
      const mine = v.selection?.slots.find((sl) => sl.assignedTo === v.youId);
      if (mine) await call((a) => s!.emit('select:word', { slotIndex: mine.slotIndex, word: words[i]! }, a));
    }
    const playing = await until(host!, (v) => v.phase === 'PLAYING' && v.activeTeamId !== null);
    const blue = teamOf(ids.Host!);
    expect(playing.activeTeamId).toBe(blue);
    const board = playing.boards.find((b) => b.teamId === blue)!;
    expect(board.relay?.activePlayerId).toBe(ids.Host);

    // Cal (not the shooter) cannot guess, but his ghost preview reaches Host.
    await expect(call((a) => p3!.emit('play:guess', { slot: 0, letter: 'E' }, a))).rejects.toThrow(/input control/);
    const ghost = new Promise<GhostPreview>((r) => host!.once('play:ghost', r));
    p3!.emit('play:ghost', { slot: 0, letter: 'E' });
    expect((await ghost).letter).toBe('E');

    // Spectating Red sees the live board but never unrevealed letters.
    const redView = await until(p2!, (v) => v.phase === 'PLAYING');
    const spect = redView.boards.find((b) => b.teamId === blue)!;
    expect(spect.detailed).toBe(true);
    expect(spect.slots[0]!.letters!.every((l) => l === null)).toBe(true);

    // Host shoots -> control passes to Cal.
    await call((a) => host!.emit('play:guess', { slot: 0, letter: 'E' }, a));
    await until(host!, (v) => v.boards.find((b) => b.teamId === blue)?.relay?.activePlayerId === ids.Cal);

    // Host votes to revoke Cal: the only other eligible voter is Host -> passes, relay skips Cal.
    await call((a) => host!.emit('vote:start', { type: 'revoke', targetId: ids.Cal! }, a));
    const after = await until(host!, (v) => v.players.find((p) => p.id === ids.Cal)?.revoked === true);
    expect(after.boards.find((b) => b.teamId === blue)?.relay?.activePlayerId).toBe(ids.Host);

    // Lobby chat is closed mid-round, team chat works.
    await expect(call((a) => p2!.emit('chat:send', { channel: 'lobby', text: 'hi' }, a))).rejects.toThrow();
    await call((a) => p2!.emit('chat:send', { channel: 'team', text: 'go team' }, a));

    for (const s of [host, p2, p3, p4]) s!.disconnect();
  });
});
