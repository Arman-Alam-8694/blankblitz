/**
 * Single typed Socket.IO connection + promise-based request helper with timeout.
 */
import { io, type Socket } from 'socket.io-client';
import type { AckResponse, ClientToServerEvents, ServerToClientEvents } from '@blankblitz/shared';
import { session } from './session';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket: AppSocket = io(import.meta.env.VITE_SERVER_URL ?? undefined, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
  // Evaluated on every (re)connect, so a fresh sign-in is picked up automatically.
  auth: (cb) => cb({ profile: session.profile()?.token ?? '' }),
});

type EventsWithAck = {
  [K in keyof ClientToServerEvents]: Parameters<ClientToServerEvents[K]> extends [...infer _A, infer L]
    ? L extends (res: AckResponse<infer _T>) => void
      ? K
      : never
    : never;
}[keyof ClientToServerEvents];

type AckData<K extends EventsWithAck> =
  Parameters<ClientToServerEvents[K]> extends [...infer _A, (res: AckResponse<infer T>) => void] ? T : never;

type PayloadArgs<K extends EventsWithAck> =
  Parameters<ClientToServerEvents[K]> extends [infer P, (res: AckResponse<infer _T>) => void] ? [P] : [];

export class RequestError extends Error {}

/** Emit an event and await its acknowledgement. Rejects with a user-friendly message. */
export function request<K extends EventsWithAck>(event: K, ...payload: PayloadArgs<K>): Promise<AckData<K>> {
  return new Promise((resolve, reject) => {
    if (!socket.connected) {
      reject(new RequestError('Not connected — reconnecting…'));
      return;
    }
    const timed = socket.timeout(8000);
    const emit = (timed.emit as unknown as (ev: string, ...args: unknown[]) => void).bind(timed);
    emit(event, ...payload, (err: Error | null, res: AckResponse<AckData<K>>) => {
      if (err) reject(new RequestError('Server did not respond, please retry'));
      else if (res.ok) resolve(res.data);
      else reject(new RequestError(res.error));
    });
  });
}

// Dev-only handle for debugging/e2e (stripped from production builds).
if (import.meta.env.DEV) (window as unknown as { __bbSocket: AppSocket }).__bbSocket = socket;
