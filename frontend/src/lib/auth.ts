/**
 * Optional "Sign in with Google" (Google Identity Services — free).
 * Google gives the browser a signed ID token; our server verifies it and returns an
 * app-signed profile token, so Google is only contacted once per sign-in.
 * The email address is never requested, stored, or shown.
 */
import { useSyncExternalStore } from 'react';
import type { AuthProfile } from '@blankblitz/shared';
import { getPrefs } from './prefs';
import { request, socket } from './socket';
import { session } from './session';

interface GsiButtonOptions {
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signin' | 'continue_with';
  shape?: 'pill' | 'rectangular';
  logo_alignment?: 'left' | 'center';
}
interface Gsi {
  accounts: {
    id: {
      initialize(opts: {
        client_id: string;
        callback: (res: { credential?: string }) => void;
        ux_mode?: 'popup';
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
        use_fedcm_for_prompt?: boolean;
      }): void;
      renderButton(el: HTMLElement, opts: GsiButtonOptions): void;
      disableAutoSelect(): void;
    };
  };
}
declare global {
  interface Window {
    google?: Gsi;
  }
}

interface AuthState {
  /** null = not loaded yet; '' = sign-in disabled on this server. */
  clientId: string | null;
  profile: AuthProfile | null;
  busy: boolean;
}

let state: AuthState = { clientId: null, profile: session.profile(), busy: false };
const listeners = new Set<() => void>();
function set(patch: Partial<AuthState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

let configPromise: Promise<string> | null = null;
function loadConfig(): Promise<string> {
  configPromise ??= fetch('/api/config')
    .then((r) => (r.ok ? (r.json() as Promise<{ googleClientId: string | null }>) : { googleClientId: null }))
    .then((c) => c.googleClientId ?? '')
    .catch(() => '')
    .then((id) => {
      set({ clientId: id });
      return id;
    });
  return configPromise;
}

let gsiPromise: Promise<Gsi> | null = null;
function loadGsi(clientId: string): Promise<Gsi> {
  gsiPromise ??= new Promise<Gsi>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => {
      const g = window.google;
      if (!g) return reject(new Error('Google sign-in unavailable'));
      g.accounts.id.initialize({
        client_id: clientId,
        callback: (res) => void onCredential(res.credential),
        ux_mode: 'popup',
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      resolve(g);
    };
    s.onerror = () => {
      gsiPromise = null;
      reject(new Error('Could not load Google sign-in (blocked by an extension or network?)'));
    };
    document.head.appendChild(s);
  });
  return gsiPromise;
}

let onError: (msg: string) => void = () => undefined;

async function onCredential(credential: string | undefined): Promise<void> {
  if (!credential) return;
  set({ busy: true });
  try {
    const profile = await request('auth:google', { credential });
    session.setProfile(profile);
    session.setAvatar('google');
    set({ profile });
  } catch (err) {
    onError(err instanceof Error ? err.message : 'Sign-in failed');
  } finally {
    set({ busy: false });
  }
}

/** Render the official Google button into `el` (no-op when sign-in is disabled). */
export async function mountGoogleButton(el: HTMLElement, reportError: (msg: string) => void): Promise<void> {
  onError = reportError;
  const clientId = await loadConfig();
  if (!clientId) return;
  try {
    const g = await loadGsi(clientId);
    el.replaceChildren();
    g.accounts.id.renderButton(el, {
      theme: getPrefs().theme === 'dark' ? 'filled_black' : 'outline',
      size: 'medium',
      text: 'signin_with',
      shape: 'pill',
    });
  } catch (err) {
    reportError(err instanceof Error ? err.message : 'Google sign-in unavailable');
  }
}

export async function signOut(): Promise<void> {
  session.setProfile(null);
  if (session.avatar() === 'google') session.setAvatar('m1');
  set({ profile: null });
  window.google?.accounts.id.disableAutoSelect();
  if (socket.connected) await request('auth:signout').catch(() => undefined);
}

export function initAuth(): void {
  void loadConfig();
  // If the server no longer accepts our token (expired / secret rotated), drop it locally.
  socket.on('connect', () => {
    if (!session.profile()) return;
    request('auth:me')
      .then((me) => {
        if (!me) {
          session.setProfile(null);
          if (session.avatar() === 'google') session.setAvatar('m1');
          set({ profile: null });
        }
      })
      .catch(() => undefined);
  });
}
