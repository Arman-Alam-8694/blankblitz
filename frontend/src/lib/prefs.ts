/** Reactive UI preferences (theme, sound) backed by localStorage. */
import { useSyncExternalStore } from 'react';
import { session, type Theme } from './session';

interface Prefs {
  theme: Theme;
  sound: boolean;
}

let prefs: Prefs = { theme: session.theme(), sound: session.sound() };
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f8fafc' : '#0f172a');
}
applyTheme(prefs.theme);

export function getPrefs(): Prefs {
  return prefs;
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => prefs,
  );
}

export function toggleTheme(): void {
  const theme: Theme = prefs.theme === 'dark' ? 'light' : 'dark';
  session.setTheme(theme);
  applyTheme(theme);
  prefs = { ...prefs, theme };
  emit();
}

export function toggleSound(): void {
  const sound = !prefs.sound;
  session.setSound(sound);
  prefs = { ...prefs, sound };
  emit();
}

// Keep other open tabs in sync when the theme / sound toggle changes.
window.addEventListener('storage', (e) => {
  if (e.key !== 'bb:theme' && e.key !== 'bb:sound') return;
  prefs = { theme: session.theme(), sound: session.sound() };
  applyTheme(prefs.theme);
  emit();
});
