/**
 * Lightweight sound effects synthesised with Web Audio — no audio files to download,
 * nothing to license, ~0 bytes of assets. Sounds are derived from state changes so
 * every client hears the same events the server confirmed.
 */
import type { BoardView, ChatMessage, RoomView } from '@blankblitz/shared';
import { getPrefs } from './prefs';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audio(): AudioContext | null {
  if (!getPrefs().sound) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null; // Web Audio unavailable — stay silent
  }
}

// Browsers only allow audio after a user gesture: warm the context on the first one.
for (const ev of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(ev, () => void audio(), { once: true, capture: true, passive: true });
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  /** Seconds from now. */
  at?: number;
  /** Glide to this frequency over the duration. */
  to?: number;
}

function tone(freq: number, dur: number, { type = 'sine', gain = 0.15, at = 0, to }: ToneOpts = {}): void {
  const a = audio();
  if (!a || !master) return;
  const t0 = a.currentTime + at;
  const osc = a.createOscillator();
  const env = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(env).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const seq = (notes: number[], step: number, opts: ToneOpts = {}) =>
  notes.forEach((f, i) => tone(f, step * 1.6, { ...opts, at: (opts.at ?? 0) + i * step }));

export const sfx = {
  hit: () => seq([880, 1320], 0.06, { type: 'triangle', gain: 0.12 }),
  miss: () => tone(180, 0.22, { type: 'square', gain: 0.06, to: 90 }),
  solved: () => seq([523, 659, 784, 1047], 0.08, { type: 'triangle', gain: 0.13 }),
  allIn: () => seq([392, 523, 659, 784, 1047, 1319], 0.06, { type: 'sawtooth', gain: 0.05 }),
  fail: () => seq([392, 330, 262], 0.14, { type: 'triangle', gain: 0.12 }),
  tick: () => tone(1000, 0.05, { type: 'square', gain: 0.04 }),
  go: () => seq([660, 660, 990], 0.12, { type: 'square', gain: 0.05 }),
  roundEnd: () => seq([784, 659, 784], 0.1, { type: 'sine', gain: 0.12 }),
  win: () => seq([523, 659, 784, 1047, 784, 1047], 0.11, { type: 'triangle', gain: 0.14 }),
  lose: () => seq([440, 415, 392, 370], 0.18, { type: 'sine', gain: 0.1 }),
  pop: () => tone(600, 0.07, { type: 'sine', gain: 0.07, to: 900 }),
  join: () => seq([500, 750], 0.07, { type: 'sine', gain: 0.08 }),
  click: () => tone(1400, 0.025, { type: 'square', gain: 0.025 }),
};

// ───────────────────────── state → sound mapping ─────────────────────────

let prev: RoomView | null = null;
let lastTickSecond = -1;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let latest: RoomView | null = null;
let clockOffset = 0;

const myBoard = (v: RoomView): BoardView | undefined => {
  const me = v.players.find((p) => p.id === v.youId);
  return me ? v.boards.find((b) => b.teamId === me.teamId) : undefined;
};

/** Called with every new snapshot from the server. */
export function onRoomState(next: RoomView | null, offset = 0): void {
  latest = next;
  clockOffset = offset;
  const before = prev;
  prev = next;
  if (!next || !before || before.code !== next.code) return;

  // Phase transitions
  if (before.phase !== next.phase) {
    if (next.phase === 'SELECTING') sfx.pop();
    else if (next.phase === 'PLAYING') sfx.go();
    else if (next.phase === 'ROUND_END') sfx.roundEnd();
    else if (next.phase === 'GAME_END') {
      const me = next.players.find((p) => p.id === next.youId);
      const best = Math.max(...next.teams.map((t) => t.score));
      const mine = next.teams.find((t) => t.id === me?.teamId);
      (mine && mine.score === best ? sfx.win : sfx.lose)();
    }
    return;
  }

  if (next.phase === 'LOBBY' && next.players.length > before.players.length) sfx.join();

  // My team's board
  const a = myBoard(before);
  const b = myBoard(next);
  if (a && b && next.phase === 'PLAYING') {
    const solvedA = a.progress.wordsSolved;
    const solvedB = b.progress.wordsSolved;
    if (solvedB > solvedA) {
      const allIn = b.slots.some((s, i) => s.allIn && !a.slots[i]?.solved);
      (allIn ? sfx.allIn : sfx.solved)();
    } else if (b.progress.lettersRevealed > a.progress.lettersRevealed) sfx.hit();
    else if (b.attemptsLeft < a.attemptsLeft) sfx.miss();
    if (a.status === 'active' && (b.status === 'failed' || b.status === 'timeout')) setTimeout(sfx.fail, 250);
  }
}

/** Chat pop for messages from other players. */
export function onChatMessage(msg: ChatMessage, youId: string | undefined): void {
  if (!msg.system && msg.authorId !== youId) sfx.pop();
}

// Last-5-seconds ticking on my active board.
function tickLoop(): void {
  const v = latest;
  const b = v ? myBoard(v) : undefined;
  if (!v || v.phase !== 'PLAYING' || !b || b.status !== 'active' || !b.endsAt) return;
  const left = Math.ceil((b.endsAt - (Date.now() + clockOffset)) / 1000);
  if (left >= 1 && left <= 5 && left !== lastTickSecond) {
    lastTickSecond = left;
    sfx.tick();
  }
}
tickTimer ??= setInterval(tickLoop, 200);
