/**
 * Seat credentials live in sessionStorage (per tab) so a refresh resumes the seat
 * but two tabs can still be two different players. Nickname and preferences are
 * remembered across visits in localStorage.
 */
import { AVATAR_IDS, LANGUAGE_CODES, type AuthProfile, type AvatarChoice, type LanguageCode } from '@blankblitz/shared';

const NICK_KEY = 'bb:nickname';
const AVATAR_KEY = 'bb:avatar';
const LANG_KEY = 'bb:language';
const THEME_KEY = 'bb:theme';
const SOUND_KEY = 'bb:sound';
const PROFILE_KEY = 'bb:profile';
const seatKey = (code: string) => `bb:seat:${code}`;

export type Theme = 'light' | 'dark';

export interface Seat {
  code: string;
  playerId: string;
  sessionToken: string;
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback; // storage can be disabled (privacy mode) — degrade gracefully
  }
}

const get = (k: string) => safe(() => localStorage.getItem(k), null);
const put = (k: string, v: string | null) =>
  safe(() => (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)), undefined);

function browserLanguage(): LanguageCode {
  const nav = safe(() => navigator.language.slice(0, 2).toLowerCase(), 'en');
  return (LANGUAGE_CODES as readonly string[]).includes(nav) ? (nav as LanguageCode) : 'en';
}

export const session = {
  nickname: () => get(NICK_KEY) ?? '',
  setNickname: (n: string) => put(NICK_KEY, n),

  /** Preset avatar or 'google'; a random preset is picked (and kept) on first visit. */
  avatar: (): AvatarChoice => {
    const v = get(AVATAR_KEY);
    if (v === 'google' || (AVATAR_IDS as readonly string[]).includes(v ?? '')) return v as AvatarChoice;
    const pickOne = AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)] ?? 'm1';
    put(AVATAR_KEY, pickOne);
    return pickOne;
  },
  setAvatar: (a: AvatarChoice) => put(AVATAR_KEY, a),

  language: (): LanguageCode => {
    const v = get(LANG_KEY);
    return v && (LANGUAGE_CODES as readonly string[]).includes(v) ? (v as LanguageCode) : browserLanguage();
  },
  setLanguage: (l: LanguageCode) => put(LANG_KEY, l),

  theme: (): Theme => {
    const v = get(THEME_KEY);
    if (v === 'light' || v === 'dark') return v;
    return safe(() => (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'), 'dark');
  },
  setTheme: (t: Theme) => put(THEME_KEY, t),

  sound: () => get(SOUND_KEY) !== 'off',
  setSound: (on: boolean) => put(SOUND_KEY, on ? 'on' : 'off'),

  profile: (): AuthProfile | null =>
    safe(() => {
      const raw = get(PROFILE_KEY);
      return raw ? (JSON.parse(raw) as AuthProfile) : null;
    }, null),
  setProfile: (p: AuthProfile | null) => put(PROFILE_KEY, p ? JSON.stringify(p) : null),

  seat: (code: string): Seat | null =>
    safe(() => {
      const raw = sessionStorage.getItem(seatKey(code));
      return raw ? (JSON.parse(raw) as Seat) : null;
    }, null),
  saveSeat: (seat: Seat) => safe(() => sessionStorage.setItem(seatKey(seat.code), JSON.stringify(seat)), undefined),
  clearSeat: (code: string) => safe(() => sessionStorage.removeItem(seatKey(code)), undefined),
};

/** The avatar to send to the server ('google' only while actually signed in). */
export function avatarForJoin(): AvatarChoice {
  const a = session.avatar();
  return a === 'google' && !session.profile() ? 'm1' : a;
}
