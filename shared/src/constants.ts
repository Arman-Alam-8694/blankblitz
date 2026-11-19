/**
 * Game-wide constants shared by client and server.
 * Anything that both sides must agree on lives here.
 */

export const ROOM_CODE_LENGTH = 10;
/** Unambiguous alphabet (no 0/O, 1/I/L) so codes are easy to read aloud. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 16;
export const CHAT_MAX = 200;

export const MIN_TEAMS = 2;
export const MAX_TEAMS = 4;
export const MIN_TEAM_SIZE = 1;
export const MAX_TEAM_SIZE = 4;

export const MIN_WORD_LENGTH = 4;
export const MAX_WORD_LENGTH = 8;

export const SELECTION_TIME_SEC = 15;
export const SELECTION_TIME_OPTIONS = [10, 15, 20, 30, 45, 60] as const;
export const HINT_MAX = 24;
/** Private-room key: 6 chars from the room-code alphabet, embedded in invite links. */
export const ROOM_KEY_LENGTH = 6;
export const ROUND_END_TIME_SEC = 8;
export const BOARD_COUNTDOWN_SEC = 3;
export const VOTE_DURATION_SEC = 30;

export const ALL_IN_PENALTY = 2;

export const SCORE = {
  wordSolved: 100,
  perSecondLeft: 2,
  perAttemptLeft: 10,
  allInBonus: 50,
} as const;

export const TEAM_META = [
  { name: 'Blue', emoji: '🟦', color: '#3b82f6' },
  { name: 'Red', emoji: '🟥', color: '#ef4444' },
  { name: 'Green', emoji: '🟩', color: '#22c55e' },
  { name: 'Gold', emoji: '🟨', color: '#eab308' },
] as const;

export const CATEGORIES = [
  'Animal',
  'Body',
  'City',
  'Clothing',
  'Color',
  'Country',
  'Food',
  'Fruit',
  'Home',
  'Job',
  'Music',
  'Nature',
  'Object',
  'Science',
  'Sport',
  'Tech',
  'Vehicle',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Default attempts / timer when the host leaves them on "auto", keyed by words per board. */
export function autoAttempts(words: number): number {
  return 4 + Math.max(1, words);
}
export function autoRoundTime(words: number): number {
  return 30 + Math.max(1, words) * 15;
}
/** PRD: 5 rounds for single-word play, 3 rounds for multi-word group play. */
export function autoTotalRounds(words: number): number {
  return words <= 1 ? 5 : 3;
}

/** Chat languages for public rooms (game words stay English). */
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'हिन्दी (Hindi)' },
  { code: 'ur', name: 'اردو (Urdu)' },
  { code: 'bn', name: 'বাংলা (Bengali)' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt', name: 'Português' },
  { code: 'it', name: 'Italiano' },
  { code: 'ar', name: 'العربية (Arabic)' },
  { code: 'ru', name: 'Русский' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'zh', name: '中文' },
] as const;
export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as [
  (typeof LANGUAGES)[number]['code'],
  ...(typeof LANGUAGES)[number]['code'][],
];
export type LanguageCode = (typeof LANGUAGES)[number]['code'];

/** Built-in avatar presets (drawn client-side as SVG, no external assets). */
export const AVATAR_IDS = [
  'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8',
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8',
] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

/** Max open rooms returned by the public room browser. */
export const ROOM_LIST_LIMIT = 30;
