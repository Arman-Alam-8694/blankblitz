import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  LANGUAGES,
  ROOM_CODE_LENGTH,
  ROOM_KEY_LENGTH,
  nicknameSchema,
  roomCodeSchema,
  type LanguageCode,
  type RoomSummary,
} from '@blankblitz/shared';
import { PrefToggles } from '../components/Prefs';
import { ProfileCard } from '../components/ProfileCard';
import { navigate } from '../lib/router';
import { request } from '../lib/socket';
import { avatarForJoin, session } from '../lib/session';
import { act, onJoined, toast, useStore } from '../lib/store';

const PHASE_LABEL: Record<RoomSummary['phase'], string> = {
  LOBBY: 'In lobby',
  SELECTING: 'Picking words',
  PLAYING: 'Playing',
  ROUND_END: 'Between rounds',
  GAME_END: 'Match over',
};

export const languageName = (code: string) => LANGUAGES.find((l) => l.code === code)?.name ?? code;

export function Landing() {
  const [nickname, setNickname] = useState(session.nickname());
  const [code, setCode] = useState('');
  const [joinKey, setJoinKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [language, setLanguageState] = useState<LanguageCode>(session.language());
  const [filter, setFilter] = useState<'mine' | 'all'>('mine');
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const connected = useStore((s) => s.connected);
  const kicked = useStore((s) => s.kicked);

  const setLanguage = (l: LanguageCode) => {
    session.setLanguage(l);
    setLanguageState(l);
  };

  const refresh = useCallback(async () => {
    if (!connected) return;
    try {
      setRooms(await request('rooms:list', filter === 'mine' ? { language } : {}));
    } catch {
      /* keep the last list */
    }
  }, [connected, filter, language]);

  // Poll the room browser while the landing page is open (cheap: a few hundred bytes).
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const validNick = (): string | null => {
    const parsed = nicknameSchema.safeParse(nickname);
    if (!parsed.success) {
      toast(parsed.error.issues[0]?.message ?? 'Invalid nickname');
      return null;
    }
    session.setNickname(parsed.data);
    return parsed.data;
  };

  const go = async (kind: 'create' | 'join' | 'quick', e?: FormEvent, joinCode?: string) => {
    e?.preventDefault();
    const nick = validNick();
    if (!nick || busy) return;
    let roomCode = '';
    if (kind === 'join') {
      const parsed = roomCodeSchema.safeParse(joinCode ?? code);
      if (!parsed.success) return toast(`Enter a valid ${ROOM_CODE_LENGTH}-character room code`);
      roomCode = parsed.data;
    }
    const avatar = avatarForJoin();
    setBusy(true);
    const res = await act(() =>
      kind === 'create'
        ? request('room:create', { nickname: nick, avatar, settings: { visibility, language } })
        : kind === 'quick'
          ? request('room:quick', { nickname: nick, avatar, language })
          : request('room:join', {
              code: roomCode,
              nickname: nick,
              avatar,
              sessionToken: session.seat(roomCode)?.sessionToken,
              // Typed password (private rooms). Room-list joins are public rooms: no password.
              ...(!joinCode && joinKey ? { key: joinKey } : {}),
            }),
    );
    setBusy(false);
    if (!res) return;
    onJoined(res.code, res.playerId, res.sessionToken);
    navigate(`/r/${res.code}`);
  };

  return (
    <main className="landing">
      <div className="landing-top">
        <PrefToggles />
      </div>
      <h1 className="logo">
        Blank<span>Blitz</span>
      </h1>
      <p className="tagline">Fast team word-guessing. No sign-up needed — just a nickname.</p>
      {kicked && <div className="notice">You were removed from the room: {kicked}</div>}

      <form className="card landing-card" onSubmit={(e) => go('create', e)}>
        <ProfileCard nickname={nickname} setNickname={setNickname} />

        <label className="field">
          <span>Chat language (words are always English)</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value as LanguageCode)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

        <div className="create-row">
          <div className="seg" role="radiogroup" aria-label="Room type">
            {(['private', 'public'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={visibility === v}
                className={`seg-btn ${visibility === v ? 'on' : ''}`}
                onClick={() => setVisibility(v)}
              >
                {v === 'private' ? '🔒 Private' : '🌍 Public'}
              </button>
            ))}
          </div>
          <button type="submit" className="btn btn-primary" disabled={!connected || busy}>
            Create room
          </button>
        </div>
        <p className="muted small hint">
          {visibility === 'private'
            ? 'Private: join with the invite link, or the code + password.'
            : 'Public: listed below so anyone can join.'}
          {visibility === 'private' && ' No password typing needed with the link.'}
        </p>

        <button type="button" className="btn btn-accent" disabled={!connected || busy} onClick={() => go('quick')}>
          🎲 Random join — drop me into a room that’s almost full
        </button>

        <div className="divider">or join with a code (+ password for private rooms)</div>
        <div className="join-row">
          <input
            className="code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            maxLength={ROOM_CODE_LENGTH}
            placeholder="ROOM CODE"
            aria-label="Room code"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void go('join');
              }
            }}
          />
          <input
            className="code-input key-input"
            value={joinKey}
            onChange={(e) => setJoinKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_KEY_LENGTH))}
            maxLength={ROOM_KEY_LENGTH}
            placeholder="PASSWORD"
            aria-label="Room password"
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void go('join');
              }
            }}
          />
          <button type="button" className="btn" disabled={!connected || busy} onClick={() => go('join')}>
            Join
          </button>
        </div>
      </form>

      <section className="card room-browser">
        <div className="row-between">
          <h3>Open rooms</h3>
          <div className="seg small" role="radiogroup" aria-label="Filter rooms">
            <button type="button" className={`seg-btn ${filter === 'mine' ? 'on' : ''}`} onClick={() => setFilter('mine')}>
              {languageName(language)}
            </button>
            <button type="button" className={`seg-btn ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
              All languages
            </button>
          </div>
        </div>
        {rooms === null ? (
          <p className="muted small">Loading…</p>
        ) : rooms.length === 0 ? (
          <p className="muted small">No open rooms right now — create a public one or hit Random join.</p>
        ) : (
          <ul className="room-list">
            {rooms.map((r) => (
              <li key={r.code} className="room-item">
                <div className="room-item-main">
                  <b>{r.hostName}</b>’s room
                  <span className="muted small">
                    {' '}
                    · {r.mode === 'blitz' ? 'Blitz' : 'Spotlight'} · {Array(r.teamCount).fill(r.teamSize).join('v')} ·{' '}
                    {languageName(r.language)}
                    {r.voice ? ' · 🎙️' : ''}
                  </span>
                </div>
                <span className={`pill ${r.phase === 'LOBBY' ? 'pill-good' : 'pill-live'}`}>{PHASE_LABEL[r.phase]}</span>
                <span className="small seats">
                  {r.humans}/{r.capacity}
                </span>
                <button type="button" className="btn btn-small" disabled={!connected || busy} onClick={() => go('join', undefined, r.code)}>
                  Join
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="muted small">1v1 up to 4v4 · Blitz &amp; Spotlight modes · bots fill empty seats</p>
    </main>
  );
}
