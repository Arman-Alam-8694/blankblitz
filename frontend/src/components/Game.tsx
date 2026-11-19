import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardView, RoomView, SlotView } from '@blankblitz/shared';
import { boardClick, boardHover, boardOwnsKeyboard } from '../lib/focus';
import { request, socket } from '../lib/socket';
import { act, toast, useStore } from '../lib/store';
import { secondsLeft, useNow } from '../lib/time';
import { Countdown, me, playerName, teamOf } from './common';

export function Game({ view }: { view: RoomView }) {
  const you = me(view);
  if (!you) return null;
  const spotlight = view.settings.mode === 'spotlight';
  const myBoard = view.boards.find((b) => b.teamId === you.teamId);
  const stage = spotlight ? view.boards.find((b) => b.teamId === view.activeTeamId) : myBoard;
  const myTurn = stage?.teamId === you.teamId;
  const others = view.boards.filter((b) => b !== stage);

  return (
    <div className="game">
      {spotlight && stage && (
        <div className="spotlight-banner" style={{ borderColor: teamOf(view, stage.teamId)?.color }}>
          🔦 Spotlight: {teamOf(view, stage.teamId)?.emoji} {teamOf(view, stage.teamId)?.name}{' '}
          {myTurn ? '— your team is on stage!' : '— spectating live'}
        </div>
      )}
      {stage ? (
        <PlayBoard key={`${view.round}-${stage.teamId}`} view={view} board={stage} interactive={myTurn} />
      ) : (
        <div className="card">Waiting for the next board…</div>
      )}

      <div className="opponents">
        {others.map((b) => (
          <OpponentBar key={b.teamId} view={view} board={b} />
        ))}
      </div>

      {view.selection && (
        <div className="card set-words small">
          Your team set for {teamOf(view, view.selection.targetTeamId)?.name}:{' '}
          {view.selection.slots.map((s) => (
            <span key={s.slotIndex} className="chip">
              {s.word ?? '…'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function OpponentBar({ view, board }: { view: RoomView; board: BoardView }) {
  const team = teamOf(view, board.teamId);
  const p = board.progress;
  const pct = p.lettersTotal ? Math.round((p.lettersRevealed / p.lettersTotal) * 100) : 0;
  return (
    <div className="card opponent" style={{ borderLeftColor: team?.color }}>
      <div className="row-between">
        <b>
          {team?.emoji} {team?.name}
        </b>
        <StatusPill board={board} />
      </div>
      <div className="progress">
        <div className="progress-fill" style={{ width: `${pct}%`, background: team?.color }} />
      </div>
      <div className="row-between small">
        <span>
          {p.wordsTotal === 1
            ? `${p.lettersRevealed} / ${p.lettersTotal} letters`
            : `${p.wordsSolved} / ${p.wordsTotal} words solved`}
        </span>
        <span>
          ❤️ {board.attemptsLeft}/{board.attemptsMax}
        </span>
        {board.status === 'active' && <Countdown deadline={board.endsAt} />}
      </div>
      {board.detailed && board.status !== 'pending' && (
        <div className="mini-board">
          {board.slots.map((s, i) => (
            <div key={i} className="mini-word">
              {(s.letters ?? Array(s.length).fill(null)).map((l, j) => (
                <span key={j} className={`mini-tile ${l ? 'filled' : ''}`}>
                  {l ?? ''}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPill({ board }: { board: BoardView }) {
  const map = {
    pending: ['Waiting', 'pill'],
    active: ['Guessing', 'pill pill-live'],
    solved: ['Solved!', 'pill pill-good'],
    failed: ['Out of attempts', 'pill pill-bad'],
    timeout: ['Time up', 'pill pill-bad'],
  } as const;
  const [label, cls] = map[board.status];
  return <span className={cls}>{label}</span>;
}

/** Main interactive board: hover-activated keyboard, ghost previews, All-In solve. */
function PlayBoard({ view, board, interactive }: { view: RoomView; board: BoardView; interactive: boolean }) {
  const now = useNow(200);
  const you = me(view);
  const team = teamOf(view, board.teamId);
  const firstOpen = Math.max(0, board.slots.findIndex((s) => !s.solved));
  const [selected, setSelected] = useState(firstOpen);
  const [solveMode, setSolveMode] = useState(false);
  const [buffer, setBuffer] = useState('');
  const pending = useRef(new Set<string>());
  const lastGhost = useRef('');

  const slot: SlotView | undefined = board.slots[selected];

  // Auto-advance selection when the selected word is solved.
  useEffect(() => {
    if (slot?.solved) {
      const next = board.slots.findIndex((s) => !s.solved);
      if (next >= 0) setSelected(next);
      setSolveMode(false);
      setBuffer('');
    }
  }, [slot?.solved, board.slots]);

  const started = board.startsAt !== null && now >= board.startsAt;
  const active = board.status === 'active' && started;
  const control = useMemo(() => {
    if (!interactive || !you) return { can: false, reason: 'Spectating' };
    if (you.revoked) return { can: false, reason: 'Your input was revoked by team vote — suggest with ghost previews' };
    const mode = view.settings.inputControl;
    if (mode === 'captain') {
      const cap = team?.captainId;
      return cap === you.id
        ? { can: true, reason: 'You are captain — you have the keyboard' }
        : { can: false, reason: `Captain ${playerName(view, cap)} has the keyboard — your keys send ghost previews` };
    }
    if (mode === 'relay') {
      const id = board.relay?.activePlayerId;
      return id === you.id
        ? { can: true, reason: 'Your shot! Guess before the shot-clock runs out' }
        : { can: false, reason: `${playerName(view, id)} is shooting — your keys send ghost previews` };
    }
    return { can: true, reason: 'Open input — anyone on the team can guess' };
  }, [interactive, you, view, team, board.relay]);
  const canSubmit = control.can && active;

  const sendGhost = useCallback(
    (letter: string | null) => {
      if (!interactive) return;
      const key = `${selected}:${letter}`;
      if (key === lastGhost.current) return;
      lastGhost.current = key;
      socket.emit('play:ghost', { slot: selected, letter });
    },
    [interactive, selected],
  );

  const guess = useCallback(
    async (letter: string) => {
      if (!slot || slot.solved) return;
      if (!canSubmit) return sendGhost(letter);
      if (slot.guessed?.includes(letter) || pending.current.has(letter)) return;
      pending.current.add(letter);
      await act(() => request('play:guess', { slot: selected, letter }));
      pending.current.delete(letter);
    },
    [slot, canSubmit, selected, sendGhost],
  );

  const submitSolve = useCallback(async () => {
    if (!slot || buffer.length !== slot.length) return toast(`The word has ${slot?.length ?? 0} letters`);
    const word = buffer;
    setBuffer('');
    setSolveMode(false);
    const res = await act(() => request('play:solve', { slot: selected, word }));
    if (res) toast(res.correct ? `ALL-IN! ${word} is correct 🎯` : `${word} is wrong — −2 attempts`, res.correct ? 'info' : 'error');
  }, [buffer, slot, selected]);

  const press = useCallback(
    (key: string) => {
      if (!slot) return;
      if (key === 'LEFT' || key === 'RIGHT') {
        const dir = key === 'LEFT' ? -1 : 1;
        const n = board.slots.length;
        setSelected((cur) => (cur + dir + n) % n);
        setBuffer('');
        return;
      }
      if (solveMode) {
        if (key === 'ENTER') void submitSolve();
        else if (key === 'BACK') setBuffer((b) => b.slice(0, -1));
        else if (key === 'ESC' || key === 'SOLVE') {
          setSolveMode(false);
          setBuffer('');
        } else if (/^[A-Z]$/.test(key)) setBuffer((b) => (b.length < slot.length ? b + key : b));
        return;
      }
      if (key === 'ENTER' || key === 'SOLVE') {
        if (canSubmit && !slot.solved) setSolveMode(true);
        return;
      }
      if (/^[A-Z]$/.test(key)) void guess(key);
    },
    [slot, solveMode, canSubmit, guess, submitSolve, board.slots.length],
  );

  // Physical keyboard (only when focus isn't in a text field — see lib/focus).
  useEffect(() => {
    if (!interactive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || !boardOwnsKeyboard(e)) return;
      const map: Record<string, string> = {
        ArrowLeft: 'LEFT',
        ArrowRight: 'RIGHT',
        Enter: 'ENTER',
        Backspace: 'BACK',
        Escape: 'ESC',
      };
      const k = map[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : '');
      if (!k || (!map[e.key] && !/^[A-Z]$/.test(k))) return;
      e.preventDefault();
      press(k);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [interactive, press]);

  const ghosts = useStore((s) => s.ghosts);
  const teammateGhosts = Object.values(ghosts).filter(
    (g) => g.playerId !== view.youId && g.letter && now - g.at < 2500 && view.players.find((p) => p.id === g.playerId)?.teamId === board.teamId,
  );

  const countdown = board.startsAt && now < board.startsAt ? secondsLeft(board.startsAt, now) : 0;

  return (
    <div
      className={`card board ${canSubmit ? 'board-live' : ''}`}
      style={{ borderColor: team?.color }}
      onMouseEnter={boardHover}
      onMouseDown={boardClick}
    >
      <div className="row-between board-head">
        <div>
          <b>
            {team?.emoji} {team?.name}
          </b>{' '}
          <StatusPill board={board} />
        </div>
        <div className="board-stats">
          <span title="Attempts left" className={board.attemptsLeft <= 2 ? 'warn' : ''}>
            ❤️ {board.attemptsLeft}/{board.attemptsMax}
          </span>
          <span>⭐ {board.points}</span>
          {board.status === 'active' && <Countdown deadline={board.endsAt} />}
        </div>
      </div>

      {countdown > 0 && <div className="get-ready">Get ready… {countdown}</div>}

      <div className="words">
        {board.slots.map((s, i) => (
          <div
            key={i}
            className={`word ${i === selected && interactive ? 'word-selected' : ''} ${s.solved ? 'word-solved' : ''}`}
            onClick={() => {
              setSelected(i);
              setBuffer('');
            }}
          >
            <div className="tiles">
              {Array.from({ length: s.length }, (_, j) => {
                const letter = s.letters?.[j] ?? null;
                const typed = solveMode && i === selected && !s.solved ? (buffer[j] ?? '') : '';
                return (
                  <span key={j} className={`tile ${letter ? 'tile-filled' : ''} ${typed ? 'tile-typed' : ''}`}>
                    {typed || letter || ''}
                  </span>
                );
              })}
            </div>
            <div className="word-meta small">
              {s.category && <span className="chip">{s.category}</span>}
              {s.solved && <span className="muted">solved by {playerName(view, s.solvedBy)}{s.allIn ? ' (ALL-IN)' : ''}</span>}
              {s.wrong && s.wrong.length > 0 && <span className="wrong-letters">✗ {s.wrong.join(' ')}</span>}
            </div>
            <div className="ghosts">
              {teammateGhosts
                .filter((g) => g.slot === i)
                .map((g) => (
                  <span key={g.playerId} className="ghost-chip">
                    👻 {playerName(view, g.playerId)}: {g.letter}
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>

      {interactive && (
        <>
          <div className={`control-hint ${canSubmit ? 'good' : ''}`}>
            {board.relay && board.status === 'active' && (
              <span className="relay">
                🏀 {playerName(view, board.relay.activePlayerId)} · {secondsLeft(board.relay.deadline, now)}s
              </span>
            )}{' '}
            {solveMode ? 'ALL-IN: type the full word, Enter to submit, Esc to cancel (wrong = −2 attempts)' : control.reason}
          </div>
          <Keyboard slot={slot} onKey={press} onHover={canSubmit ? undefined : sendGhost} solveMode={solveMode} canSolve={canSubmit} />
        </>
      )}
    </div>
  );
}

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

function Keyboard(props: {
  slot: SlotView | undefined;
  onKey: (k: string) => void;
  onHover?: (letter: string | null) => void;
  solveMode: boolean;
  canSolve: boolean;
}) {
  const { slot } = props;
  const revealed = new Set((slot?.letters ?? []).filter((l): l is string => !!l));
  const wrong = new Set(slot?.wrong ?? []);
  return (
    <div className="keyboard" onMouseLeave={() => props.onHover?.(null)}>
      {ROWS.map((row, r) => (
        <div key={row} className="kb-row">
          {r === 2 && (
            <button className="key key-wide" onClick={() => props.onKey('LEFT')} aria-label="Previous word">
              ◀
            </button>
          )}
          {[...row].map((l) => {
            const state = !props.solveMode && wrong.has(l) ? 'key-wrong' : !props.solveMode && revealed.has(l) ? 'key-hit' : '';
            return (
              <button
                key={l}
                className={`key ${state}`}
                disabled={!props.solveMode && (wrong.has(l) || revealed.has(l))}
                onClick={() => props.onKey(l)}
                onMouseEnter={() => props.onHover?.(l)}
              >
                {l}
              </button>
            );
          })}
          {r === 2 && (
            <button className="key key-wide" onClick={() => props.onKey('RIGHT')} aria-label="Next word">
              ▶
            </button>
          )}
        </div>
      ))}
      <div className="kb-row">
        {props.solveMode ? (
          <>
            <button className="key key-wide" onClick={() => props.onKey('ESC')}>
              Cancel
            </button>
            <button className="key key-wide" onClick={() => props.onKey('BACK')}>
              ⌫
            </button>
            <button className="key key-wide key-solve" onClick={() => props.onKey('ENTER')}>
              Submit ALL-IN
            </button>
          </>
        ) : (
          <button className="key key-wide key-solve" disabled={!props.canSolve} onClick={() => props.onKey('SOLVE')}>
            ALL-IN solve (Enter)
          </button>
        )}
      </div>
      <div className="muted small kb-hint">Hover the board, then type A–Z · ←/→ switch word · Enter = ALL-IN</div>
    </div>
  );
}

