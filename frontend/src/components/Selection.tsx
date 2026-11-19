import { useState } from 'react';
import { CATEGORIES, HINT_MAX, MAX_WORD_LENGTH, MIN_WORD_LENGTH, type RoomView, type SelectionSlotView } from '@blankblitz/shared';
import { request } from '../lib/socket';
import { act } from '../lib/store';
import { Countdown, playerName, teamOf } from './common';

export function Selection({ view }: { view: RoomView }) {
  const sel = view.selection;
  if (!sel) return <div className="card">Preparing words…</div>;
  const target = teamOf(view, sel.targetTeamId);
  const lengthText = sel.wordLength === 'any' ? `${MIN_WORD_LENGTH}–${MAX_WORD_LENGTH} letters` : `${sel.wordLength} letters`;

  return (
    <div className="card selection">
      <div className="row-between">
        <h2>
          Pick secret words for {target?.emoji} {target?.name}
        </h2>
        <Countdown deadline={view.phaseEndsAt} warnAt={5} />
      </div>
      <p className="muted">
        {lengthText}, must be a real English word. The round starts as soon as everyone locks in; if the timer runs
        out, a random word is chosen for you.
      </p>
      <div className="selection-slots">
        {sel.slots.map((slot) => (
          <SlotPicker key={slot.slotIndex} view={view} slot={slot} wordLength={sel.wordLength} />
        ))}
      </div>
    </div>
  );
}

function SlotPicker({ view, slot, wordLength }: { view: RoomView; slot: SelectionSlotView; wordLength: number | 'any' }) {
  const mine = slot.assignedTo === view.youId;
  const assignee = view.players.find((p) => p.id === slot.assignedTo);
  const canTakeOver = !mine && (!assignee || (!assignee.isBot && !assignee.connected));
  const [word, setWord] = useState('');
  const [category, setCategory] = useState<string>('');
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const custom = category === '__custom';

  const max = wordLength === 'any' ? MAX_WORD_LENGTH : wordLength;
  const min = wordLength === 'any' ? MIN_WORD_LENGTH : wordLength;
  const valid = word.length >= min && word.length <= max && (!custom || hint.trim().length >= 2);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    await act(() =>
      request('select:word', {
        slotIndex: slot.slotIndex,
        word,
        category: (CATEGORIES as readonly string[]).includes(category) ? (category as (typeof CATEGORIES)[number]) : null,
        hint: custom ? hint.trim() : null,
      }),
    );
    setBusy(false);
  };

  return (
    <div className={`slot-picker ${slot.locked ? 'locked' : ''}`}>
      <div className="muted small">
        Word {slot.slotIndex + 1} · {mine ? 'your pick' : playerName(view, slot.assignedTo)}
      </div>
      {mine || canTakeOver ? (
        <form
          className="picker-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            value={word}
            onChange={(e) => setWord(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, max))}
            placeholder={slot.word ?? 'SECRET'}
            aria-label="Secret word"
            autoComplete="off"
            spellCheck={false}
            className="word-input"
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category clue">
            <option value="">No clue</option>
            <option value="__custom">✏️ Custom hint…</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {custom && (
            <input
              className="hint-input"
              value={hint}
              onChange={(e) => setHint(e.target.value.slice(0, HINT_MAX))}
              maxLength={HINT_MAX}
              placeholder="Your hint (not the word!)"
              aria-label="Custom hint"
              autoComplete="off"
            />
          )}
          <button className="btn btn-primary" disabled={!valid || busy}>
            {slot.locked ? 'Change' : 'Lock in'}
          </button>
        </form>
      ) : null}
      <div className="slot-status">
        {slot.locked ? (
          <>
            ✅ <b>{slot.word ?? '••••'}</b> {slot.category && <span className="chip">{slot.category}</span>}
          </>
        ) : (
          <span className="muted">Waiting…</span>
        )}
      </div>
    </div>
  );
}
