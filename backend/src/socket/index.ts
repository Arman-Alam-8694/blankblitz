/**
 * Socket.IO transport: authentication-free sessions, validation, rate limiting,
 * and mapping of events onto RoomManager / Room methods.
 */
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import {
  chatSendSchema,
  createRoomSchema,
  ghostSchema,
  googleAuthSchema,
  listRoomsSchema,
  guessSchema,
  joinRoomSchema,
  playerTargetSchema,
  quickMatchSchema,
  selectWordSchema,
  settingsPatchSchema,
  solveSchema,
  switchTeamSchema,
  voteCastSchema,
  voteStartSchema,
  voiceJoinSchema,
  voiceMuteSchema,
  voiceSignalSchema,
  RELAY_MAX_BYTES,
  VOICE_MAX_PEERS,
  type AckResponse,
  type AvatarChoice,
  type ClientToServerEvents,
  type JoinResult,
  type ServerToClientEvents,
} from '@blankblitz/shared';
import { verifyGoogleCredential } from '../auth/google';
import { ProfileTokens, type Profile } from '../auth/profileToken';
import type { Config } from '../config';
import type { Room } from '../rooms/Room';
import { RoomManager } from '../rooms/RoomManager';
import { iceServersFor } from '../voice/ice';
import type { Player, PlayerLook } from '../rooms/types';
import { GameError } from '../utils/errors';
import { errorMeta, logger } from '../utils/logger';
import { KeyedLimiter, TokenBucket } from './rateLimit';

interface SocketData {
  ip: string;
  code: string | null;
  playerId: string | null;
  events: TokenBucket;
  chat: TokenBucket;
  ghost: TokenBucket;
  signal: TokenBucket;
  frames: TokenBucket;
  /** Signed-in Google profile for this connection (from the handshake token or auth:google). */
  profile: Profile | null;
}

/** Relay frames are validated on the server only (Buffer is a Node type). */
const voiceFrameSchema = z.object({
  to: z.array(z.string().min(1).max(32)).max(VOICE_MAX_PEERS),
  seq: z.number().int().min(0),
  data: z.custom<Buffer>((v) => Buffer.isBuffer(v) && v.length > 0 && v.length <= RELAY_MAX_BYTES),
});

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AnyAck = (res: AckResponse<unknown>) => void;

export interface Realtime {
  io: IO;
  rooms: RoomManager;
  close(): Promise<void>;
}

function clientIp(socket: AppSocket, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = socket.handshake.headers['x-forwarded-for'];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return socket.handshake.address;
}

export function createRealtime(httpServer: HttpServer, config: Config): Realtime {
  const origins = config.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  const io: IO = new Server(httpServer, {
    // Same-origin by default; only list extra origins when the frontend is hosted elsewhere.
    cors: origins.length > 0 ? { origin: origins, credentials: false } : undefined,
    maxHttpBufferSize: 32 * 1024, // largest legit payload is a WebRTC SDP (~5–10 KB)
    pingInterval: 20_000,
    pingTimeout: 20_000,
    serveClient: false,
  });

  const rooms = new RoomManager(
    {
      emit: (socketId, event, ...args) => {
        io.to(socketId).emit(event, ...args);
      },
      detachSocket: (socketId, reason) => {
        const s = io.sockets.sockets.get(socketId);
        if (!s) return;
        s.data.code = null;
        s.data.playerId = null;
        s.emit('room:kicked', reason);
      },
    },
    {
      maxRooms: config.MAX_ROOMS,
      emptyRoomTtlMs: config.EMPTY_ROOM_TTL_SEC * 1000,
      reconnectGraceMs: config.RECONNECT_GRACE_SEC * 1000,
      botSpeed: config.BOT_SPEED,
      pauseScale: config.PAUSE_SCALE,
    },
  );

  const tokens = new ProfileTokens(config.AUTH_SECRET, config.AUTH_TTL_DAYS * 86_400_000);
  if (!config.AUTH_SECRET && config.GOOGLE_CLIENT_ID && config.NODE_ENV === 'production') {
    logger.warn('AUTH_SECRET is not set: Google sign-ins will reset whenever the server restarts');
  }
  const authLimiter = new KeyedLimiter(10, 0.2); // Google verification hits the network; keep it modest

  const connectionsPerIp = new Map<string, number>();
  const joinLimiter = new KeyedLimiter(config.JOIN_BURST_PER_IP, 0.5); // ~30 joins/min per IP, deters room-code scanning

  io.use((socket, next) => {
    const ip = clientIp(socket, config.TRUST_PROXY);
    const count = connectionsPerIp.get(ip) ?? 0;
    if (count >= config.MAX_CONNECTIONS_PER_IP) return next(new Error('Too many connections'));
    connectionsPerIp.set(ip, count + 1);
    socket.data = {
      ip,
      code: null,
      playerId: null,
      events: new TokenBucket(30, 15),
      chat: new TokenBucket(5, 1),
      ghost: new TokenBucket(20, 10),
      signal: new TokenBucket(80, 30), // ICE trickle is bursty
      frames: new TokenBucket(60, 40), // ~17 frames/s per speaker at 60 ms batches
      profile: tokens.verify((socket.handshake.auth as Record<string, unknown> | undefined)?.profile),
    };
    next();
  });

  io.on('connection', (socket) => {
    const ctx = (): { room: Room; player: Player } => {
      const { code, playerId } = socket.data;
      const room = code ? rooms.get(code) : undefined;
      const player = playerId ? room?.findPlayer(playerId) : undefined;
      if (!room || !player) throw new GameError('You are not in a room');
      return { room, player };
    };

    /** Wraps a handler with rate limiting, schema validation and safe error reporting. */
    function on<S extends z.ZodType, R>(
      event: keyof ClientToServerEvents,
      schema: S | null,
      handler: (payload: z.output<S>) => R | Promise<R>,
    ): void {
      (socket.on as (ev: string, fn: (...args: unknown[]) => void) => void)(event, async (...args: unknown[]) => {
        const ack = (typeof args[args.length - 1] === 'function' ? args.pop() : undefined) as AnyAck | undefined;
        const reply = (res: AckResponse<unknown>) => {
          if (ack) ack(res);
        };
        if (!socket.data.events.take()) return reply({ ok: false, error: 'Slow down a little' });
        try {
          let payload: unknown = undefined;
          if (schema) {
            const parsed = schema.safeParse(args[0]);
            if (!parsed.success) {
              return reply({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' });
            }
            payload = parsed.data;
          }
          const data = await handler(payload as z.output<S>);
          reply({ ok: true, data });
        } catch (err) {
          if (err instanceof GameError) return reply({ ok: false, error: err.message });
          logger.error('handler failed', { event, ...errorMeta(err) });
          reply({ ok: false, error: 'Something went wrong' });
        }
      });
    }

    const attach = (room: Room, player: Player): JoinResult => {
      socket.data.code = room.code;
      socket.data.playerId = player.id;
      return { code: room.code, playerId: player.id, sessionToken: player.sessionToken as string, roomKey: room.inviteKey };
    };

    const leaveCurrent = () => {
      const { code, playerId } = socket.data;
      if (!code || !playerId) return;
      rooms.get(code)?.leave(playerId);
      socket.data.code = null;
      socket.data.playerId = null;
    };

    const guardJoin = () => {
      if (!joinLimiter.take(socket.data.ip)) throw new GameError('Too many attempts, wait a moment');
    };

    /** Resolve the avatar choice: a preset, or the Google photo when actually signed in. */
    const lookOf = (choice: AvatarChoice | undefined): PlayerLook => {
      if (choice === 'google') return { avatar: null, picture: socket.data.profile?.picture ?? null };
      return { avatar: choice ?? null, picture: null };
    };

    on('room:create', createRoomSchema, ({ nickname, avatar, settings }) => {
      guardJoin();
      leaveCurrent();
      const room = rooms.create(settings);
      return attach(room, room.join(nickname, socket.id, undefined, lookOf(avatar), true).player);
    });

    on('room:join', joinRoomSchema, ({ code, nickname, avatar, sessionToken, key }) => {
      guardJoin();
      const room = rooms.get(code);
      if (!room) throw new GameError('Room not found — check the code');
      if (socket.data.code !== code) leaveCurrent();
      return attach(room, room.join(nickname, socket.id, sessionToken, lookOf(avatar), key).player);
    });

    on('room:quick', quickMatchSchema, ({ nickname, avatar, language }) => {
      guardJoin();
      leaveCurrent();
      const { room, player } = rooms.quickMatch(nickname, socket.id, lookOf(avatar), language);
      return attach(room, player);
    });

    on('rooms:list', listRoomsSchema, ({ language }) => rooms.list(language));

    // ── sign-in (optional Google) ──
    on('auth:google', googleAuthSchema, async ({ credential }) => {
      if (!authLimiter.take(socket.data.ip)) throw new GameError('Too many sign-in attempts, wait a moment');
      const profile = await verifyGoogleCredential(credential, config.GOOGLE_CLIENT_ID);
      socket.data.profile = profile;
      return { name: profile.name, picture: profile.picture, token: tokens.issue(profile) };
    });
    on('auth:me', null, () => {
      const p = socket.data.profile;
      return p ? { name: p.name, picture: p.picture } : null;
    });
    on('auth:signout', null, () => {
      socket.data.profile = null;
    });

    on('room:leave', null, () => leaveCurrent());

    on('lobby:settings', settingsPatchSchema, (patch) => {
      const { room, player } = ctx();
      room.updateSettings(player.id, patch);
    });
    on('lobby:team', switchTeamSchema, ({ teamId }) => {
      const { room, player } = ctx();
      room.switchTeam(player.id, teamId);
    });
    on('lobby:kick', playerTargetSchema, ({ playerId }) => {
      const { room, player } = ctx();
      room.hostKick(player.id, playerId);
    });
    on('game:start', null, () => {
      const { room, player } = ctx();
      room.start(player.id);
    });
    on('game:lobby', null, () => {
      const { room, player } = ctx();
      room.backToLobby(player.id);
    });
    on('select:word', selectWordSchema, ({ slotIndex, word, category, hint }) => {
      const { room, player } = ctx();
      room.selectWord(player.id, slotIndex, word, category ?? null, hint ?? null);
    });
    on('play:guess', guessSchema, ({ slot, letter }) => {
      const { room, player } = ctx();
      room.guess(player.id, slot, letter);
    });
    on('play:solve', solveSchema, ({ slot, word }) => {
      const { room, player } = ctx();
      return { correct: room.solve(player.id, slot, word) };
    });
    on('play:ghost', ghostSchema, ({ slot, letter }) => {
      if (!socket.data.ghost.take()) return;
      const { room, player } = ctx();
      room.ghost(player.id, slot, letter);
    });
    on('team:captain', playerTargetSchema, ({ playerId }) => {
      const { room, player } = ctx();
      room.setCaptain(player.id, playerId);
    });
    on('vote:start', voteStartSchema, ({ type, targetId }) => {
      const { room, player } = ctx();
      room.startVote(player.id, type, targetId);
    });
    on('vote:cast', voteCastSchema, ({ voteId, yes }) => {
      const { room, player } = ctx();
      room.castVote(player.id, voteId, yes);
    });
    on('chat:send', chatSendSchema, ({ channel, text }) => {
      if (!socket.data.chat.take()) throw new GameError('You are sending messages too fast');
      const { room, player } = ctx();
      room.chat(player.id, channel, text);
    });

    // ── voice ──
    on('voice:join', voiceJoinSchema, ({ mic }) => {
      const { room, player } = ctx();
      const presence = room.voiceJoin(player.id, mic);
      return {
        session: presence.session,
        iceServers: iceServersFor(config, player.id),
        relay: config.VOICE_RELAY,
        forceRelay: config.VOICE_RELAY && config.VOICE_FORCE_RELAY,
      };
    });
    on('voice:leave', null, () => {
      const { room, player } = ctx();
      room.voiceLeave(player.id);
    });
    on('voice:mute', voiceMuteSchema, ({ muted }) => {
      const { room, player } = ctx();
      room.voiceMute(player.id, muted);
    });

    // High-frequency, fire-and-forget events get their own buckets and skip acks.
    socket.on('voice:signal', (raw: unknown) => {
      if (!socket.data.signal.take()) return;
      const parsed = voiceSignalSchema.safeParse(raw);
      if (!parsed.success) return;
      try {
        const { room, player } = ctx();
        const { to, toSession, ...payload } = parsed.data;
        const route = room.voiceSignalRoute(player.id, to, toSession);
        if (route) io.to(route.socketId).emit('voice:signal', { ...payload, from: player.id, fromSession: route.fromSession });
      } catch {
        /* not in a room — drop */
      }
    });

    socket.on('voice:frame', (raw: unknown) => {
      if (!config.VOICE_RELAY || !socket.data.frames.take()) return;
      const parsed = voiceFrameSchema.safeParse(raw);
      if (!parsed.success) return;
      try {
        const { room, player } = ctx();
        const targets = room.voiceRelayTargets(player.id, parsed.data.to);
        const frame = { from: player.id, seq: parsed.data.seq, data: parsed.data.data };
        // volatile: drop rather than queue when a receiver is congested (real-time audio)
        for (const sid of targets) io.to(sid).volatile.emit('voice:frame', frame as never);
      } catch {
        /* not in a room — drop */
      }
    });

    socket.on('disconnect', () => {
      const { ip, code, playerId } = socket.data;
      const n = (connectionsPerIp.get(ip) ?? 1) - 1;
      if (n <= 0) connectionsPerIp.delete(ip);
      else connectionsPerIp.set(ip, n);
      if (code && playerId) rooms.get(code)?.disconnect(playerId, socket.id);
    });
  });

  return {
    io,
    rooms,
    close: async () => {
      rooms.shutdown();
      joinLimiter.stop();
      authLimiter.stop();
      await io.close();
    },
  };
}
