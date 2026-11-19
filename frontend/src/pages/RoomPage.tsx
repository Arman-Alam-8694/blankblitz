import { useEffect, useState, type FormEvent } from 'react';
import { ROOM_KEY_LENGTH, nicknameSchema, type RoomView } from '@blankblitz/shared';
import { Chat } from '../components/Chat';
import { Game } from '../components/Game';
import { Lobby } from '../components/Lobby';
import { MatchSummary } from '../components/MatchSummary';
import { RoundEnd } from '../components/RoundEnd';
import { Selection } from '../components/Selection';
import { TeamPanel } from '../components/TeamPanel';
import { PhaseTimer } from '../components/common';
import { PrefToggles } from '../components/Prefs';
import { VoiceControls } from '../components/Voice';
import { clearHash, keyFromHash, navigate } from '../lib/router';
import { session } from '../lib/session';
import { enterRoom, leaveRoom, toast, useStore } from '../lib/store';

export function RoomPage({ code }: { code: string }) {
  const view = useStore((s) => s.view);
  const roomCode = useStore((s) => s.roomCode);
  const connected = useStore((s) => s.connected);
  const kicked = useStore((s) => s.kicked);
  const [needsNick, setNeedsNick] = useState(false);
  const [nick, setNick] = useState(session.nickname());
  // Password from the invite link (#k=…). Typed in by hand when the link didn't carry one.
  const [linkKey] = useState(keyFromHash);
  const [needsKey, setNeedsKey] = useState(false);
  const [key, setKey] = useState(linkKey ?? '');

  const isKeyError = (msg: string) => /private|password/i.test(msg);

  // Arriving via a shared link (or refresh): resume the seat or ask for a nickname.
  useEffect(() => {
    if (!connected || roomCode === code || kicked) return;
    const saved = session.nickname();
    if (!saved && !session.seat(code)) {
      setNeedsNick(true);
      return;
    }
    enterRoom(code, saved || 'Player', linkKey)
      .then(clearHash)
      .catch((err: Error) => {
        if (isKeyError(err.message)) {
          setNeedsNick(true);
          setNeedsKey(true);
          if (linkKey) toast(err.message);
          return;
        }
        toast(err.message);
        navigate('/', true);
      });
  }, [connected, code, roomCode, kicked, linkKey]);

  const submitNick = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = nicknameSchema.safeParse(nick);
    if (!parsed.success) return toast(parsed.error.issues[0]?.message ?? 'Invalid nickname');
    session.setNickname(parsed.data);
    try {
      await enterRoom(code, parsed.data, key.trim() || undefined);
      clearHash();
      setNeedsNick(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not join';
      toast(msg);
      if (isKeyError(msg)) setNeedsKey(true);
      else navigate('/', true);
    }
  };

  if (kicked) {
    return (
      <main className="center">
        <div className="card">
          <h2>You left the room</h2>
          <p>{kicked}</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Back to home
          </button>
        </div>
      </main>
    );
  }

  if (needsNick && roomCode !== code) {
    return (
      <main className="center">
        <form className="card" onSubmit={submitNick}>
          <h2>Join room {code}</h2>
          <label className="field">
            <span>Nickname</span>
            <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={16} autoFocus />
          </label>
          {needsKey && (
            <label className="field">
              <span>Room password (private room)</span>
              <input
                className="code-input"
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_KEY_LENGTH))}
                maxLength={ROOM_KEY_LENGTH}
                placeholder="PASSWORD"
                autoComplete="off"
              />
            </label>
          )}
          <button className="btn btn-primary" type="submit" disabled={!connected}>
            Join
          </button>
        </form>
      </main>
    );
  }

  if (!view) return <main className="center muted">Joining room {code}…</main>;

  return (
    <div className="room">
      <Header view={view} />
      <div className="room-body">
        <section className="room-main">
          <PhaseContent view={view} />
        </section>
        <aside className="room-side">
          <TeamPanel view={view} />
          <Chat view={view} />
        </aside>
      </div>
    </div>
  );
}

function PhaseContent({ view }: { view: RoomView }) {
  switch (view.phase) {
    case 'LOBBY':
      return <Lobby view={view} />;
    case 'SELECTING':
      return <Selection view={view} />;
    case 'PLAYING':
      return <Game view={view} />;
    case 'ROUND_END':
      return <RoundEnd view={view} />;
    case 'GAME_END':
      return <MatchSummary view={view} />;
  }
}

function Header({ view }: { view: RoomView }) {
  const leave = async () => {
    await leaveRoom();
    navigate('/');
  };
  return (
    <header className="room-header">
      <div className="room-title">
        <span className="logo small">
          Blank<span>Blitz</span>
        </span>
        <span className="code-chip" title="Room code">
          {view.code}
        </span>
        {view.phase !== 'LOBBY' && (
          <span className="muted">
            Round {view.round}/{view.totalRounds}
          </span>
        )}
      </div>
      <div className="scores">
        {view.teams.map((t) => (
          <span key={t.id} className="score-chip" style={{ borderColor: t.color }}>
            {t.emoji} {t.name} <b>{t.score}</b>
          </span>
        ))}
      </div>
      <div className="room-actions">
        <PhaseTimer view={view} />
        {view.settings.voice && <VoiceControls view={view} />}
        <PrefToggles />
        <button className="btn btn-small" onClick={leave}>
          Leave
        </button>
      </div>
    </header>
  );
}
