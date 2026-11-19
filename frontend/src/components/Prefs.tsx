import { toggleSound, toggleTheme, usePrefs } from '../lib/prefs';

/** Light/dark + sound toggles (shown on every page). */
export function PrefToggles() {
  const { theme, sound } = usePrefs();
  return (
    <span className="pref-toggles">
      <button
        className="btn btn-small btn-icon"
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label="Toggle light/dark mode"
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      <button
        className="btn btn-small btn-icon"
        onClick={toggleSound}
        title={sound ? 'Mute sound effects' : 'Turn on sound effects'}
        aria-label="Toggle sound effects"
        aria-pressed={sound}
      >
        {sound ? '🔊' : '🔇'}
      </button>
    </span>
  );
}
