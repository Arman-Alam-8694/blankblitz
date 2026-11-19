import { useState } from 'react';
import { voiceChannelOf, type PlayerView, type RoomView } from '@blankblitz/shared';
import { voice } from '../voice/engine';
import { useVoice, type MicState, type PeerTransport } from '../voice/voiceStore';
import { me } from './common';

const MIC_HINT: Record<MicState, string | null> = {
  on: null,
  off: null,
  denied: 'Mic blocked — listening only. Allow the microphone in your browser to talk.',
  unavailable: 'No microphone found — listening only.',
  insecure: 'Mic needs HTTPS (or localhost) — listening only on this address.',
};

/** Header controls: join / mute / leave + channel label and warnings. */
export function VoiceControls({ view }: { view: RoomView }) {
  const v = useVoice((s) => s);
  const you = me(view);
  if (!you) return null;
  const channel = voiceChannelOf(view.phase, you.teamId) === 'lobby' ? 'Lobby voice' : 'Team voice';

  if (!v.joined) {
    return (
      <span className="voice-controls">
        <button className="btn btn-small" disabled={v.joining} onClick={() => void voice.join()} title="Join voice chat">
          {v.joining ? '…' : '🎙️ Join voice'}
        </button>
        {v.error && <span className="voice-warn" title={v.error}>⚠️</span>}
      </span>
    );
  }

  const canTalk = v.mic === 'on';
  return (
    <span className="voice-controls">
      <span className={`voice-chip ${v.selfSpeaking ? 'speaking' : ''}`} title={channel}>
        {channel}
      </span>
      <button
        className={`btn btn-small btn-icon ${v.muted || !canTalk ? 'btn-danger' : ''}`}
        disabled={!canTalk}
        onClick={() => void voice.setMuted(!v.muted)}
        title={MIC_HINT[v.mic] ?? (v.muted ? 'Unmute mic' : 'Mute mic')}
        aria-label={v.muted ? 'Unmute microphone' : 'Mute microphone'}
      >
        {v.muted || !canTalk ? '🔇' : '🎙️'}
      </button>
      {v.needsGesture && (
        <button className="btn btn-small btn-accent" onClick={() => voice.resumeAudio()}>
          🔊 Enable audio
        </button>
      )}
      <button className="btn btn-small" onClick={() => void voice.leave()} title="Leave voice">
        ✕
      </button>
      {MIC_HINT[v.mic] && <span className="voice-warn" title={MIC_HINT[v.mic] ?? ''}>👂</span>}
    </span>
  );
}

const TRANSPORT_LABEL: Record<PeerTransport, string> = {
  connecting: 'connecting…',
  p2p: 'direct',
  relay: 'via server',
  failed: 'no route',
};

/** Per-player voice indicator + local mute / volume (only affects what *you* hear). */
export function VoiceBadge({ view, player }: { view: RoomView; player: PlayerView }) {
  const isMe = player.id === view.youId;
  const joined = useVoice((s) => s.joined);
  const selfSpeaking = useVoice((s) => s.selfSpeaking);
  const peer = useVoice((s) => s.peers[player.id]);
  const localMuted = useVoice((s) => s.localMuted[player.id] ?? false);
  const volume = useVoice((s) => s.volume[player.id] ?? 1);
  const [open, setOpen] = useState(false);
  if (!player.voice) return null;

  const speaking = isMe ? selfSpeaking : (peer?.speaking ?? false);
  const icon = !player.voice.mic ? '👂' : player.voice.muted ? '🔇' : '🎙️';
  const title = isMe
    ? 'You are in voice'
    : `${player.voice.mic ? (player.voice.muted ? 'Muted' : 'In voice') : 'Listening only'}${peer ? ` · ${TRANSPORT_LABEL[peer.transport]}` : ''}`;

  return (
    <span className="voice-badge">
      <span
        className={`badge voice-dot ${speaking ? 'speaking' : ''} ${peer?.transport === 'failed' ? 'badge-off' : ''}`}
        title={title}
        onClick={() => !isMe && joined && setOpen((o) => !o)}
        role={!isMe && joined ? 'button' : undefined}
      >
        {localMuted ? '🔕' : icon}
        {peer && peer.transport !== 'p2p' && <small> {peer.transport === 'relay' ? '⇄' : '…'}</small>}
      </span>
      {open && !isMe && (
        <span className="voice-menu">
          <button className="btn btn-tiny" onClick={() => voice.setPeerMuted(player.id, !localMuted)}>
            {localMuted ? 'Unmute for me' : 'Mute for me'}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => voice.setPeerVolume(player.id, Number(e.target.value))}
            aria-label={`Volume for ${player.name}`}
          />
        </span>
      )}
    </span>
  );
}
