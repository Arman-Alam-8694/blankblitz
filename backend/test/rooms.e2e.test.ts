/**
 * Room browser, public/private rooms, random join, chat language, avatars and sign-in plumbing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import {
  ROOM_CODE_LENGTH,
  type AckResponse,
  type ClientToServerEvents,
  type JoinResult,
  type RoomSummary,
  type RoomView,
  type ServerToClientEvents,
} from '@blankblitz/shared';
import { ProfileTokens, safePictureUrl } from '../src/auth/profileToken';
import { loadConfig } from '../src/config';
import { startServer, type RunningServer } from '../src/server';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: RunningServer;
let url: string;
const SECRET = 'test-secret-0123456789';
const tokens = new ProfileTokens(SECRET, 60_000);
const clients: Client[] = [];

beforeAll(async () => {
  server = await startServer(
    loadConfig({ NODE_ENV: 'test', PORT: '0', HOST: '127.0.0.1', LOG_LEVEL: 'error', AUTH_SECRET: SECRET, MAX_CONNECTIONS_PER_IP: '100', JOIN_BURST_PER_IP: '100' }),
  );
  url = `http://127.0.0.1:${server.port}`;
});
afterAll(async () => {
  for (const c of clients) c.disconnect();
  await server.close();
});

function client(auth?: Record<string, string>): Promise<Client> {
  return new Promise((resolve, reject) => {
    const s: Client = connect(url, { transports: ['websocket'], forceNew: true, auth });
    clients.push(s);
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

function call<T>(fn: (ack: (r: AckResponse<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    fn((r) => (r.ok ? resolve(r.data) : reject(new Error(r.error))));
  });
}

const list = (s: Client, language?: string) =>
  call<RoomSummary[]>((k) => s.emit('rooms:list', language ? { language: language as 'en' } : {}, k));

function latest(s: Client): () => RoomView | null {
  let v: RoomView | null = null;
  s.on('room:state', (x) => (v = x));
  return () => v;
}
const until = async <T>(fn: () => T | null | undefined | false, ms = 3000): Promise<T> => {
  const end = Date.now() + ms;
  for (;;) {
    const r = fn();
    if (r) return r;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((res) => setTimeout(res, 20));
  }
};

describe('rooms', () => {
  it(`uses ${ROOM_CODE_LENGTH}-character room codes`, async () => {
    const s = await client();
    const r = await call<JoinResult>((k) => s.emit('room:create', { nickname: 'Coder' }, k));
    expect(r.code).toHaveLength(10);
    expect(r.code).toMatch(/^[A-Z2-9]+$/);
  });

  it('lists public rooms only, filtered by language', async () => {
    const watcher = await client();
    const priv = await client();
    const pub = await client();
    const pubHi = await client();
    const rPriv = await call<JoinResult>((k) => priv.emit('room:create', { nickname: 'Secret', settings: { visibility: 'private' } }, k));
    const rPub = await call<JoinResult>((k) => pub.emit('room:create', { nickname: 'Open', settings: { visibility: 'public', language: 'en' } }, k));
    const rHi = await call<JoinResult>((k) => pubHi.emit('room:create', { nickname: 'Namaste', settings: { visibility: 'public', language: 'hi' } }, k));

    const all = await list(watcher);
    const codes = all.map((r) => r.code);
    expect(codes).toContain(rPub.code);
    expect(codes).toContain(rHi.code);
    expect(codes).not.toContain(rPriv.code);
    const entry = all.find((r) => r.code === rPub.code)!;
    expect(entry).toMatchObject({ hostName: 'Open', humans: 1, capacity: 4, phase: 'LOBBY', language: 'en' });
    // Summaries never carry player ids or tokens.
    expect(JSON.stringify(all)).not.toMatch(/sessionToken|playerId/);

    const hindi = await list(watcher, 'hi');
    expect(hindi.map((r) => r.code)).toEqual([rHi.code]);
  });

  it('host can switch a room between private and public', async () => {
    const host = await client();
    const watcher = await client();
    const r = await call<JoinResult>((k) => host.emit('room:create', { nickname: 'Toggler', settings: { language: 'fr' } }, k));
    expect((await list(watcher, 'fr')).map((x) => x.code)).not.toContain(r.code);
    await call((k) => host.emit('lobby:settings', { visibility: 'public' }, k));
    expect((await list(watcher, 'fr')).map((x) => x.code)).toContain(r.code);
  });

  it('random join picks the public room closest to full, in the same language', async () => {
    // Room A (de): 3 of 4 seats taken by humans; Room B (de): 1 of 4.
    const a1 = await client();
    const rA = await call<JoinResult>((k) => a1.emit('room:create', { nickname: 'A1', settings: { visibility: 'public', language: 'de' } }, k));
    for (const n of ['A2', 'A3']) {
      const s = await client();
      await call<JoinResult>((k) => s.emit('room:join', { code: rA.code, nickname: n }, k));
    }
    const b1 = await client();
    await call<JoinResult>((k) => b1.emit('room:create', { nickname: 'B1', settings: { visibility: 'public', language: 'de' } }, k));

    const newcomer = await client();
    const joined = await call<JoinResult>((k) => newcomer.emit('room:quick', { nickname: 'Newbie', language: 'de' }, k));
    expect(joined.code).toBe(rA.code);

    // Room A is now full of humans → next random join goes to room B.
    const another = await client();
    const second = await call<JoinResult>((k) => another.emit('room:quick', { nickname: 'Second', language: 'de' }, k));
    expect(second.code).not.toBe(rA.code);

    // No Japanese rooms yet → a new public Japanese room is created.
    const jp = await client();
    const view = latest(jp);
    const rJp = await call<JoinResult>((k) => jp.emit('room:quick', { nickname: 'Kenji', language: 'ja' }, k));
    const v = await until(() => view());
    expect(v.code).toBe(rJp.code);
    expect(v.settings).toMatchObject({ visibility: 'public', language: 'ja' });
  });

  it('shows avatars; Google photo only for verified sign-ins', async () => {
    const pic = 'https://lh3.googleusercontent.com/a/abc123=s96-c';
    const signedIn = await client({ profile: tokens.issue({ sub: 'g-1', name: 'Asha', picture: pic }) });
    const forger = await client({ profile: 'v1.e30.forged' });
    const host = latest(signedIn);
    const r = await call<JoinResult>((k) => signedIn.emit('room:create', { nickname: 'Asha', avatar: 'google' }, k));
    await call<JoinResult>((k) => forger.emit('room:join', { code: r.code, nickname: 'Mallory', avatar: 'google', key: r.roomKey ?? undefined }, k));
    const plain = await client();
    await call<JoinResult>((k) => plain.emit('room:join', { code: r.code, nickname: 'Plain', avatar: 'f3', key: r.roomKey ?? undefined }, k));

    const v = await until(() => (host()?.players.length === 3 ? host() : null));
    const by = (n: string) => v.players.find((p) => p.name === n)!;
    expect(by('Asha')).toMatchObject({ picture: pic, avatar: null });
    expect(by('Mallory')).toMatchObject({ picture: null, avatar: null });
    expect(by('Plain')).toMatchObject({ picture: null, avatar: 'f3' });

    expect(await call((k) => signedIn.emit('auth:me', k))).toEqual({ name: 'Asha', picture: pic });
    expect(await call((k) => forger.emit('auth:me', k))).toBeNull();
    await call((k) => signedIn.emit('auth:signout', k));
    expect(await call((k) => signedIn.emit('auth:me', k))).toBeNull();
  });

  it('rejects bad avatar / language values and Google sign-in when not configured', async () => {
    const s = await client();
    await expect(call((k) => s.emit('room:create', { nickname: 'Bad', avatar: 'x9' as 'm1' }, k))).rejects.toThrow();
    await expect(call((k) => s.emit('rooms:list', { language: 'xx' as 'en' }, k))).rejects.toThrow();
    await expect(call((k) => s.emit('auth:google', { credential: 'a'.repeat(100) }, k))).rejects.toThrow(/not enabled/);
  });

  it("a mid-round joiner can't read the words their new team already chose", async () => {
    const host = await client();
    const hv = latest(host);
    const r = await call<JoinResult>((k) =>
      host.emit('room:create', { nickname: 'Hosty', settings: { teamSize: 2, botLevel: 'low', wordsPerRound: 'perPlayer', wordLength: 5 } }, k),
    );
    await call((k) => host.emit('game:start', k));
    const sel = await until(() => (hv()?.phase === 'SELECTING' ? hv() : null));
    const mine = sel.selection!.slots.find((x) => x.assignedTo === sel.youId)!;
    await call((k) => host.emit('select:word', { slotIndex: mine.slotIndex, word: 'APPLE' }, k));
    // Let the bots lock their words too.
    await until(() => hv()?.selection?.slots.every((x) => x.locked) && hv(), 4000);

    const late = await client();
    const lv = latest(late);
    let history: { text: string }[] = [];
    late.on('chat:history', (h) => (history = h));
    await call((k) => host.emit('chat:send', { channel: 'team', text: 'our word is apple' }, k));
    await call<JoinResult>((k) => late.emit('room:join', { code: r.code, nickname: 'Peeker', key: r.roomKey ?? undefined }, k));
    const v = await until(() => lv());
    for (const slot of v.selection?.slots ?? []) {
      if (slot.assignedTo !== v.youId) expect(slot.word).toBeNull();
    }
    expect(history.some((m) => m.text.includes('apple'))).toBe(false);
    // The original setter still sees their own team's words.
    expect(hv()!.selection!.slots.find((x) => x.slotIndex === mine.slotIndex)!.word).toBe('APPLE');
  });

  it('private rooms need the password (or the invite link that carries it)', async () => {
    const host = await client();
    const r = await call<JoinResult>((k) => host.emit('room:create', { nickname: 'Keeper' }, k));
    expect(r.roomKey).toMatch(/^[A-Z2-9]{6}$/);
    const guest = await client();
    await expect(call((k) => guest.emit('room:join', { code: r.code, nickname: 'NoKey' }, k))).rejects.toThrow(/private/);
    await expect(call((k) => guest.emit('room:join', { code: r.code, nickname: 'Wrong', key: 'AAAAAA' }, k))).rejects.toThrow(/Wrong/);
    const ok = await call<JoinResult>((k) => guest.emit('room:join', { code: r.code, nickname: 'Friend', key: r.roomKey!.toLowerCase() }, k));
    expect(ok.code).toBe(r.code);
    // Resuming a seat after refresh needs only the session token.
    const again = await client();
    await call<JoinResult>((k) => again.emit('room:join', { code: r.code, nickname: 'Friend', sessionToken: ok.sessionToken }, k));

    // Brute force is capped per room, whatever the IP.
    const attacker = await client();
    let last = '';
    for (let i = 0; i < 12; i++) {
      last = await call((k) => attacker.emit('room:join', { code: r.code, nickname: `Guess${i}`, key: 'BBBBBB' }, k)).then(
        () => 'joined',
        (e: Error) => e.message,
      );
    }
    expect(last).toMatch(/Too many wrong passwords/);

    // Public rooms don't need (or expose) a password.
    await call((k) => host.emit('lobby:settings', { visibility: 'public' }, k));
    const v = latest(host);
    await call((k) => host.emit('lobby:settings', { language: 'es' }, k));
    expect((await until(() => v()))!.roomKey).toBeNull();
    const walkIn = await client();
    await call<JoinResult>((k) => walkIn.emit('room:join', { code: r.code, nickname: 'WalkIn' }, k));
  });

  it('custom hints, configurable pick time, and early start once all words are locked', async () => {
    const host = await client();
    const hv = latest(host);
    const r = await call<JoinResult>((k) =>
      host.emit('room:create', { nickname: 'Hinter', settings: { teamSize: 1, botLevel: 'off', selectionTimeSec: 45, wordLength: 5 } }, k),
    );
    const guest = await client();
    const gv = latest(guest);
    await call<JoinResult>((k) => guest.emit('room:join', { code: r.code, nickname: 'Rival', key: r.roomKey! }, k));
    await call((k) => host.emit('game:start', k));
    const sel = await until(() => (hv()?.phase === 'SELECTING' ? hv() : null));
    expect(sel.phaseEndsAt! - sel.serverNow).toBeGreaterThan(40_000);

    await expect(call((k) => host.emit('select:word', { slotIndex: 0, word: 'APPLE', hint: 'An apple a day' }, k))).rejects.toThrow(/contain the word/);
    await expect(call((k) => host.emit('select:word', { slotIndex: 0, word: 'APPLE', hint: '<script>' }, k))).rejects.toThrow();
    await call((k) => host.emit('select:word', { slotIndex: 0, word: 'APPLE', hint: 'Keeps doctors away' }, k));
    await call((k) => guest.emit('select:word', { slotIndex: 0, word: 'MANGO', category: 'Fruit' }, k));
    // Both locked → play starts long before the 45 s timer.
    const playing = await until(() => (gv()?.phase === 'PLAYING' ? gv() : null), 2000);
    const guestBoard = playing.boards.find((b) => b.teamId === playing.players.find((p) => p.id === playing.youId)!.teamId)!;
    expect(guestBoard.slots[0]!.category).toBe('Keeps doctors away');
  });

  it('serves runtime config', async () => {
    const res = await fetch(`${url}/api/config`);
    expect(await res.json()).toEqual({ googleClientId: null });
  });
});

describe('profile tokens', () => {
  it('round-trips and rejects tampering / expiry', () => {
    const t = tokens.issue({ sub: 's', name: 'N', picture: null }, 1000);
    expect(tokens.verify(t, 2000)).toEqual({ sub: 's', name: 'N', picture: null });
    expect(tokens.verify(t, 1000 + 60_001)).toBeNull();
    const [v, body, mac] = t.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ sub: 'admin', name: 'N', exp: 9e15 })).toString('base64url');
    expect(tokens.verify(`${v}.${forgedBody}.${mac}`, 2000)).toBeNull();
    expect(tokens.verify(`${v}.${body}.${mac}x`, 2000)).toBeNull();
    expect(new ProfileTokens('other', 60_000).verify(t, 2000)).toBeNull();
  });

  it('only accepts Google-hosted HTTPS photos', () => {
    expect(safePictureUrl('https://lh3.googleusercontent.com/a/x')).toBe('https://lh3.googleusercontent.com/a/x');
    expect(safePictureUrl('http://lh3.googleusercontent.com/a/x')).toBeNull();
    expect(safePictureUrl('https://evil.com/googleusercontent.com.png')).toBeNull();
    expect(safePictureUrl('https://googleusercontent.com.evil.com/x')).toBeNull();
    expect(safePictureUrl('javascript:alert(1)')).toBeNull();
  });
});
