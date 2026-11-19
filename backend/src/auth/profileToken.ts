/**
 * App-signed profile tokens: after Google verifies a user once, we hand the browser a small
 * HMAC-signed token so reconnects/refreshes don't need Google again. It carries only what the
 * game shows (display name + photo URL) — never the email.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface Profile {
  /** Stable Google account id (kept server-side; never sent to other players). */
  sub: string;
  name: string;
  picture: string | null;
}

interface Payload extends Profile {
  exp: number;
}

export class ProfileTokens {
  private readonly key: Buffer;

  constructor(
    secret: string,
    private readonly ttlMs: number,
  ) {
    this.key = secret ? Buffer.from(secret, 'utf8') : randomBytes(32);
  }

  private sign(body: string): string {
    return createHmac('sha256', this.key).update(body).digest('base64url');
  }

  issue(profile: Profile, now = Date.now()): string {
    const payload: Payload = { ...profile, exp: now + this.ttlMs };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `v1.${body}.${this.sign(body)}`;
  }

  verify(token: unknown, now = Date.now()): Profile | null {
    if (typeof token !== 'string' || token.length > 2048) return null;
    const [v, body, mac] = token.split('.');
    if (v !== 'v1' || !body || !mac) return null;
    const expected = Buffer.from(this.sign(body));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<Payload>;
      if (typeof p.exp !== 'number' || p.exp < now) return null;
      if (typeof p.sub !== 'string' || typeof p.name !== 'string') return null;
      return { sub: p.sub, name: p.name, picture: safePictureUrl(p.picture) };
    } catch {
      return null;
    }
  }
}

/** Only allow Google-hosted HTTPS profile photos (prevents tracking pixels / arbitrary URLs). */
export function safePictureUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 1024) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    if (u.hostname !== 'googleusercontent.com' && !u.hostname.endsWith('.googleusercontent.com')) return null;
    return u.toString();
  } catch {
    return null;
  }
}
