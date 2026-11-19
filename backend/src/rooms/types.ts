import type { BotLevel, ChatMessage, ServerToClientEvents, VoteType } from '@blankblitz/shared';

export interface Player {
  id: string;
  name: string;
  teamId: number;
  isBot: boolean;
  botLevel: BotLevel;
  /** Secret used to resume a seat after reconnect. Never sent to other players. */
  sessionToken: string | null;
  socketId: string | null;
  connected: boolean;
  disconnectedAt: number | null;
  joinedAt: number;
  revoked: boolean;
  teamMuted: boolean;
  nextBotActionAt: number | null;
  /** Preset avatar id or null. */
  avatar: string | null;
  /** Validated Google photo URL or null. */
  picture: string | null;
}

/** How a player looks to others (chosen on the landing page). */
export interface PlayerLook {
  avatar: string | null;
  picture: string | null;
}

export interface Team {
  id: number;
  score: number;
  captainId: string | null;
}

export interface SelectionSlot {
  slotIndex: number;
  assignedTo: string | null;
  word: string | null;
  category: string | null;
  locked: boolean;
}

export interface Selection {
  setterTeamId: number;
  targetTeamId: number;
  slots: SelectionSlot[];
}

export interface Vote {
  id: string;
  type: VoteType;
  teamId: number;
  targetId: string;
  initiatorId: string;
  yes: Set<string>;
  no: Set<string>;
  expiresAt: number;
  reverse: boolean;
}

/** The transport-facing side of a room — keeps game logic free of Socket.IO details. */
export interface RoomHooks {
  emit<E extends keyof ServerToClientEvents>(
    socketId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void;
  /** Detach a socket from this room (it stays connected so the client can go elsewhere). */
  detachSocket(socketId: string, reason: string): void;
}

export interface RoomTiming {
  reconnectGraceMs: number;
  botSpeed: number;
  pauseScale: number;
}

export type { ChatMessage };
