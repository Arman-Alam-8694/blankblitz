/**
 * Typed Socket.IO event contracts. Both server and client import these so a
 * renamed/changed event is a compile error on both sides.
 */
import type { z } from 'zod';
import type {
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
} from './schemas';
import type { Ack, AuthProfile, ChatMessage, GhostPreview, JoinResult, RoomSummary, RoomView } from './types';
import type {
  VoiceFrameIn,
  VoiceFrameOut,
  VoiceJoinResult,
  VoiceSignal,
  VoiceSignalIn,
  voiceJoinSchema,
  voiceMuteSchema,
} from './voice';

type In<S extends z.ZodType> = z.input<S>;

export interface ClientToServerEvents {
  'room:create': (p: In<typeof createRoomSchema>, ack: Ack<JoinResult>) => void;
  'room:join': (p: In<typeof joinRoomSchema>, ack: Ack<JoinResult>) => void;
  'room:quick': (p: In<typeof quickMatchSchema>, ack: Ack<JoinResult>) => void;
  'room:leave': (ack: Ack) => void;
  'rooms:list': (p: In<typeof listRoomsSchema>, ack: Ack<RoomSummary[]>) => void;

  'auth:google': (p: In<typeof googleAuthSchema>, ack: Ack<AuthProfile>) => void;
  /** Profile attached to this connection (from the handshake token), or null. */
  'auth:me': (ack: Ack<Omit<AuthProfile, 'token'> | null>) => void;
  'auth:signout': (ack: Ack) => void;

  'lobby:settings': (p: In<typeof settingsPatchSchema>, ack: Ack) => void;
  'lobby:team': (p: In<typeof switchTeamSchema>, ack: Ack) => void;
  'lobby:kick': (p: In<typeof playerTargetSchema>, ack: Ack) => void;

  'game:start': (ack: Ack) => void;
  'game:lobby': (ack: Ack) => void;

  'select:word': (p: In<typeof selectWordSchema>, ack: Ack) => void;
  'play:guess': (p: In<typeof guessSchema>, ack: Ack) => void;
  'play:solve': (p: In<typeof solveSchema>, ack: Ack<{ correct: boolean }>) => void;
  'play:ghost': (p: In<typeof ghostSchema>) => void;

  'team:captain': (p: In<typeof playerTargetSchema>, ack: Ack) => void;
  'vote:start': (p: In<typeof voteStartSchema>, ack: Ack) => void;
  'vote:cast': (p: In<typeof voteCastSchema>, ack: Ack) => void;

  'chat:send': (p: In<typeof chatSendSchema>, ack: Ack) => void;

  'voice:join': (p: In<typeof voiceJoinSchema>, ack: Ack<VoiceJoinResult>) => void;
  'voice:leave': (ack: Ack) => void;
  'voice:mute': (p: In<typeof voiceMuteSchema>, ack: Ack) => void;
  'voice:signal': (p: VoiceSignalIn) => void;
  'voice:frame': (p: VoiceFrameOut) => void;
}

export interface ServerToClientEvents {
  'room:state': (view: RoomView) => void;
  'chat:message': (msg: ChatMessage) => void;
  'chat:history': (msgs: ChatMessage[]) => void;
  'play:ghost': (ghost: GhostPreview) => void;
  'room:kicked': (reason: string) => void;
  'voice:signal': (s: VoiceSignal) => void;
  'voice:frame': (f: VoiceFrameIn) => void;
}
