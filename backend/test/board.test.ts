import { describe, expect, it } from 'vitest';
import { ALL_IN_PENALTY, SCORE } from '@blankblitz/shared';
import { boardView, createBoard, guessLetter, solveWord, startBoard } from '../src/game/board';
import { candidates, visibleSlot } from '../src/bots/brain';
import { dictionary } from '../src/dictionary';

function board(words: string[], attempts = 5) {
  const b = createBoard({
    teamId: 0,
    setterTeamId: 1,
    words: words.map((word) => ({ word, category: null })),
    attempts,
    durationMs: 60_000,
  });
  startBoard(b, 0);
  return b;
}

describe('board', () => {
  it('reveals every occurrence of a correct letter', () => {
    const b = board(['APPLE']);
    const r = guessLetter(b, 0, 'P', 'p1', 1000);
    expect(r).toEqual({ kind: 'hit', count: 2, solvedWord: false });
    expect(b.slots[0]?.revealed).toEqual([false, true, true, false, false]);
    expect(b.attemptsLeft).toBe(5);
  });

  it('costs one attempt per wrong letter and fails at zero', () => {
    const b = board(['APPLE'], 2);
    guessLetter(b, 0, 'Z', 'p1', 0);
    expect(b.attemptsLeft).toBe(1);
    guessLetter(b, 0, 'Q', 'p1', 0);
    expect(b.status).toBe('failed');
  });

  it('ignores repeated letters', () => {
    const b = board(['APPLE']);
    guessLetter(b, 0, 'Z', 'p1', 0);
    expect(guessLetter(b, 0, 'Z', 'p1', 0).kind).toBe('repeat');
    expect(b.attemptsLeft).toBe(4);
  });

  it('all-in: correct solves with bonus, wrong costs 2 attempts', () => {
    const b = board(['APPLE', 'MANGO'], 8);
    expect(solveWord(b, 0, 'APRIL', 'p1', 0)).toBe(false);
    expect(b.attemptsLeft).toBe(8 - ALL_IN_PENALTY);
    expect(solveWord(b, 0, 'APPLE', 'p1', 10_000)).toBe(true);
    expect(b.slots[0]?.allIn).toBe(true);
    expect(b.points).toBe(SCORE.wordSolved + 50 * SCORE.perSecondLeft + SCORE.allInBonus);
    expect(b.status).toBe('active');
    solveWord(b, 1, 'MANGO', 'p1', 10_000);
    expect(b.status).toBe('solved');
  });

  it('never leaks unrevealed letters in a non-revealed view', () => {
    const b = board(['APPLE']);
    guessLetter(b, 0, 'A', 'p1', 0);
    const hidden = boardView(b, false, false);
    expect(hidden.slots[0]?.letters).toBeUndefined();
    expect(JSON.stringify(hidden)).not.toContain('APPLE');
    const own = boardView(b, true, false);
    expect(own.slots[0]?.letters).toEqual(['A', null, null, null, null]);
    expect(JSON.stringify(own)).not.toContain('PPLE');
  });
});

describe('dictionary & bot brain', () => {
  it('validates words', () => {
    expect(dictionary().isValid('APPLE')).toBe(true);
    expect(dictionary().isValid('PARIS')).toBe(true);
    expect(dictionary().isValid('QZXVB')).toBe(false);
  });

  it('auto-picks words of the requested length', () => {
    for (const len of [4, 5, 6, 7, 8] as const) {
      expect(dictionary().randomWord(len).word).toHaveLength(len);
    }
  });

  it('filters candidates using hangman rules', () => {
    const b = board(['APPLE']);
    for (const l of ['P', 'L', 'E', 'Z']) guessLetter(b, 0, l, 'bot', 0);
    const list = candidates(visibleSlot(b.slots[0]!));
    expect(list).toContain('APPLE');
    expect(list.every((w) => /^.PPLE$/.test(w))).toBe(true);
  });
});
