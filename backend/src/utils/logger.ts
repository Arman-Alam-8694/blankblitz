/** Minimal structured (JSON-lines) logger — no dependency, easy to ship to any log sink. */
type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let threshold: Level = 'info';
export function setLogLevel(level: Level): void {
  threshold = level;
}

function log(level: Level, msg: string, meta?: Record<string, unknown>): void {
  if (ORDER[level] < ORDER[threshold]) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...meta });
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
};

export function errorMeta(err: unknown): Record<string, unknown> {
  if (err instanceof Error) return { error: err.message, stack: err.stack };
  return { error: String(err) };
}
