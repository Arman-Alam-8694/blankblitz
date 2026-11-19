import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CHAT_MAX, type ChatChannel, type RoomView } from '@blankblitz/shared';
import { chatHover, registerChatInput } from '../lib/focus';
import { request } from '../lib/socket';
import { act, useStore } from '../lib/store';
import { me, teamOf } from './common';

export function Chat({ view }: { view: RoomView }) {
  const messages = useStore((s) => s.chat);
  const inRound = view.phase === 'SELECTING' || view.phase === 'PLAYING';
  const [channel, setChannel] = useState<ChatChannel>(inRound ? 'team' : 'lobby');
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const you = me(view);

  // PRD: team chat during rounds, lobby chat between rounds.
  useEffect(() => {
    setChannel(inRound ? 'team' : 'lobby');
  }, [inRound]);

  const visible = messages.filter((m) => m.channel === channel);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [visible.length, channel]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const ok = await act(() => request('chat:send', { channel, text: t }).then(() => true));
    if (ok) setText('');
  };

  const lobbyLocked = channel === 'lobby' && inRound;
  const team = you ? teamOf(view, you.teamId) : undefined;

  return (
    <div className="card chat" onMouseEnter={chatHover}>
      <div className="tabs">
        <button className={`tab ${channel === 'team' ? 'tab-active' : ''}`} onClick={() => setChannel('team')}>
          {team?.emoji} Team
        </button>
        <button className={`tab ${channel === 'lobby' ? 'tab-active' : ''}`} onClick={() => setChannel('lobby')}>
          Lobby
        </button>
      </div>
      <div className="chat-list" ref={listRef}>
        {visible.length === 0 && <div className="muted small">No messages yet.</div>}
        {visible.map((m) => {
          const author = view.players.find((p) => p.id === m.authorId);
          const color = author ? teamOf(view, author.teamId)?.color : undefined;
          return (
            <div key={m.id} className={`msg ${m.system ? 'msg-system' : ''}`}>
              {!m.system && (
                <b style={{ color }}>{m.authorName}: </b>
              )}
              <span>{m.text}</span>
            </div>
          );
        })}
      </div>
      <form className="chat-form" onSubmit={send}>
        <input
          ref={registerChatInput}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={CHAT_MAX}
          disabled={lobbyLocked}
          placeholder={lobbyLocked ? 'Lobby chat opens between rounds' : channel === 'team' ? 'Message your team…' : 'Message everyone…'}
          aria-label="Chat message"
          autoComplete="off"
        />
        <button className="btn btn-small" disabled={lobbyLocked || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
