import { useEffect, useState } from 'react';
import { useStore } from './store';

/** Server-synchronised "now", re-rendering every `intervalMs`. */
export function useNow(intervalMs = 250): number {
  const offset = useStore((s) => s.clockOffset);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now + offset;
}

export function secondsLeft(deadline: number | null | undefined, now: number): number {
  if (!deadline) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
