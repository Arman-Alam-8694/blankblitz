/**
 * One WebRTC audio link to one remote player, using the "perfect negotiation"
 * pattern (glare-safe: both sides may offer at any time).
 *
 * Fault tolerance:
 *  - `disconnected` for > 4 s, or `failed`  → ICE restart (re-gathers, may switch to TURN)
 *  - not connected within 12 s / after failure → caller switches this pair to server relay
 *  - while on relay, retry ICE every 20 s and switch back to P2P automatically if it recovers
 */
import type { IceServer, VoiceSignal, VoiceSignalIn } from '@blankblitz/shared';

export type PeerStatus = 'connecting' | 'p2p' | 'down';

export interface PeerOptions {
  id: string;
  session: string;
  polite: boolean;
  iceServers: IceServer[];
  send: (msg: Omit<VoiceSignalIn, 'to' | 'toSession'>) => void;
  onStatus: (status: PeerStatus) => void;
  onStream: (stream: MediaStream) => void;
}

const CONNECT_TIMEOUT_MS = 12_000;
const DISCONNECT_GRACE_MS = 4_000;
const RETRY_MS = 20_000;

export class Peer {
  readonly id: string;
  readonly session: string;
  readonly audio: HTMLAudioElement;
  stream: MediaStream | null = null;
  status: PeerStatus = 'connecting';

  private readonly pc: RTCPeerConnection;
  /** Created by the impolite side; adopted from the remote offer on the polite side. */
  private sender: RTCRtpSender | null = null;
  private makingOffer = false;
  private ignoreOffer = false;
  private settingRemoteAnswerPending = false;
  private closed = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private wantedTrack: MediaStreamTrack | null = null;

  constructor(private readonly opts: PeerOptions) {
    this.id = opts.id;
    this.session = opts.session;
    this.audio = new Audio();
    this.audio.autoplay = true;
    this.audio.setAttribute('playsinline', '');

    this.pc = new RTCPeerConnection({ iceServers: opts.iceServers as RTCIceServer[], bundlePolicy: 'max-bundle' });
    // Exactly one side creates the audio m-line, so no local track is needed up front
    // (listen-only users and devices without audio hardware still connect).
    if (!opts.polite) this.sender = this.pc.addTransceiver('audio', { direction: 'sendrecv' }).sender;

    this.pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        if (this.pc.localDescription) this.opts.send({ description: this.descr(this.pc.localDescription) });
      } catch (err) {
        console.warn('[voice] offer failed', err);
      } finally {
        this.makingOffer = false;
      }
    };
    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.opts.send({ candidate: candidate.toJSON() as never });
    };
    this.pc.ontrack = ({ track, streams }) => {
      this.stream = streams[0] ?? new MediaStream([track]);
      this.audio.srcObject = this.stream;
      this.opts.onStream(this.stream);
    };
    this.pc.onconnectionstatechange = () => this.onState();
    this.pc.oniceconnectionstatechange = () => this.onState(); // older Safari lacks connectionState events

    this.later(() => {
      if (this.status !== 'p2p') this.setStatus('down');
    }, CONNECT_TIMEOUT_MS);
  }

  private descr(d: RTCSessionDescription) {
    return { type: d.type, sdp: d.sdp };
  }

  private later(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.closed) fn();
    }, ms);
    this.timers.add(t);
  }

  private state(): string {
    return this.pc.connectionState ?? this.pc.iceConnectionState;
  }

  private onState(): void {
    if (this.closed) return;
    const s = this.state();
    if (s === 'connected' || s === 'completed') {
      this.setStatus('p2p');
      this.capBitrate();
    } else if (s === 'disconnected') {
      this.later(() => {
        if (this.state() === 'disconnected') {
          this.setStatus('down');
          this.restart();
        }
      }, DISCONNECT_GRACE_MS);
    } else if (s === 'failed') {
      this.setStatus('down');
      this.restart();
    }
  }

  private setStatus(s: PeerStatus): void {
    if (this.status === s) return;
    this.status = s;
    if (s === 'down' && !this.retryTimer) {
      this.retryTimer = setInterval(() => this.restart(), RETRY_MS);
    }
    if (s === 'p2p' && this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
    this.opts.onStatus(s);
  }

  private restart(): void {
    if (this.closed || this.pc.signalingState === 'closed') return;
    try {
      this.pc.restartIce();
    } catch {
      /* very old browser: periodic retries + relay still cover us */
    }
  }

  /** Mesh-friendly bitrate (voice-grade Opus); keeps 7-peer meshes light on mobile data. */
  private capBitrate(): void {
    if (!this.sender) return;
    try {
      const params = this.sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      const enc = params.encodings[0];
      if (enc) enc.maxBitrate = 32_000;
      void this.sender.setParameters(params).catch(() => undefined);
    } catch {
      /* optional */
    }
  }

  async handle(signal: VoiceSignal): Promise<void> {
    if (this.closed) return;
    try {
      if (signal.description) {
        const d = signal.description as RTCSessionDescriptionInit;
        const readyForOffer =
          !this.makingOffer && (this.pc.signalingState === 'stable' || this.settingRemoteAnswerPending);
        const collision = d.type === 'offer' && !readyForOffer;
        this.ignoreOffer = !this.opts.polite && collision;
        if (this.ignoreOffer) return;
        this.settingRemoteAnswerPending = d.type === 'answer';
        await this.pc.setRemoteDescription(d);
        this.settingRemoteAnswerPending = false;
        if (d.type === 'offer') {
          this.adoptTransceiver();
          await this.pc.setLocalDescription();
          if (this.pc.localDescription) this.opts.send({ description: this.descr(this.pc.localDescription) });
        }
      } else if (signal.candidate) {
        try {
          await this.pc.addIceCandidate(signal.candidate as RTCIceCandidateInit);
        } catch (err) {
          if (!this.ignoreOffer) console.warn('[voice] bad candidate', err);
        }
      }
    } catch (err) {
      console.warn('[voice] signaling error', err);
    }
  }

  /** Polite side: reuse the offerer's audio transceiver for our own outgoing audio. */
  private adoptTransceiver(): void {
    if (this.sender) return;
    const t = this.pc.getTransceivers().find((x) => x.receiver.track.kind === 'audio');
    if (!t) return;
    t.direction = 'sendrecv';
    this.sender = t.sender;
    if (this.wantedTrack) void this.sender.replaceTrack(this.wantedTrack).catch(() => undefined);
  }

  /** Switch what we send without renegotiating (null = send nothing). */
  setTrack(track: MediaStreamTrack | null): void {
    if (this.closed) return;
    const changed = this.wantedTrack !== track;
    this.wantedTrack = track;
    if (changed && this.sender) void this.sender.replaceTrack(track).catch(() => undefined);
  }

  info() {
    return {
      status: this.status,
      connection: this.pc.connectionState,
      ice: this.pc.iceConnectionState,
      gathering: this.pc.iceGatheringState,
      signaling: this.pc.signalingState,
      sending: this.wantedTrack !== null && this.sender !== null,
      audioMuted: this.audio.muted,
    };
  }

  close(): void {
    this.closed = true;
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.pc.close();
    this.audio.pause();
    this.audio.srcObject = null;
  }
}
