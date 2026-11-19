/**
 * ICE server list handed to clients when they join voice.
 * TURN credentials use the coturn REST scheme (time-limited HMAC), so the
 * long-term secret never leaves the server.
 */
import { createHmac } from 'node:crypto';
import type { IceServer } from '@blankblitz/shared';
import type { Config } from '../config';

const list = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);

export function iceServersFor(config: Config, playerId: string, now = Date.now()): IceServer[] {
  const servers: IceServer[] = [];
  const stun = list(config.STUN_URLS);
  if (stun.length > 0) servers.push({ urls: stun });

  const turn = list(config.TURN_URLS);
  if (turn.length > 0) {
    if (config.TURN_SECRET) {
      const expiry = Math.floor(now / 1000) + config.TURN_TTL_SEC;
      const username = `${expiry}:${playerId}`;
      const credential = createHmac('sha1', config.TURN_SECRET).update(username).digest('base64');
      servers.push({ urls: turn, username, credential });
    } else if (config.TURN_USERNAME && config.TURN_CREDENTIAL) {
      servers.push({ urls: turn, username: config.TURN_USERNAME, credential: config.TURN_CREDENTIAL });
    }
  }
  return servers;
}
