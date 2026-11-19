/**
 * Owns every live room on this process: creation, lookup, quick-match, and GC.
 *
 * Scaling note: state is in-memory per process. To scale horizontally, run several
 * instances behind a load balancer with sticky sessions and route by room code
 * (e.g. consistent hashing on the code, or the @socket.io/redis-adapter + a room->node map).
 */
import { ROOM_LIST_LIMIT, type RoomSettings, type RoomSummary } from '@blankblitz/shared';
import { GameError } from '../utils/errors';
import { errorMeta, logger } from '../utils/logger';
import { roomCode } from '../utils/random';
import { Room } from './Room';
import type { Player, PlayerLook, RoomHooks, RoomTiming } from './types';

export interface RoomManagerOptions extends RoomTiming {
  maxRooms: number;
  emptyRoomTtlMs: number;
  tickMs?: number;
}

const QUICK_SETTINGS: Partial<RoomSettings> = {
  teamCount: 2,
  teamSize: 2,
  botLevel: 'low',
  wordsPerRound: 1,
  visibility: 'public',
};

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly timer: NodeJS.Timeout;

  constructor(
    private readonly hooks: RoomHooks,
    private readonly opts: RoomManagerOptions,
  ) {
    this.timer = setInterval(() => this.tick(), opts.tickMs ?? 200);
    this.timer.unref();
  }

  get size(): number {
    return this.rooms.size;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  create(settings: Partial<RoomSettings> | undefined, quickMatch = false): Room {
    if (this.rooms.size >= this.opts.maxRooms) throw new GameError('Server is busy, please try again shortly');
    let code = roomCode();
    for (let i = 0; this.rooms.has(code); i++) {
      if (i > 100) throw new GameError('Could not allocate a room code');
      code = roomCode();
    }
    const room = new Room(code, this.hooks, this.opts, { settings, quickMatch });
    this.rooms.set(code, room);
    logger.info('room created', { code, quickMatch, rooms: this.rooms.size });
    return room;
  }

  /** Public rooms a newcomer can join, best first (lobbies, then the closest to full). */
  private joinable(language?: string): Room[] {
    return [...this.rooms.values()]
      .filter((r) => r.isPublic && r.humanCount > 0 && r.openSeats > 0 && (!language || r.language === language))
      .sort((a, b) => {
        const lobbyFirst = Number(b.currentPhase === 'LOBBY') - Number(a.currentPhase === 'LOBBY');
        // "About to fill": fewest seats left for humans, then most humans already in.
        const seatsLeft = a.capacity - a.humanCount - (b.capacity - b.humanCount);
        return lobbyFirst || seatsLeft || b.humanCount - a.humanCount;
      });
  }

  /** Room browser listing (public rooms only). */
  list(language?: string): RoomSummary[] {
    return this.joinable(language)
      .slice(0, ROOM_LIST_LIMIT)
      .map((r) => r.summary());
  }

  /** Random join: the public room that is closest to filling up, or a fresh bot-backed one. */
  quickMatch(name: string, socketId: string, look?: PlayerLook, language?: string): { room: Room; player: Player } {
    for (const room of this.joinable(language)) {
      try {
        return { room, player: room.join(name, socketId, undefined, look).player };
      } catch {
        // Seat taken between check and join (or similar) — try the next room.
      }
    }
    const room = this.create({ ...QUICK_SETTINGS, ...(language ? { language: language as RoomSettings['language'] } : {}) }, true);
    return { room, player: room.join(name, socketId, undefined, look).player };
  }

  private tick(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      try {
        room.tick(now);
        if (room.isAbandoned(now, this.opts.emptyRoomTtlMs)) this.dispose(code);
      } catch (err) {
        // One faulty room must never take down the process or other rooms.
        logger.error('room tick failed', { code, ...errorMeta(err) });
      }
    }
  }

  dispose(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    this.rooms.delete(code);
    room.dispose();
    logger.info('room disposed', { code, rooms: this.rooms.size });
  }

  shutdown(): void {
    clearInterval(this.timer);
    for (const code of [...this.rooms.keys()]) this.dispose(code);
  }
}
