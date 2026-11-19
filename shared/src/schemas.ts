/**
 * Runtime validation for every client -> server payload.
 * The server must never trust the client: all inputs pass through these schemas.
 */
import { z } from 'zod';
import {
  AVATAR_IDS,
  CATEGORIES,
  LANGUAGE_CODES,
  CHAT_MAX,
  MAX_TEAMS,
  MAX_TEAM_SIZE,
  MAX_WORD_LENGTH,
  MIN_TEAMS,
  MIN_TEAM_SIZE,
  MIN_WORD_LENGTH,
  HINT_MAX,
  NICKNAME_MAX,
  NICKNAME_MIN,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_KEY_LENGTH,
} from './constants';

/** Strip control / zero-width / bidi-override characters and collapse whitespace. */
export function sanitizeText(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠-⁯﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const nicknameSchema = z
  .string()
  .transform(sanitizeText)
  .pipe(
    z
      .string()
      .min(NICKNAME_MIN, `Nickname must be at least ${NICKNAME_MIN} characters`)
      .max(NICKNAME_MAX, `Nickname must be at most ${NICKNAME_MAX} characters`)
      .regex(/^[\p{L}\p{N} _.\-]+$/u, 'Nickname may only contain letters, numbers, spaces, _ . -')
      .refine((n) => !/^\[?bot\]?/i.test(n), 'Nickname cannot impersonate a bot'),
  );

export const roomCodeSchema = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(
    z
      .string()
      .length(ROOM_CODE_LENGTH)
      .refine((s) => [...s].every((c) => ROOM_CODE_ALPHABET.includes(c)), 'Invalid room code'),
  );

/** Private-room key (case-insensitive; ambiguous characters are not used). */
export const roomKeySchema = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(
    z
      .string()
      .length(ROOM_KEY_LENGTH, `Room password is ${ROOM_KEY_LENGTH} characters`)
      .refine((s) => [...s].every((c) => ROOM_CODE_ALPHABET.includes(c)), 'Invalid room password'),
  );

export const sessionTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/);

const intIn = (min: number, max: number) => z.number().int().min(min).max(max);

export const roomSettingsSchema = z.object({
  mode: z.enum(['blitz', 'spotlight']),
  teamCount: intIn(MIN_TEAMS, MAX_TEAMS),
  teamSize: intIn(MIN_TEAM_SIZE, MAX_TEAM_SIZE),
  totalRounds: z.union([z.literal('auto'), intIn(1, 10)]),
  wordsPerRound: z.union([z.literal('perPlayer'), z.literal(1), z.literal(3), z.literal(4)]),
  wordLength: z.union([z.literal('any'), intIn(MIN_WORD_LENGTH, MAX_WORD_LENGTH)]),
  attempts: z.union([z.literal('auto'), intIn(1, 20)]),
  roundTimeSec: z.union([z.literal('auto'), intIn(15, 300)]),
  inputControl: z.enum(['open', 'captain', 'relay']),
  shotClockSec: intIn(3, 15),
  voice: z.boolean(),
  botLevel: z.enum(['off', 'low', 'medium']),
  /** Public rooms are listed in the room browser and used by random join. */
  visibility: z.enum(['public', 'private']),
  /** Chat language of the room (words are always English). */
  language: z.enum(LANGUAGE_CODES),
  /** Difficulty of auto-picked words (timer expiry and bots). */
  wordDifficulty: z.enum(['easy', 'medium', 'hard', 'mixed']),
  /** Seconds to choose words (the round starts early once everyone has locked in). */
  selectionTimeSec: intIn(10, 60),
});
export type WordDifficulty = RoomSettings['wordDifficulty'];
export type RoomSettings = z.infer<typeof roomSettingsSchema>;

export const DEFAULT_SETTINGS: RoomSettings = {
  mode: 'blitz',
  teamCount: 2,
  teamSize: 2,
  totalRounds: 'auto',
  wordsPerRound: 1,
  wordLength: 'any',
  attempts: 'auto',
  roundTimeSec: 'auto',
  inputControl: 'open',
  shotClockSec: 5,
  voice: false,
  botLevel: 'low',
  visibility: 'private',
  language: 'en',
  wordDifficulty: 'easy',
  selectionTimeSec: 15,
};

export const settingsPatchSchema = roomSettingsSchema.partial().strict();

export const languageSchema = z.enum(LANGUAGE_CODES);

/** A preset avatar id, or 'google' to use the signed-in Google profile photo. */
export const avatarChoiceSchema = z.enum([...AVATAR_IDS, 'google']);
export type AvatarChoice = z.infer<typeof avatarChoiceSchema>;

export const createRoomSchema = z.object({
  nickname: nicknameSchema,
  avatar: avatarChoiceSchema.optional(),
  settings: settingsPatchSchema.optional(),
});

export const joinRoomSchema = z.object({
  code: roomCodeSchema,
  nickname: nicknameSchema,
  avatar: avatarChoiceSchema.optional(),
  sessionToken: sessionTokenSchema.optional(),
  /** Required for private rooms (comes from the invite link, or typed in). */
  key: roomKeySchema.optional(),
});

export const quickMatchSchema = z.object({
  nickname: nicknameSchema,
  avatar: avatarChoiceSchema.optional(),
  language: languageSchema.optional(),
});

export const listRoomsSchema = z.object({ language: languageSchema.optional() });

/** Google Identity Services ID token (a JWT, typically ~1–1.5 KB). */
export const googleAuthSchema = z.object({ credential: z.string().min(20).max(4096) });

export const switchTeamSchema = z.object({ teamId: intIn(0, MAX_TEAMS - 1) });
export const playerTargetSchema = z.object({ playerId: z.string().min(1).max(32) });

const letterSchema = z
  .string()
  .length(1)
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]$/));

const wordInputSchema = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{1,16}$/, 'Words may only contain letters A-Z'));

const slotIndexSchema = intIn(0, 15);

/** A setter's own hint text, e.g. "Found in Paris". */
export const customHintSchema = z
  .string()
  .max(HINT_MAX * 2)
  .transform(sanitizeText)
  .pipe(
    z
      .string()
      .min(2, 'Hint is too short')
      .max(HINT_MAX, `Hint can be at most ${HINT_MAX} characters`)
      .regex(/^[\p{L}\p{N} '&,.!?()\-]+$/u, 'Hint may only contain letters, numbers and basic punctuation'),
  );

export const selectWordSchema = z.object({
  slotIndex: slotIndexSchema,
  word: wordInputSchema,
  category: z.enum(CATEGORIES).nullable().optional(),
  /** Custom hint; takes precedence over `category`. */
  hint: customHintSchema.nullable().optional(),
});

export const guessSchema = z.object({ slot: slotIndexSchema, letter: letterSchema });
export const solveSchema = z.object({ slot: slotIndexSchema, word: wordInputSchema });
export const ghostSchema = z.object({ slot: slotIndexSchema, letter: letterSchema.nullable() });

export const voteStartSchema = z.object({
  type: z.enum(['revoke', 'mute', 'kick']),
  targetId: z.string().min(1).max(32),
});
export const voteCastSchema = z.object({ voteId: z.string().min(1).max(32), yes: z.boolean() });

export const chatSendSchema = z.object({
  channel: z.enum(['team', 'lobby']),
  text: z
    .string()
    .max(CHAT_MAX * 2)
    .transform(sanitizeText)
    .pipe(z.string().min(1).max(CHAT_MAX)),
});
