import { randomBytes, randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, ROOM_KEY_LENGTH } from '@blankblitz/shared';

/** Cryptographically secure secret (used for session tokens). */
export function secretToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

/** Short public identifier (player ids, vote ids, message ids). */
export function shortId(): string {
  return randomBytes(6).toString('base64url');
}

export function roomCode(length = ROOM_CODE_LENGTH): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/** Non-crypto helpers for gameplay randomness. */
export function pick<T>(arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('pick() on empty array');
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

export function between(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
  }
  return arr;
}

/** Private-room password (crypto-random, same unambiguous alphabet as room codes). */
export function roomKey(): string {
  return roomCode(ROOM_KEY_LENGTH);
}
