/** UI-facing voice state (separate from the room store: changes ~10×/s while people talk). */
import { useSyncExternalStore } from 'react';

export type MicState = 'off' | 'on' | 'denied' | 'unavailable' | 'insecure';
export type PeerTransport = 'connecting' | 'p2p' | 'relay' | 'failed';

export interface VoiceUiState {
  joined: boolean;
  joining: boolean;
  mic: MicState;
  muted: boolean;
  selfSpeaking: boolean;
  needsGesture: boolean;
  peers: Record<string, { transport: PeerTransport; speaking: boolean }>;
  localMuted: Record<string, boolean>;
  volume: Record<string, number>;
  error: string | null;
}

let state: VoiceUiState = {
  joined: false,
  joining: false,
  mic: 'off',
  muted: false,
  selfSpeaking: false,
  needsGesture: false,
  peers: {},
  localMuted: {},
  volume: {},
  error: null,
};
const listeners = new Set<() => void>();

export function setVoice(patch: Partial<VoiceUiState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export function getVoice(): VoiceUiState {
  return state;
}
export function useVoice<T>(selector: (s: VoiceUiState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => selector(state),
  );
}
