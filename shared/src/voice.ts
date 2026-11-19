/**
 * Voice protocol shared by client and server.
 *
 * Transport ladder (most to least preferred), chosen per peer pair automatically:
 *   1. WebRTC P2P (host / STUN-reflexive candidates)      — free, lowest latency
 *   2. WebRTC via TURN (if TURN is configured on server)  — works through strict NAT/firewalls
 *   3. Server relay over the existing WebSocket           — works anywhere the game works
 *
 * Channels follow the PRD: team voice while PLAYING/SELECTING, lobby voice otherwise.
 */
import { z } from 'zod';
import type { Phase } from './types';

export type VoiceChannel = `team:${number}` | 'lobby';

export function voiceChannelOf(phase: Phase, teamId: number): VoiceChannel {
  return phase === 'SELECTING' || phase === 'PLAYING' ? `team:${teamId}` : 'lobby';
}

/** Mirrors the DOM RTCIceServer shape without depending on DOM types. */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface VoiceJoinResult {
  session: string;
  iceServers: IceServer[];
  /** Server relay available as last-resort fallback. */
  relay: boolean;
  /** Server asks clients to skip P2P entirely (ops switch). */
  forceRelay: boolean;
}

/** Public per-player voice presence included in RoomView. */
export interface VoicePresence {
  session: string;
  mic: boolean;
  muted: boolean;
}

/** Relay audio format: 16 kHz mono, G.711 µ-law, 20 ms frames. */
export const RELAY_SAMPLE_RATE = 16000;
export const RELAY_FRAME_SAMPLES = 320;
export const RELAY_MAX_BYTES = 4096;
export const VOICE_MAX_PEERS = 15;

export const voiceJoinSchema = z.object({ mic: z.boolean() });
export const voiceMuteSchema = z.object({ muted: z.boolean() });

const idSchema = z.string().min(1).max(32);

export const voiceSignalSchema = z
  .object({
    to: idSchema,
    toSession: idSchema,
    description: z
      .object({
        type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
        sdp: z.string().max(16_000).optional(),
      })
      .optional(),
    candidate: z
      .object({
        candidate: z.string().max(1024),
        sdpMid: z.string().max(64).nullable().optional(),
        sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
        usernameFragment: z.string().max(256).nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .refine((s) => s.description !== undefined || s.candidate !== undefined, 'Empty signal');

export type VoiceSignalIn = z.input<typeof voiceSignalSchema>;
export type VoiceSignal = Omit<z.output<typeof voiceSignalSchema>, 'to' | 'toSession'> & {
  from: string;
  fromSession: string;
};

export interface VoiceFrameOut {
  to: string[];
  seq: number;
  data: ArrayBuffer | Uint8Array;
}
export interface VoiceFrameIn {
  from: string;
  seq: number;
  data: ArrayBuffer;
}
