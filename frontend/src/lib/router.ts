/** Tiny history-API router: "/" and "/r/:code" are the only routes we need. */
import { useSyncExternalStore } from 'react';
import { ROOM_CODE_LENGTH } from '@blankblitz/shared';

const listeners = new Set<() => void>();
window.addEventListener('popstate', () => listeners.forEach((l) => l()));

export function navigate(path: string, replace = false): void {
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  listeners.forEach((l) => l());
}

export function usePath(): string {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => location.pathname,
  );
}

export function roomCodeFromPath(path: string): string | null {
  const m = new RegExp(`^/r/([A-Za-z0-9]{${ROOM_CODE_LENGTH}})/?$`).exec(path);
  return m?.[1] ? m[1].toUpperCase() : null;
}

/**
 * Invite link. A private room's password rides in the #fragment: browsers never send the
 * fragment to servers (so it stays out of logs) and our no-referrer policy keeps it out of Referer.
 */
export function roomUrl(code: string, key?: string | null): string {
  return `${location.origin}/r/${code}${key ? `#k=${key}` : ''}`;
}

/** Password from an invite link (#k=…), if present. */
export function keyFromHash(): string | undefined {
  const m = /[#&]k=([A-Za-z0-9]{4,12})/.exec(location.hash);
  return m?.[1]?.toUpperCase();
}

/** Remove the password from the address bar once it has been used. */
export function clearHash(): void {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}
