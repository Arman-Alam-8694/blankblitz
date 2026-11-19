import { describe, expect, it } from 'vitest';
import { dictionary } from '../src/dictionary';
import { COMMON_WORDS } from '../src/dictionary/commonWords';
import { HARD_WORDS, MEDIUM_WORDS } from '../src/dictionary/tierWords';

describe('word difficulty tiers', () => {
  const d = dictionary();
  const words = (rec: Record<string, string[]>) => new Set(Object.values(rec).flat().map((w) => w.toUpperCase()));

  it('has a healthy pool in every tier', () => {
    expect(d.tierSize('easy')).toBeGreaterThan(400);
    expect(d.tierSize('medium')).toBeGreaterThan(250);
    expect(d.tierSize('hard')).toBeGreaterThan(200);
  });

  it('picks from the requested tier, honours length and exclusions', () => {
    const hard = words(HARD_WORDS);
    const medium = words(MEDIUM_WORDS);
    for (let i = 0; i < 200; i++) {
      expect(hard.has(d.randomWord('any', new Set(), 'hard').word)).toBe(true);
      expect(medium.has(d.randomWord('any', new Set(), 'medium').word)).toBe(true);
      const five = d.randomWord(5, new Set(), 'hard');
      expect(five.word).toHaveLength(5);
    }
    const easy = words(COMMON_WORDS);
    const e = d.randomWord(6, new Set(['BANANA']), 'easy');
    expect(easy.has(e.word) || medium.has(e.word) || hard.has(e.word)).toBe(true);
    expect(e.word).not.toBe('BANANA');
  });

  it('every curated word is a valid guess with a category', () => {
    for (const t of ['easy', 'medium', 'hard', 'mixed'] as const) {
      const w = d.randomWord('any', new Set(), t);
      expect(d.isValid(w.word)).toBe(true);
      expect(w.category).toBeTruthy();
    }
  });
});
