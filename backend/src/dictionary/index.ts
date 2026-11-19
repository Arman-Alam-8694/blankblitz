/**
 * English dictionary guardrail + word sources for auto-pick and bots.
 * Loaded once at startup into memory (~115k words of 4–8 letters, a few MB).
 */
import { readFileSync } from 'node:fs';
import wordListPath from 'word-list';
import { CATEGORIES, MAX_WORD_LENGTH, MIN_WORD_LENGTH, type Category, type WordDifficulty } from '@blankblitz/shared';
import { COMMON_WORDS } from './commonWords';
import { HARD_WORDS, MEDIUM_WORDS } from './tierWords';
import { pick } from '../utils/random';

export interface PickedWord {
  word: string;
  category: Category;
}

const VALID_RE = new RegExp(`^[A-Z]{${MIN_WORD_LENGTH},${MAX_WORD_LENGTH}}$`);

type Tier = Exclude<WordDifficulty, 'mixed'>;
const TIERS: Tier[] = ['easy', 'medium', 'hard'];

class Dictionary {
  private readonly all = new Set<string>();
  private readonly byLength = new Map<number, string[]>();
  private readonly tiers = new Map<Tier, { all: PickedWord[]; byLength: Map<number, PickedWord[]> }>();

  constructor() {
    const raw = readFileSync(wordListPath, 'utf8');
    for (const line of raw.split('\n')) this.add(line.trim().toUpperCase());

    // Hardest tier first, so a word listed in several tiers lands in the harder one.
    const sources: [Tier, Record<Category, string[]>][] = [['hard', HARD_WORDS], ['medium', MEDIUM_WORDS], ['easy', COMMON_WORDS]];
    const seen = new Set<string>();
    for (const [tier, lists] of sources) {
      const bucket = { all: [] as PickedWord[], byLength: new Map<number, PickedWord[]>() };
      this.tiers.set(tier, bucket);
      for (const category of CATEGORIES) {
        for (const w of lists[category]) {
          const word = w.toUpperCase();
          if (!VALID_RE.test(word) || seen.has(word)) continue;
          seen.add(word);
          this.add(word); // curated words (e.g. city names) are also valid guesses/picks
          const entry = { word, category };
          bucket.all.push(entry);
          const list = bucket.byLength.get(word.length) ?? [];
          list.push(entry);
          bucket.byLength.set(word.length, list);
        }
      }
    }
  }

  /** Number of curated auto-pick words per tier (for tests / diagnostics). */
  tierSize(tier: Tier): number {
    return this.tiers.get(tier)?.all.length ?? 0;
  }

  private add(word: string): void {
    if (!VALID_RE.test(word) || this.all.has(word)) return;
    this.all.add(word);
    const list = this.byLength.get(word.length) ?? [];
    list.push(word);
    this.byLength.set(word.length, list);
  }

  get size(): number {
    return this.all.size;
  }

  isValid(word: string): boolean {
    return this.all.has(word.toUpperCase());
  }

  /**
   * Random family-friendly word with a category clue, from the requested difficulty tier.
   * Falls back to neighbouring tiers when a tier has no word of the required length.
   */
  randomWord(length: number | 'any', exclude: ReadonlySet<string> = new Set(), difficulty: WordDifficulty = 'easy'): PickedWord {
    const first: Tier = difficulty === 'mixed' ? (pick(TIERS) as Tier) : difficulty;
    const order = [first, ...TIERS.filter((t) => t !== first).sort((a, b) => Math.abs(TIERS.indexOf(a) - TIERS.indexOf(first)) - Math.abs(TIERS.indexOf(b) - TIERS.indexOf(first)))];
    let fallback: PickedWord[] = [];
    for (const tier of order) {
      const bucket = this.tiers.get(tier);
      const pool = (length === 'any' ? bucket?.all : bucket?.byLength.get(length)) ?? [];
      const available = pool.filter((p) => !exclude.has(p.word));
      if (available.length > 0) return pick(available);
      if (fallback.length === 0) fallback = pool;
    }
    return pick(fallback.length > 0 ? fallback : (this.tiers.get('easy')?.all ?? []));
  }

  wordsOfLength(length: number): readonly string[] {
    return this.byLength.get(length) ?? [];
  }
}

let instance: Dictionary | null = null;
export function dictionary(): Dictionary {
  instance ??= new Dictionary();
  return instance;
}
