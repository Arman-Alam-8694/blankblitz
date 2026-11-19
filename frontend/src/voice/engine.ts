/**
 * VoiceEngine — owns the microphone, one Peer per remote voice participant,
 * the server-relay fallback, and channel gating (team vs lobby voice).
 *
 * Design choices:
 *  - Full mesh with every voice participant in the room, kept alive across phase
 *    changes. Switching team ↔ lobby voice only swaps tracks (no renegotiation),
 *    so it is instant and can't fail mid-game.
 *  - Per pair transport: P2P (STUN/TURN) when it connects, otherwise our own server
 *    relay over the existing WebSocket. Switches back to P2P automatically.
 *  - Sending is gated by the sender, playback by the receiver; the server enforces
 *    the same rules on the relay path.
 */
import {
  RELAY_MAX_BYTES,
  voiceChannelOf,
  type PlayerView,
  type RoomView,
  type VoiceFrameIn,
  type VoiceJoinResult,
  type VoiceSignal,
} from '@blankblitz/shared';
import { request, socket } from '../lib/socket';
import { Peer, type PeerStatus } from './Peer';
import { getVoice, setVoice, type MicState, type PeerTransport } from './voiceStore';

interface RelayPlayer {
  node: AudioWorkletNode;
  gain: GainNode;
  lastFrameAt: number;
}

const FRAMES_PER_PACKET = 3; // 60 ms per WebSocket message
const SPEAKING_THRESHOLD = 0.02;
const MIC_PROMPT_TIMEOUT_MS = 8000;

class VoiceEngine {
  private want = false; // user intends to be in voice (survives reconnects)
  private cfg: VoiceJoinResult | null = null;
  private view: RoomView | null = null;
  private ctx: AudioContext | null = null;
  private workletReady = false;
  private mic: MediaStream | null = null;
  private readonly peers = new Map<string, Peer>();
  private readonly peerStatus = new Map<string, PeerStatus>();
  private readonly relayPlayers = new Map<string, RelayPlayer>();
  private readonly analysers = new Map<string, AnalyserNode>();
  private micAnalyser: AnalyserNode | null = null;
  private capture: AudioWorkletNode | null = null;
  private pending: Uint8Array[] = [];
  private lastCaptured = 0;
  private seq = 0;
  private meter: ReturnType<typeof setInterval> | null = null;
  private rejoining = false;
  /** Support/debug switch: append ?voice=relay to the URL to force the server-relay path. */
  private readonly localForceRelay = new URLSearchParams(location.search).get('voice') === 'relay';

  constructor() {
    socket.on('voice:signal', (s) => this.onSignal(s));
    socket.on('voice:frame', (f) => this.onFrame(f));
    socket.on('disconnect', () => this.dropNetworkState());
    navigator.mediaDevices?.addEventListener?.('devicechange', () => void this.recoverMic());
  }

  // ───────────────────────── public API ─────────────────────────

  async join(): Promise<void> {
    if (getVoice().joined || getVoice().joining) return;
    setVoice({ joining: true, error: null });
    try {
      // Must run inside the click handler's task so autoplay is allowed.
      try {
        this.ctx ??= new AudioContext({ latencyHint: 'interactive' });
        void this.ctx.resume().catch(() => undefined);
      } catch {
        this.ctx = null; // no Web Audio: P2P still works, relay & meters disabled
      }
      await this.loadWorklet();
      await this.acquireMic();
      this.want = true;
      await this.connect();
      this.startMeter();
    } catch (err) {
      this.want = false;
      setVoice({ error: err instanceof Error ? err.message : 'Could not join voice' });
      this.teardown();
    } finally {
      setVoice({ joining: false });
    }
  }

  async leave(): Promise<void> {
    this.want = false;
    if (socket.connected && getVoice().joined) await request('voice:leave').catch(() => undefined);
    this.teardown();
  }

  async setMuted(muted: boolean): Promise<void> {
    setVoice({ muted });
    this.apply();
    if (getVoice().joined) await request('voice:mute', { muted }).catch(() => undefined);
  }

  setPeerMuted(id: string, muted: boolean): void {
    setVoice({ localMuted: { ...getVoice().localMuted, [id]: muted } });
    this.apply();
  }

  setPeerVolume(id: string, volume: number): void {
    setVoice({ volume: { ...getVoice().volume, [id]: Math.max(0, Math.min(1, volume)) } });
    this.apply();
  }

  /** Browsers may block audio until a gesture; the UI calls this from a click. */
  resumeAudio(): void {
    void this.ctx?.resume();
    for (const p of this.peers.values()) void p.audio.play().catch(() => undefined);
    setVoice({ needsGesture: false });
  }

  /** Called with every room snapshot. */
  sync(view: RoomView | null): void {
    this.view = view;
    if (!view) {
      if (getVoice().joined || this.want) void this.leave();
      return;
    }
    if (!view.settings.voice) {
      if (getVoice().joined) this.teardown();
      this.want = false;
      return;
    }
    const me = this.me();
    // Server dropped our presence (e.g. after a reconnect) — re-join transparently.
    if (this.want && socket.connected && me && !me.voice && !getVoice().joining && !this.rejoining) {
      this.rejoining = true;
      this.connect()
        .catch(() => setVoice({ error: 'Voice reconnect failed — retrying…' }))
        .finally(() => (this.rejoining = false));
      return;
    }
    if (!getVoice().joined || !this.cfg || !me?.voice) return;
    this.reconcilePeers(view, me);
    this.apply();
  }

  // ───────────────────────── setup ─────────────────────────

  private async connect(): Promise<void> {
    this.closePeers(); // new session → all links are rebuilt
    const cfg = await request('voice:join', { mic: getVoice().mic === 'on' });
    this.cfg = cfg;
    setVoice({ joined: true, error: null });
    if (getVoice().muted) await request('voice:mute', { muted: true }).catch(() => undefined);
    if (this.view) this.sync(this.view);
  }

  private async loadWorklet(): Promise<void> {
    if (this.workletReady || !this.ctx?.audioWorklet) return;
    try {
      await this.ctx.audioWorklet.addModule('/voice-worklets.js');
      this.workletReady = true;
    } catch (err) {
      console.warn('[voice] relay worklet unavailable', err); // P2P still works
    }
  }

  private async acquireMic(): Promise<void> {
    let mic: MicState = 'on';
    if (!window.isSecureContext) mic = 'insecure';
    else if (!navigator.mediaDevices?.getUserMedia) mic = 'unavailable';
    else {
      const ask = navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        video: false,
      });
      try {
        // An unanswered permission prompt must not block joining: go listen-only,
        // then upgrade automatically if the user allows the mic later.
        const stream = await Promise.race([
          ask,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), MIC_PROMPT_TIMEOUT_MS)),
        ]);
        if (!stream) {
          setVoice({ mic: 'denied' });
          ask
            .then((late) => {
              if (!this.want) return late.getTracks().forEach((t) => t.stop());
              this.adoptMic(late);
              void this.connect(); // re-announce with mic: true
            })
            .catch(() => undefined);
          return;
        }
        this.adoptMic(stream);
      } catch (err) {
        const name = (err as DOMException)?.name;
        mic = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable';
        this.mic = null;
      }
    }
    // Listen-only is a valid mode: you can still hear your team.
    setVoice({ mic });
  }

  private adoptMic(stream: MediaStream): void {
    this.mic = stream;
    stream.getAudioTracks()[0]?.addEventListener('ended', () => void this.recoverMic());
    this.setupMicGraph();
    setVoice({ mic: 'on' });
  }

  private setupMicGraph(): void {
    if (!this.ctx || !this.mic) return;
    const src = this.ctx.createMediaStreamSource(this.mic);
    this.micAnalyser = this.ctx.createAnalyser();
    this.micAnalyser.fftSize = 512;
    src.connect(this.micAnalyser);
    if (this.workletReady) {
      this.capture?.disconnect();
      this.capture = new AudioWorkletNode(this.ctx, 'bb-capture', { numberOfOutputs: 1 });
      this.capture.port.onmessage = (e: MessageEvent<ArrayBuffer>) => this.onCaptured(new Uint8Array(e.data));
      const sink = this.ctx.createGain();
      sink.gain.value = 0; // keep the node pulled by the graph without audible output
      src.connect(this.capture).connect(sink).connect(this.ctx.destination);
    }
  }

  /** Mic unplugged / revoked mid-game: try to get it back, otherwise go listen-only. */
  private async recoverMic(): Promise<void> {
    if (!getVoice().joined) return;
    const live = this.mic?.getAudioTracks().some((t) => t.readyState === 'live');
    if (live) return;
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    await this.acquireMic();
    this.apply();
  }

  // ───────────────────────── peers ─────────────────────────

  private me(): PlayerView | undefined {
    return this.view?.players.find((p) => p.id === this.view?.youId);
  }

  private p2pAllowed(): boolean {
    return typeof RTCPeerConnection !== 'undefined' && !this.cfg?.forceRelay && !this.localForceRelay;
  }

  private reconcilePeers(view: RoomView, me: PlayerView): void {
    const wanted = new Map(
      view.players.filter((p) => p.id !== me.id && p.voice && p.connected).map((p) => [p.id, p.voice!.session]),
    );
    for (const [id, peer] of this.peers) {
      if (wanted.get(id) !== peer.session) this.closePeer(id);
    }
    for (const id of [...this.peerStatus.keys()]) {
      if (!wanted.has(id)) this.closePeer(id);
    }
    for (const [id, session] of wanted) {
      if (this.peers.has(id) || this.peerStatus.has(id)) continue;
      if (!this.p2pAllowed()) {
        this.peerStatus.set(id, 'down'); // relay-only
        continue;
      }
      this.createPeer(id, session, me.id < id);
    }
    this.publishPeers();
  }

  private createPeer(id: string, session: string, polite: boolean): Peer {
    const peer = new Peer({
      id,
      session,
      polite,
      iceServers: this.cfg?.iceServers ?? [],
      send: (msg) => socket.emit('voice:signal', { ...msg, to: id, toSession: session }),
      onStatus: (s) => {
        this.peerStatus.set(id, s);
        this.publishPeers();
        this.apply();
      },
      onStream: (stream) => {
        this.attachAnalyser(id, stream);
        this.apply();
        peer.audio.play().catch(() => setVoice({ needsGesture: true }));
      },
    });
    this.peers.set(id, peer);
    this.peerStatus.set(id, 'connecting');
    return peer;
  }

  private attachAnalyser(id: string, stream: MediaStream): void {
    if (!this.ctx) return;
    try {
      const a = this.ctx.createAnalyser();
      a.fftSize = 512;
      this.ctx.createMediaStreamSource(stream).connect(a);
      this.analysers.set(id, a);
    } catch {
      /* speaking indicator is cosmetic */
    }
  }

  private onSignal(s: VoiceSignal): void {
    try {
      this.routeSignal(s);
    } catch (err) {
      console.warn('[voice] signal dropped', err);
    }
  }

  private routeSignal(s: VoiceSignal): void {
    if (!getVoice().joined || !this.p2pAllowed()) return;
    let peer = this.peers.get(s.from);
    if (!peer || peer.session !== s.fromSession) {
      const remote = this.view?.players.find((p) => p.id === s.from);
      const me = this.me();
      if (!me || remote?.voice?.session !== s.fromSession) return; // stale session
      if (peer) this.closePeer(s.from);
      peer = this.createPeer(s.from, s.fromSession, me.id < s.from);
      this.publishPeers();
    }
    void peer.handle(s);
  }

  private transport(id: string): PeerTransport {
    const s = this.peerStatus.get(id);
    if (s === 'p2p') return 'p2p';
    if (s === 'connecting') return 'connecting';
    return this.cfg?.relay && this.workletReady ? 'relay' : 'failed';
  }

  private publishPeers(): void {
    const prev = getVoice().peers;
    const peers: Record<string, { transport: PeerTransport; speaking: boolean }> = {};
    for (const id of this.peerStatus.keys()) {
      peers[id] = { transport: this.transport(id), speaking: prev[id]?.speaking ?? false };
    }
    setVoice({ peers });
  }

  private closePeer(id: string): void {
    this.peers.get(id)?.close();
    this.peers.delete(id);
    this.peerStatus.delete(id);
    this.analysers.delete(id);
    const rp = this.relayPlayers.get(id);
    if (rp) {
      rp.node.disconnect();
      rp.gain.disconnect();
      this.relayPlayers.delete(id);
    }
  }

  private closePeers(): void {
    for (const id of [...this.peerStatus.keys()]) this.closePeer(id);
    setVoice({ peers: {} });
  }

  // ───────────────────────── routing ─────────────────────────

  /** Can I currently talk to / hear this player? (team voice in rounds, lobby voice otherwise) */
  private routes(other: PlayerView): { send: boolean; hear: boolean; volume: number } {
    const me = this.me();
    const v = getVoice();
    if (!me || !this.view || !other.voice) return { send: false, hear: false, volume: 0 };
    const mine = voiceChannelOf(this.view.phase, me.teamId);
    const theirs = voiceChannelOf(this.view.phase, other.teamId);
    const same = mine === theirs;
    const teamVoice = mine !== 'lobby';
    const send = same && v.mic === 'on' && !v.muted && !(me.teamMuted && teamVoice);
    const hear = same && !other.voice.muted && !v.localMuted[other.id] && !(other.teamMuted && teamVoice);
    return { send, hear, volume: v.volume[other.id] ?? 1 };
  }

  private apply(): void {
    if (!this.view || !getVoice().joined) return;
    const micTrack = this.mic?.getAudioTracks()[0] ?? null;
    let relaySending = false;
    for (const id of this.peerStatus.keys()) {
      const other = this.view.players.find((p) => p.id === id);
      if (!other) continue;
      const r = this.routes(other);
      const transport = this.transport(id);
      const peer = this.peers.get(id);
      if (peer) {
        peer.setTrack(r.send && transport === 'p2p' ? micTrack : null);
        peer.audio.muted = !r.hear || transport !== 'p2p';
        peer.audio.volume = r.volume;
      }
      const rp = this.relayPlayers.get(id);
      if (rp) rp.gain.gain.value = r.hear && transport !== 'p2p' ? r.volume : 0;
      if (r.send && transport === 'relay') relaySending = true;
    }
    this.capture?.port.postMessage({ enabled: relaySending });
  }

  // ───────────────────────── relay path ─────────────────────────

  private onCaptured(frame: Uint8Array): void {
    const now = performance.now();
    if (now - this.lastCaptured > 100) this.pending = []; // new utterance: drop stale tail
    this.lastCaptured = now;
    this.pending.push(frame);
    if (this.pending.length < FRAMES_PER_PACKET) return;
    const total = this.pending.reduce((n, f) => n + f.length, 0);
    const packet = new Uint8Array(Math.min(total, RELAY_MAX_BYTES));
    let off = 0;
    for (const f of this.pending) {
      if (off + f.length > packet.length) break;
      packet.set(f, off);
      off += f.length;
    }
    this.pending = [];
    const targets = [...this.peerStatus.keys()].filter((id) => {
      const other = this.view?.players.find((p) => p.id === id);
      return other && this.transport(id) === 'relay' && this.routes(other).send;
    });
    if (targets.length === 0 || !socket.connected) return;
    // volatile: under congestion drop audio instead of building up delay
    socket.volatile.emit('voice:frame', { to: targets, seq: this.seq++, data: packet });
  }

  private onFrame(f: VoiceFrameIn): void {
    if (!getVoice().joined || !this.ctx || !this.workletReady) return;
    if (this.transport(f.from) === 'p2p') return; // already hearing them directly
    let rp = this.relayPlayers.get(f.from);
    if (!rp) {
      const node = new AudioWorkletNode(this.ctx, 'bb-playback', { numberOfInputs: 0, outputChannelCount: [1] });
      const gain = this.ctx.createGain();
      node.connect(gain).connect(this.ctx.destination);
      rp = { node, gain, lastFrameAt: 0 };
      this.relayPlayers.set(f.from, rp);
      this.apply();
    }
    rp.lastFrameAt = performance.now();
    const bytes = f.data instanceof ArrayBuffer ? f.data : new Uint8Array(f.data as ArrayLike<number>).buffer;
    rp.node.port.postMessage(bytes, [bytes]);
  }

  // ───────────────────────── speaking meter ─────────────────────────

  private startMeter(): void {
    if (this.meter) return;
    const buf = new Float32Array(512);
    const level = (a: AnalyserNode | null | undefined) => {
      if (!a) return 0;
      a.getFloatTimeDomainData(buf);
      let e = 0;
      for (let i = 0; i < buf.length; i++) e += (buf[i] ?? 0) * (buf[i] ?? 0);
      return Math.sqrt(e / buf.length);
    };
    this.meter = setInterval(() => {
      const v = getVoice();
      const selfSpeaking = v.mic === 'on' && !v.muted && level(this.micAnalyser) > SPEAKING_THRESHOLD;
      let changed = selfSpeaking !== v.selfSpeaking;
      const peers = { ...v.peers };
      const now = performance.now();
      for (const id of Object.keys(peers)) {
        const entry = peers[id];
        if (!entry) continue;
        const speaking =
          entry.transport === 'p2p'
            ? level(this.analysers.get(id)) > SPEAKING_THRESHOLD
            : now - (this.relayPlayers.get(id)?.lastFrameAt ?? 0) < 350;
        if (speaking !== entry.speaking) {
          peers[id] = { ...entry, speaking };
          changed = true;
        }
      }
      if (changed) setVoice({ selfSpeaking, peers });
    }, 120);
  }

  // ───────────────────────── teardown ─────────────────────────

  /** Socket dropped: server forgets our presence; links rebuild after reconnect via sync(). */
  private dropNetworkState(): void {
    if (!getVoice().joined) return;
    this.closePeers();
    this.cfg = null;
    setVoice({ joined: false });
  }

  private teardown(): void {
    this.closePeers();
    this.capture?.disconnect();
    this.capture = null;
    this.micAnalyser = null;
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    if (this.meter) clearInterval(this.meter);
    this.meter = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.workletReady = false;
    this.cfg = null;
    this.pending = [];
    setVoice({ joined: false, mic: 'off', selfSpeaking: false, needsGesture: false, peers: {} });
  }

  /** Debug handle for support: window.__bbVoice.debug() */
  debug() {
    return {
      want: this.want,
      cfg: this.cfg,
      peers: [...this.peerStatus.entries()],
      links: [...this.peers.values()].map((p) => ({ id: p.id, ...p.info() })),
      relayPlayers: [...this.relayPlayers.keys()],
      ui: getVoice(),
    };
  }
}

export const voice = new VoiceEngine();
(window as unknown as { __bbVoice: VoiceEngine }).__bbVoice = voice;
