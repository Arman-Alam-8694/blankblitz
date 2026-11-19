/* global AudioWorkletProcessor, registerProcessor, sampleRate */
/**
 * Server-relay audio path (last-resort fallback when WebRTC can't connect).
 * Plain JS so it loads under a strict CSP (script-src 'self') with no build step.
 *
 *  capture:  mic @ context rate → 16 kHz mono → 20 ms frames → VAD gate → G.711 µ-law (320 B/frame)
 *  playback: µ-law → float → resample to context rate → jitter buffer (60 ms prebuffer, 300 ms cap)
 */
const RATE = 16000;
const FRAME = 320; // 20 ms @ 16 kHz

function encodeMulaw(sample) {
  let s = Math.max(-1, Math.min(1, sample)) * 32767;
  s = s | 0;
  const sign = s < 0 ? 0x80 : 0;
  if (sign) s = -s;
  if (s > 32635) s = 32635;
  s += 0x84;
  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; exponent--, mask >>= 1);
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

const DECODE = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const u = ~i & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let s = ((mantissa << 3) + 0x84) << exponent;
  s -= 0x84;
  DECODE[i] = (sign ? -s : s) / 32768;
}

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / RATE;
    this.pos = 0;
    this.sum = 0;
    this.count = 0;
    this.frame = new Float32Array(FRAME);
    this.idx = 0;
    this.hang = 0;
    this.enabled = false;
    this.port.onmessage = (e) => {
      if (e.data && typeof e.data.enabled === 'boolean') this.enabled = e.data.enabled;
    };
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      // Box-filter decimation (cheap anti-aliasing) from context rate down to 16 kHz.
      this.sum += input[i];
      this.count++;
      this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        this.frame[this.idx++] = this.sum / this.count;
        this.sum = 0;
        this.count = 0;
        if (this.idx === FRAME) {
          this.flush();
          this.idx = 0;
        }
      }
    }
    return true;
  }

  flush() {
    let energy = 0;
    for (let i = 0; i < FRAME; i++) energy += this.frame[i] * this.frame[i];
    const rms = Math.sqrt(energy / FRAME);
    // Voice-activity gate with 300 ms hang-over: silence costs no bandwidth.
    if (rms > 0.012) this.hang = 15;
    else if (this.hang > 0) this.hang--;
    if (!this.enabled || this.hang === 0) return;
    const out = new Uint8Array(FRAME);
    for (let i = 0; i < FRAME; i++) out[i] = encodeMulaw(this.frame[i]);
    this.port.postMessage(out.buffer, [out.buffer]);
  }
}

class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.cap = Math.ceil(sampleRate * 1.0);
    this.ring = new Float32Array(this.cap);
    this.r = 0;
    this.w = 0;
    this.size = 0;
    this.step = RATE / sampleRate;
    this.phase = 0;
    this.prev = 0;
    this.playing = false;
    this.prebuffer = Math.floor(sampleRate * 0.06);
    this.maxLatency = Math.floor(sampleRate * 0.3);
    this.target = Math.floor(sampleRate * 0.12);
    this.port.onmessage = (e) => this.push(new Uint8Array(e.data));
  }

  write(v) {
    this.ring[this.w] = v;
    this.w = (this.w + 1) % this.cap;
    if (this.size < this.cap) this.size++;
    else this.r = (this.r + 1) % this.cap;
  }

  push(bytes) {
    const n = bytes.length;
    // Linear-interpolation resampler, carrying the previous sample across packets.
    let t = this.phase;
    while (t < n) {
      const i = Math.floor(t);
      const f = t - i;
      const a = i === 0 ? this.prev : DECODE[bytes[i - 1]];
      const b = DECODE[bytes[i]];
      this.write(a + (b - a) * f);
      t += this.step;
    }
    this.phase = t - n;
    this.prev = DECODE[bytes[n - 1]];
    // Bound latency: if the network delivered a burst, skip ahead.
    if (this.size > this.maxLatency) {
      const drop = this.size - this.target;
      this.r = (this.r + drop) % this.cap;
      this.size -= drop;
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    if (!this.playing && this.size >= this.prebuffer) this.playing = true;
    for (let i = 0; i < out.length; i++) {
      if (this.playing && this.size > 0) {
        out[i] = this.ring[this.r];
        this.r = (this.r + 1) % this.cap;
        this.size--;
      } else {
        out[i] = 0;
      }
    }
    if (this.size === 0) this.playing = false; // underrun → rebuild prebuffer
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}

registerProcessor('bb-capture', CaptureProcessor);
registerProcessor('bb-playback', PlaybackProcessor);
