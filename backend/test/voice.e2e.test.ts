/**
 * Voice: signaling routing, session pinning, relay channel enforcement and TURN credentials.
 */
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type {
  AckResponse,
  ClientToServerEvents,
  JoinResult,
  RoomView,
  ServerToClientEvents,
  VoiceFrameIn,
  VoiceJoinResult,
  VoiceSignal,
} from '@blankblitz/shared';
import { loadConfig } from '../src/config';
import { startServer, type RunningServer } from '../src/server';
import { iceServersFor } from '../src/voice/ice';

type Client = Socket<ServerToClientEvents, ClientToServerEvents> & { last?: RoomView; frames: VoiceFrameIn[]; signals: VoiceSignal[] };

let server: RunningServer;
let url: string;
beforeAll(async () => {
  server = await startServer(loadConfig({ NODE_ENV: 'test', PORT: '0', HOST: '127.0.0.1', LOG_LEVEL: 'error' }));
  url = `http://127.0.0.1:${server.port}`;
});
afterAll(() => server.close());

function client(): Promise<Client> {
  return new Promise((resolve, reject) => {
    const s = connect(url, { transports: ['websocket'], forceNew: true }) as Client;
    s.frames = [];
    s.signals = [];
    s.on('room:state', (v) => (s.last = v));
    s.on('voice:frame', (f) => s.frames.push(f));
    s.on('voice:signal', (x) => s.signals.push(x));
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}
const call = <T,>(fn: (ack: (r: AckResponse<T>) => void) => void) =>
  new Promise<T>((resolve, reject) => fn((r) => (r.ok ? resolve(r.data) : reject(new Error(r.error)))));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(s: Client, pred: (v: RoomView) => boolean, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (s.last && pred(s.last)) return s.last;
    await sleep(20);
  }
  throw new Error('condition not met');
}

describe('voice', () => {
  it('refuses voice when the room has it disabled', async () => {
    const a = await client();
    await call<JoinResult>((k) => a.emit('room:create', { nickname: 'Solo', settings: { voice: false } }, k));
    await expect(call((k) => a.emit('voice:join', { mic: true }, k))).rejects.toThrow(/off/);
    a.disconnect();
  });

  it('routes signals by session and enforces relay channels', async () => {
    const [host, red, blue2] = await Promise.all([client(), client(), client()]);
    const h = await call<JoinResult>((k) =>
      host.emit('room:create', { nickname: 'Host', settings: { voice: true, botLevel: 'off', teamSize: 2 } }, k),
    );
    const r = await call<JoinResult>((k) => red.emit('room:join', { code: h.code, nickname: 'Red', key: h.roomKey ?? undefined }, k));
    const b = await call<JoinResult>((k) => blue2.emit('room:join', { code: h.code, nickname: 'Blue2', key: h.roomKey ?? undefined }, k));

    const sessions: Record<string, VoiceJoinResult> = {};
    for (const [s, id] of [[host, h.playerId], [red, r.playerId], [blue2, b.playerId]] as const) {
      sessions[id] = await call<VoiceJoinResult>((k) => s.emit('voice:join', { mic: true }, k));
      expect(sessions[id]!.iceServers.length).toBeGreaterThan(0);
    }
    const lobby = await until(host, (v) => v.players.every((p) => p.voice !== null));
    const team = (id: string) => lobby.players.find((p) => p.id === id)!.teamId;
    expect(team(h.playerId)).toBe(team(b.playerId));
    expect(team(h.playerId)).not.toBe(team(r.playerId));

    // Signaling: correct session is delivered with the sender's session; stale session is dropped.
    host.emit('voice:signal', { to: b.playerId, toSession: sessions[b.playerId]!.session, description: { type: 'offer', sdp: 'v=0' } });
    host.emit('voice:signal', { to: b.playerId, toSession: 'stale-session', description: { type: 'offer', sdp: 'v=0' } });
    await sleep(150);
    expect(blue2.signals).toHaveLength(1);
    expect(blue2.signals[0]).toMatchObject({ from: h.playerId, fromSession: sessions[h.playerId]!.session });

    const frame = (seq: number) => ({ to: [r.playerId, b.playerId], seq, data: new Uint8Array(960).fill(seq) });

    // Lobby voice: everybody hears everybody.
    host.emit('voice:frame', frame(1));
    await sleep(150);
    expect(red.frames.map((f) => f.seq)).toEqual([1]);
    expect(blue2.frames.map((f) => f.seq)).toEqual([1]);
    expect(Buffer.from(blue2.frames[0]!.data).length).toBe(960);

    // During a round audio is team-only, even if a client asks to send to opponents.
    await call((k) => host.emit('game:start', k));
    await until(host, (v) => v.phase === 'SELECTING');
    host.emit('voice:frame', frame(2));
    await sleep(150);
    expect(red.frames.map((f) => f.seq)).toEqual([1]);
    expect(blue2.frames.map((f) => f.seq)).toEqual([1, 2]);

    // Self-mute stops relay at the server too.
    await call((k) => host.emit('voice:mute', { muted: true }, k));
    host.emit('voice:frame', frame(3));
    await sleep(150);
    expect(blue2.frames.map((f) => f.seq)).toEqual([1, 2]);

    // Oversized / malformed frames are ignored.
    await call((k) => host.emit('voice:mute', { muted: false }, k));
    host.emit('voice:frame', { to: [b.playerId], seq: 4, data: new Uint8Array(8000) });
    host.emit('voice:frame', { to: [b.playerId], seq: 5, data: 'nope' as unknown as Uint8Array });
    await sleep(150);
    expect(blue2.frames.map((f) => f.seq)).toEqual([1, 2]);

    // Leaving voice removes presence.
    await call((k) => blue2.emit('voice:leave', k));
    await until(host, (v) => v.players.find((p) => p.id === b.playerId)?.voice === null);

    for (const s of [host, red, blue2]) s.disconnect();
  });

  it('issues time-limited TURN credentials without exposing the secret', () => {
    const cfg = loadConfig({ NODE_ENV: 'test', TURN_URLS: 'turn:turn.example.com:3478', TURN_SECRET: 's3cret', TURN_TTL_SEC: '600' });
    const servers = iceServersFor(cfg, 'player1', 1_000_000);
    const turn = servers.find((s) => s.username)!;
    expect(turn.username).toBe(`${1000 + 600}:player1`);
    expect(turn.credential).toBe(createHmac('sha1', 's3cret').update(turn.username!).digest('base64'));
    expect(JSON.stringify(servers)).not.toContain('s3cret');
  });
});
