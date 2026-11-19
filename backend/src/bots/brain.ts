/**
 * Bot decision making. Bots only see what a human teammate would see
 * (revealed letters + guessed letters) — never the secret word.
 */
import { ALPHABET, type BotLevel } from '@blankblitz/shared';
import { dictionary } from '../dictionary';
import type { Slot } from '../game/board';
import { between, pick } from '../utils/random';

export type BotAction = { kind: 'guess'; letter: string } | { kind: 'solve'; word: string };

/** English letter frequency order — used by casual bots and as a fallback. */
const FREQ = 'EARIOTNSLCUDPMHGBFYWKVXZJQ';

export function botDelayMs(level: BotLevel, speed: number): number {
  const [min, max] = level === 'medium' ? [1100, 2200] : [2500, 4800];
  return between(min, max) / speed;
}

/** Visible state of a slot from a player's perspective. */
interface VisibleSlot {
  pattern: (string | null)[];
  guessed: ReadonlySet<string>;
  wrong: ReadonlySet<string>;
}

export function visibleSlot(slot: Slot): VisibleSlot {
  return {
    pattern: [...slot.word].map((ch, i) => (slot.revealed[i] ? ch : null)),
    guessed: slot.guessed,
    wrong: slot.wrong,
  };
}

export function candidates(v: VisibleSlot): string[] {
  const revealedLetters = new Set(v.pattern.filter((c): c is string => c !== null));
  return dictionary()
    .wordsOfLength(v.pattern.length)
    .filter((w) => {
      for (let i = 0; i < w.length; i++) {
        const ch = w[i] as string;
        const known = v.pattern[i];
        if (known) {
          if (ch !== known) return false;
        } else if (revealedLetters.has(ch) || v.wrong.has(ch)) {
          // Hangman rules: a revealed letter is revealed everywhere, so blanks cannot hold it.
          return false;
        }
      }
      return true;
    });
}

function casual(v: VisibleSlot): BotAction {
  const options = [...ALPHABET].filter((l) => !v.guessed.has(l));
  // 60% follow letter frequency, 40% fully random — feels human, not robotic.
  if (Math.random() < 0.6) {
    const next = [...FREQ].find((l) => !v.guessed.has(l));
    if (next) return { kind: 'guess', letter: next };
  }
  return { kind: 'guess', letter: pick(options) };
}

function smart(v: VisibleSlot): BotAction {
  const words = candidates(v);
  if (words.length === 1 || (words.length === 2 && Math.random() < 0.5)) {
    return { kind: 'solve', word: pick(words) };
  }
  const counts = new Map<string, number>();
  for (const w of words) {
    for (const ch of new Set(w)) {
      if (!v.guessed.has(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
  if (ranked.length === 0) return casual(v);
  // Fallible: 20% of the time choose among the next-best few letters.
  if (Math.random() < 0.2 && ranked.length > 1) {
    return { kind: 'guess', letter: pick(ranked.slice(1, 5)) };
  }
  return { kind: 'guess', letter: ranked[0] as string };
}

export function decide(level: BotLevel, slot: Slot): BotAction {
  const v = visibleSlot(slot);
  return level === 'medium' ? smart(v) : casual(v);
}

const BOT_NAMES = [
  'Ada', 'Byte', 'Cleo', 'Dash', 'Echo', 'Fizz', 'Gizmo', 'Hex', 'Iggy', 'Juno',
  'Kiwi', 'Lumen', 'Milo', 'Nova', 'Orbit', 'Pixel', 'Quill', 'Rex', 'Sprocket', 'Tango',
];

export function botName(taken: ReadonlySet<string>): string {
  const free = BOT_NAMES.filter((n) => !taken.has(`[BOT] ${n}`));
  return `[BOT] ${free.length > 0 ? pick(free) : `Bot${Math.floor(Math.random() * 1000)}`}`;
}
