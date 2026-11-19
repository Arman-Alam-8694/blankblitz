/**
 * Pure board logic (no I/O, no timers) so it is trivially unit-testable.
 * A board is the set of secret words one team is guessing in a round.
 */
import {
  ALL_IN_PENALTY,
  SCORE,
  type BoardProgress,
  type BoardStatus,
  type BoardView,
  type SlotView,
} from '@blankblitz/shared';

export interface Slot {
  word: string;
  category: string | null;
  revealed: boolean[];
  guessed: Set<string>;
  wrong: Set<string>;
  solved: boolean;
  solvedBy: string | null;
  solvedAt: number | null;
  allIn: boolean;
}

export interface Relay {
  activeId: string | null;
  deadline: number | null;
}

export interface Board {
  teamId: number;
  setterTeamId: number;
  slots: Slot[];
  attemptsLeft: number;
  attemptsMax: number;
  durationMs: number;
  startsAt: number | null;
  endsAt: number | null;
  status: BoardStatus;
  points: number;
  relay: Relay | null;
}

export type GuessOutcome =
  | { kind: 'hit'; count: number; solvedWord: boolean }
  | { kind: 'miss' }
  | { kind: 'repeat' };

export function createSlot(word: string, category: string | null): Slot {
  return {
    word,
    category,
    revealed: Array.from({ length: word.length }, () => false),
    guessed: new Set(),
    wrong: new Set(),
    solved: false,
    solvedBy: null,
    solvedAt: null,
    allIn: false,
  };
}

export function createBoard(opts: {
  teamId: number;
  setterTeamId: number;
  words: { word: string; category: string | null }[];
  attempts: number;
  durationMs: number;
}): Board {
  return {
    teamId: opts.teamId,
    setterTeamId: opts.setterTeamId,
    slots: opts.words.map((w) => createSlot(w.word, w.category)),
    attemptsLeft: opts.attempts,
    attemptsMax: opts.attempts,
    durationMs: opts.durationMs,
    startsAt: null,
    endsAt: null,
    status: 'pending',
    points: 0,
    relay: null,
  };
}

export function startBoard(board: Board, startsAt: number): void {
  board.status = 'active';
  board.startsAt = startsAt;
  board.endsAt = startsAt + board.durationMs;
}

export function isPlayable(board: Board, now: number): boolean {
  return board.status === 'active' && board.startsAt !== null && now >= board.startsAt;
}

function secondsLeft(board: Board, now: number): number {
  return board.endsAt === null ? 0 : Math.max(0, Math.floor((board.endsAt - now) / 1000));
}

function markSolved(board: Board, slot: Slot, playerId: string, now: number, allIn: boolean): void {
  slot.solved = true;
  slot.solvedBy = playerId;
  slot.solvedAt = now;
  slot.allIn = allIn;
  slot.revealed.fill(true);
  board.points += SCORE.wordSolved + secondsLeft(board, now) * SCORE.perSecondLeft;
  if (allIn) board.points += SCORE.allInBonus;
}

/** Ends the board if every word is solved or attempts ran out. */
function settle(board: Board): void {
  if (board.slots.every((s) => s.solved)) {
    board.status = 'solved';
    board.points += board.attemptsLeft * SCORE.perAttemptLeft;
  } else if (board.attemptsLeft <= 0) {
    board.attemptsLeft = 0;
    board.status = 'failed';
  }
}

export function guessLetter(board: Board, slotIndex: number, letter: string, playerId: string, now: number): GuessOutcome {
  const slot = board.slots[slotIndex];
  if (!slot || slot.solved) return { kind: 'repeat' };
  if (slot.guessed.has(letter)) return { kind: 'repeat' };
  slot.guessed.add(letter);

  let count = 0;
  for (let i = 0; i < slot.word.length; i++) {
    if (slot.word[i] === letter && !slot.revealed[i]) {
      slot.revealed[i] = true;
      count++;
    }
  }
  if (count === 0) {
    slot.wrong.add(letter);
    board.attemptsLeft -= 1;
    settle(board);
    return { kind: 'miss' };
  }
  const solvedWord = slot.revealed.every(Boolean);
  if (solvedWord) markSolved(board, slot, playerId, now, false);
  settle(board);
  return { kind: 'hit', count, solvedWord };
}

export function solveWord(board: Board, slotIndex: number, guess: string, playerId: string, now: number): boolean {
  const slot = board.slots[slotIndex];
  if (!slot || slot.solved) return false;
  if (guess === slot.word) {
    markSolved(board, slot, playerId, now, true);
    settle(board);
    return true;
  }
  board.attemptsLeft -= ALL_IN_PENALTY;
  settle(board);
  return false;
}

/** Relay shot-clock expiry costs one attempt. */
export function penalise(board: Board, attempts: number): void {
  board.attemptsLeft -= attempts;
  settle(board);
}

export function timeoutBoard(board: Board): void {
  if (board.status === 'active' || board.status === 'pending') board.status = 'timeout';
}

export function isFinished(board: Board): boolean {
  return board.status === 'solved' || board.status === 'failed' || board.status === 'timeout';
}

export function progressOf(board: Board): BoardProgress {
  let lettersRevealed = 0;
  let lettersTotal = 0;
  let wordsSolved = 0;
  for (const s of board.slots) {
    lettersTotal += s.word.length;
    lettersRevealed += s.revealed.filter(Boolean).length;
    if (s.solved) wordsSolved++;
  }
  return { lettersRevealed, lettersTotal, wordsSolved, wordsTotal: board.slots.length };
}

/**
 * Build the client view. `detailed` exposes revealed letters; `reveal` exposes every secret
 * (only after the board/round is over). Unrevealed letters are never serialised otherwise.
 */
export function boardView(board: Board, detailed: boolean, reveal: boolean): BoardView {
  const showLetters = detailed || reveal;
  const slots: SlotView[] = board.slots.map((s) => {
    const view: SlotView = {
      length: s.word.length,
      category: s.category,
      solved: s.solved,
      solvedBy: s.solvedBy,
      allIn: s.allIn,
    };
    if (showLetters) {
      view.letters = [...s.word].map((ch, i) => (reveal || s.revealed[i] ? ch : null));
      view.guessed = [...s.guessed];
      view.wrong = [...s.wrong];
    }
    return view;
  });
  return {
    teamId: board.teamId,
    setterTeamId: board.setterTeamId,
    status: board.status,
    attemptsLeft: board.attemptsLeft,
    attemptsMax: board.attemptsMax,
    startsAt: board.startsAt,
    endsAt: board.endsAt,
    detailed: showLetters,
    slots,
    progress: progressOf(board),
    points: board.points,
    relay: board.relay
      ? { activePlayerId: board.relay.activeId, deadline: board.relay.deadline }
      : null,
  };
}
