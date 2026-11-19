/**
 * End-to-end: boots the real server and plays a full match over Socket.IO
 * (one human client vs medium bots), asserting secrecy and phase flow.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AckResponse, ClientToServerEvents, JoinResult, RoomView, ServerToClientEvents } from '@blankblitz/shared';
import { loadConfig } from '../src/config';
import { startServer, type RunningServer } from '../src/server';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: RunningServer;
let url: string;

beforeAll(async () => {
  server = await startServer(
    loadConfig({ NODE_ENV: 'test', PORT: '0', HOST: '127.0.0.1', BOT_SPEED: '20', PAUSE_SCALE: '0.05', LOG_LEVEL: 'error' }),
  );
  url = `http://127.0.0.1:${server.port}`;
});
afterAll(async () => {
  await server.close();
});

function client(): Promise<Client> {
  return new Promise((resolve, reject) => {
    const s: Client = connect(url, { transports: ['websocket'], forceNew: true });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

function call<T>(fn: (ack: (r: AckResponse<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    fn((r) => (r.ok ? resolve(r.data) : reject(new Error(r.error))));
  });
}

function waitFor(s: Client, pred: (v: RoomView) => boolean, timeoutMs = 20_000): Promise<RoomView> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timed out waiting for state')), timeoutMs);
    const handler = (v: RoomView) => {
      if (pred(v)) {
        clearTimeout(t);
        s.off('room:state', handler);
        resolve(v);
      }
    };
    s.on('room:state', handler);
  });
}

describe('full match', () => {
  it('rejects invalid input', async () => {
    const s = await client();
    await expect(call<JoinResult>((ack) => s.emit('room:create', { nickname: 'x' }, ack))).rejects.toThrow();
    await expect(
      call<JoinResult>((ack) => s.emit('room:join', { code: 'ZZZZZZZZZZ', nickname: 'Valid' }, ack)),
    ).rejects.toThrow(/not found/);
    s.disconnect();
  });

  it('plays a 1v1 blitz match against a medium bot to the end', async () => {
    const s = await client();
    const joined = await call<JoinResult>((ack) =>
      s.emit(
        'room:create',
        { nickname: 'Tester', settings: { teamSize: 1, totalRounds: 1, botLevel: 'medium', wordLength: 5 } },
        ack,
      ),
    );
    expect(joined.code).toMatch(/^[A-Z2-9]{10}$/);

    const selecting = waitFor(s, (v) => v.phase === 'SELECTING');
    await call((ack) => s.emit('game:start', ack));
    const sel = await selecting;
    expect(sel.players.some((p) => p.isBot)).toBe(true);

    await expect(call((ack) => s.emit('select:word', { slotIndex: 0, word: 'QZXVB' }, ack))).rejects.toThrow(
      /dictionary/,
    );
    const playing = waitFor(s, (v) => v.phase === 'PLAYING');
    await call((ack) => s.emit('select:word', { slotIndex: 0, word: 'APPLE', category: 'Fruit' }, ack));
    let view = await playing;

    // Secrecy: the opponent's board must carry counters only, and our own board no unrevealed letters.
    const opponent = view.boards.find((b) => b.teamId !== view.players.find((p) => p.id === joined.playerId)?.teamId);
    expect(opponent?.detailed).toBe(false);
    expect(opponent?.slots[0]?.letters).toBeUndefined();

    // Track the latest snapshot (avoids listener races), then guess until our board ends.
    let latest = view;
    s.on('room:state', (v) => (latest = v));
    const me = view.players.find((p) => p.id === joined.playerId)!;
    const gameOver = waitFor(s, (v) => v.phase === 'GAME_END', 25_000);
    await new Promise((r) => setTimeout(r, 300));
    for (const letter of 'EARIOTNSLCUDPMHGBFYWKVXZJQ') {
      const own = latest.boards.find((b) => b.teamId === me.teamId);
      if (latest.phase !== 'PLAYING' || own?.status !== 'active') break;
      await call((ack) => s.emit('play:guess', { slot: 0, letter }, ack)).catch(() => undefined);
    }

    const end = await gameOver;
    expect(end.history).toHaveLength(1);
    expect(end.history[0]?.teams).toHaveLength(2);
    expect(end.boards.every((b) => b.slots.every((sl) => sl.letters?.every((l) => l !== null)))).toBe(true);

    await call((ack) => s.emit('game:lobby', ack));
    s.disconnect();
  });

  it('resumes a seat with the session token after reconnecting', async () => {
    const a = await client();
    const joined = await call<JoinResult>((ack) => a.emit('room:create', { nickname: 'Host' }, ack));
    a.disconnect();
    const b = await client();
    const again = await call<JoinResult>((ack) =>
      b.emit('room:join', { code: joined.code, nickname: 'Host', sessionToken: joined.sessionToken }, ack),
    );
    expect(again.playerId).toBe(joined.playerId);
    b.disconnect();
  });

  it('quick match seeds a room and a second player joins it', async () => {
    const a = await client();
    const b = await client();
    const ra = await call<JoinResult>((ack) => a.emit('room:quick', { nickname: 'Alpha' }, ack));
    const rb = await call<JoinResult>((ack) => b.emit('room:quick', { nickname: 'Bravo' }, ack));
    expect(rb.code).toBe(ra.code);
    a.disconnect();
    b.disconnect();
  });
});
