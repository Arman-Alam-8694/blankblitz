/**
 * Google Identity Services ID-token verification (free; no Google SDK needed).
 * Checks signature (Google's published JWKS), issuer, audience (our client id) and expiry.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { sanitizeText } from '@blankblitz/shared';
import { GameError } from '../utils/errors';
import { safePictureUrl, type Profile } from './profileToken';

const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), {
  cooldownDuration: 30_000,
  cacheMaxAge: 6 * 3600_000,
});

export async function verifyGoogleCredential(credential: string, clientId: string): Promise<Profile> {
  if (!clientId) throw new GameError('Google sign-in is not enabled on this server');
  let payload;
  try {
    ({ payload } = await jwtVerify(credential, JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: clientId,
      clockTolerance: 30,
    }));
  } catch {
    throw new GameError('Google sign-in failed, please try again');
  }
  if (typeof payload.sub !== 'string' || !payload.sub) throw new GameError('Google sign-in failed');
  const rawName = typeof payload.given_name === 'string' ? payload.given_name : typeof payload.name === 'string' ? payload.name : 'Player';
  return {
    sub: payload.sub,
    name: sanitizeText(rawName).slice(0, 40) || 'Player',
    picture: safePictureUrl(payload.picture),
  };
}
