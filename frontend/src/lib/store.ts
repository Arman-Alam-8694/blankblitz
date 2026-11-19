/**
 * App state store (useSyncExternalStore — no external state library needed).
 * The server pushes complete per-player snapshots, so the client never has to
 * reconcile diffs: the latest snapshot is always the truth.
 */
import { useSyncExternalStore } from 'react';
import type { ChatMessage, GhostPreview, RoomView } from '@blankblitz/shared';
import { request, socket } from './socket';
import { avatarForJoin, session } from './session';
import { onChatMessage, onRoomState } from './sfx';
import { voice } from '../voice/engine';

export interface Toast {
  id: number;
  text: string;
  kind: 'error' | 'info';
}

export interface AppState {
  connected: boolean;
  view: RoomView | null;
  chat: ChatMessage[];
  ghosts: Record<string, GhostPreview>;
  /** serverTime - localTime, used for accurate countdowns. */
  clockOffset: number;
  kicked: string | null;
  toasts: Toast[];
  /** The room this tab has joined — re-joined automatically after reconnects. */
  roomCode: string | null;
}

let state: AppState = {
  connected: socket.connected,
  view: null,
  chat: [],
  ghosts: {},
  clockOffset: 0,
  kicked: null,
  toasts: [],
  roomCode: null,
};
const listeners = new Set<() => void>();

function set(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function getState(): AppState {
  return state;
}

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => selector(state),
  );
}

let toastId = 0;
export function toast(text: string, kind: Toast['kind'] = 'error'): void {
  const t = { id: ++toastId, text, kind };
  set({ toasts: [...state.toasts.slice(-3), t] });
  setTimeout(() => set({ toasts: state.toasts.filter((x) => x.id !== t.id) }), 3500);
}

/** Run a request and surface failures as a toast. Returns undefined on error. */
export async function act<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Something went wrong');
    return undefined;
  }
}

export async function enterRoom(code: string, nickname: string, key?: string): Promise<void> {
  const seat = session.seat(code);
  const res = await request('room:join', {
    code,
    nickname,
    avatar: avatarForJoin(),
    sessionToken: seat?.sessionToken,
    ...(key ? { key } : {}),
  });
  onJoined(res.code, res.playerId, res.sessionToken);
}

export function onJoined(code: string, playerId: string, sessionToken: string): void {
  session.saveSeat({ code, playerId, sessionToken });
  set({ kicked: null, roomCode: code, view: state.view?.code === code ? state.view : null });
}

export async function leaveRoom(): Promise<void> {
  const code = state.roomCode;
  if (code) session.clearSeat(code);
  voice.sync(null);
  onRoomState(null);
  set({ view: null, chat: [], ghosts: {}, roomCode: null });
  if (socket.connected) await request('room:leave').catch(() => undefined);
}

socket.on('connect', () => {
  set({ connected: true });
  const code = state.roomCode;
  if (code) {
    enterRoom(code, session.nickname() || 'Player').catch((err: Error) => {
      toast(err.message);
      set({ view: null, roomCode: null });
    });
  }
});
socket.on('disconnect', () => set({ connected: false }));

socket.on('room:state', (view) => {
  if (view.code !== state.roomCode) return;
  set({ view, clockOffset: view.serverNow - Date.now() });
  voice.sync(view);
  onRoomState(view, state.clockOffset);
});
socket.on('chat:history', (msgs) => set({ chat: msgs }));
socket.on('chat:message', (msg) => {
  set({ chat: [...state.chat.slice(-149), msg] });
  onChatMessage(msg, state.view?.youId);
});
socket.on('play:ghost', (g) => set({ ghosts: { ...state.ghosts, [g.playerId]: { ...g, at: Date.now() } } }));
socket.on('room:kicked', (reason) => {
  if (state.roomCode) session.clearSeat(state.roomCode);
  voice.sync(null);
  onRoomState(null);
  set({ kicked: reason, view: null, chat: [], roomCode: null });
});
