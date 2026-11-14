// The original samples, the synthesized tones and the music, through Web Audio. Browsers
// only allow sound after a tap or key press, so everything starts in unlock().
//
// Two buses meet at the master: the game's sounds, dressed by the music style (a
// lowpass and an echo timed to the beat), and the music. Muting turns the master down.

import { audioPrefs, saveAudioPrefs } from './audioPrefs';
import { LAYERS, Music, type Meter } from './music';
import { STYLES, styleById, type Style } from './styles';

const SAMPLES = {
  appear: 'compare', vanish: 'sparisce', drag: 'colpisce', kill: 'snawave_sparisce',
  flipDown: 'rovescia_in_giu', flipUp: 'rovescia_in_su', offline: 'offline', eaten: 'eated',
  snawave: 'snawave', level: 'levelpass', reflux: 'reflux', pop: 'bollapop', bonus: 'linesaver',
  powerup: 'bonus', yeah: 'yeah.mp3',
} as const;
export type Sample = keyof typeof SAMPLES;

/** Beats are scheduled this far ahead (s), so a late frame can't make the click stumble. */
const BEAT_AHEAD = 0.03;
/** Further than this (s) from where the next beat was due, the click gives up and catches up. */
const BEAT_SLACK = 0.06;

/** A Sinepede's notes (Hz): a crest is the higher one, a trough a fourth below. */
const sinePitch = (side: number) => (side > 0 ? 440 : 330);
/** The nearest Sinepede's hum (Hz): 220 for one segment, and 110 more for each segment after it. */
export const humPitch = (segments: number) => 220 + 110 * (Math.max(1, segments) - 1);
const HUM_VOLUME = 0.3;
/** How hard the hum is driven into its saturation: enough to warm it, not to buzz. */
const HUM_DRIVE = 1;
/** The hum's reverb: how long it rings (s) and how much of it is heard. */
const HUM_VERB_TIME = 1.2, HUM_VERB_WET = 0.25;

/** A soft, symmetric saturation curve: the sine rounds off at the top, gaining a few odd harmonics. */
const SATURATION = (() => {
  const curve = new Float32Array(1024), k = Math.tanh(HUM_DRIVE);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / (curve.length - 1)) * 2 - 1) * HUM_DRIVE) / k;
  return curve;
})();

/** A small room for the reverb: stereo noise dying away. */
function roomImpulse(ctx: BaseAudioContext, seconds: number) {
  const len = Math.round(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  return buf;
}

/** White noise, for surf and crashes. */
function noise(ctx: BaseAudioContext, seconds: number) {
  const len = Math.round(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

/** Brighter waves sound louder at the same level: this evens them out. */
const WAVE_LOUDNESS: Partial<Record<OscillatorType, number>> = { square: 0.45, sawtooth: 0.5, triangle: 0.9 };

/** The nearest pitch to f whose note is in the scale (semitones above A, 0 to 11). Without a scale, f itself. */
export function onScale(f: number, scale?: readonly number[]) {
  if (!scale) return f;
  const n = 12 * Math.log2(f / 440), base = Math.round(n);
  for (const d of [0, 1, -1, 2, -2, 3, -3]) {
    if (scale.includes((((base + d) % 12) + 12) % 12)) return 440 * 2 ** ((base + d) / 12);
  }
  return f;
}

/** A hard clipping curve for the WaveShaper: sharp corners, like the urchin's outline. */
const DISTORTION = (() => {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / (curve.length - 1)) * 2 - 1) * 14);
  return curve;
})();

/** How loud the sound effects are, under the music (MUSIC_VOLUME in music.ts). */
const SFX_VOLUME = 0.55;

class Sfx {
  private ctx: AudioContext | null = null;
  private humOsc: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  private buffers = new Map<Sample, AudioBuffer>();
  private nextBeat = 0;
  /** When the latest beat sounds. It is placed just ahead, and what starts with it starts together. */
  private lastBeat = 0;
  muted = audioPrefs.muted;
  readonly music = new Music();
  /** The game's sounds go in here; the master is where they meet the music. */
  private out: GainNode | null = null;
  private master: GainNode | null = null;
  private tint: { filter: BiquadFilterNode; delay: DelayNode; wet: GainNode } | null = null;
  private crushed = false;
  private previewing = false;

  constructor() { this.music.style = styleById(audioPrefs.style); }

  get style(): Style { return this.music.style; }

  /** Holds every sound where it is, or lets them carry on. The audio menu's preview keeps playing. */
  pause(on: boolean) {
    if (on && !this.previewing) void this.ctx?.suspend();
    else void this.ctx?.resume();
  }

  /**
   * Starts the sound at once where the browser allows it without a tap or key (an installed
   * app often does), so the title music needn't wait for one. Elsewhere it waits as before.
   */
  autoplay() {
    if (this.ctx || typeof AudioContext === 'undefined') return;
    const probe = new AudioContext(), allowed = probe.state === 'running';
    void probe.close();
    if (allowed) this.unlock();
  }

  unlock() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const ctx = this.ctx = new AudioContext();
    // A compressor last of all, so many sounds at once never clip.
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -10;
    limit.ratio.value = 6;
    limit.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(limit);
    this.out = ctx.createGain();
    this.out.gain.value = SFX_VOLUME;
    const filter = ctx.createBiquadFilter(), delay = ctx.createDelay(2), back = ctx.createGain(), wet = ctx.createGain();
    filter.type = 'lowpass';
    back.gain.value = 0.3;
    this.out.connect(filter).connect(this.master);
    filter.connect(delay).connect(wet).connect(this.master);
    delay.connect(back).connect(delay);
    this.tint = { filter, delay, wet };
    this.music.init(ctx, this.master);
    this.music.setCrush(this.crushed);
    this.applyTint(60 / 75);
    for (const [key, file] of Object.entries(SAMPLES) as [Sample, string][]) {
      fetch(`assets/sounds/${file.includes('.') ? file : file + '.wav'}`)
        .then((r) => r.arrayBuffer())
        .then((b) => this.ctx!.decodeAudioData(b))
        .then((buf) => this.buffers.set(key, buf))
        .catch(() => {});
    }
  }

  play(name: Sample, volume = 1) {
    const ctx = this.ctx, buf = this.buffers.get(name);
    if (!ctx || !buf || this.muted) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.out!);
    src.start(this.now(ctx));
  }

  private now(ctx: AudioContext) { return Math.max(ctx.currentTime, this.lastBeat); }

  /**
   * One short tone. glide bends it to another pitch by the end; delay places it later.
   * styled: it takes the music style's wave. A Sinepede's never do: it is a sine, and sounds like one.
   */
  private tone(freq: number, seconds: number, volume: number, glide = freq, delay = 0, styled = false) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const at = this.now(ctx) + delay;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    if (styled) {
      osc.type = this.style.tint.wave;
      volume *= WAVE_LOUDNESS[osc.type] ?? 1;
      freq = onScale(freq, this.style.scale);
      glide = onScale(glide, this.style.scale);
    }
    osc.frequency.setValueAtTime(freq, at);
    osc.frequency.exponentialRampToValueAtTime(glide, at + seconds);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(volume, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    osc.connect(g).connect(this.out!);
    osc.start(at);
    osc.stop(at + seconds + 0.02);
  }

  /** A Sinepede announces itself: one pure tone per segment, high for a crest, low for a trough. */
  call(sides: readonly number[]) {
    sides.forEach((side, i) => this.tone(sinePitch(side), 0.14, 0.3, sinePitch(side), i * 0.11));
  }

  /** The right attack: that segment's own note, dropping away to nothing. */
  cancelled(side: number, last: boolean) {
    const f = sinePitch(side);
    this.tone(f * 2, 0.22, 0.35, f);
    if (last) this.tone(f * 3, 0.3, 0.2, f * 1.5, 0.06);
  }

  /** The wrong attack: the note bends upward, and the new segment joins in. */
  /** He grows: a bright run up a major chord, ringing on at the top, higher for each size. */
  grew(size: number) {
    const f = 330 + 55 * size;
    [1, 1.25, 1.5].forEach((n, i) => this.tone(f * n, 0.14, 0.3, f * n, i * 0.08, true));
    this.tone(f * 2, 0.55, 0.35, f * 2, 0.24, true);
    this.tone(f * 4, 0.4, 0.12, f * 4, 0.24, true);
  }
  /** He loses a size: the same glide, falling. */
  shrank(size: number) {
    const f = 660 + 110 * size;
    this.tone(f, 0.32, 0.35, f / 2, 0, true);
  }
  fed(side: number) {
    const f = sinePitch(side);
    this.tone(f, 0.2, 0.32, f * 1.5);
    this.tone(sinePitch(-side), 0.14, 0.25, sinePitch(-side), 0.16);
  }

  /** The Flattener slams the line: a deep thud falling away, with a clipped crack on top. */
  slam() {
    this.tone(95, 0.8, 0.7, 28);
    this.tone(190, 0.3, 0.3, 60);
    this.crunch(0.12, 0.6);
  }

  /**
   * Tide-Al building up: a deep bass swelling over `seconds`. A sub an octave under a
   * driven, detuned bass, both rising a fifth, the bass's filter opening as it comes, and
   * the whole of it throbbing faster and faster. It holds its peak up to `hold` more, until
   * the crash cuts it off. Returns how to cut it off.
   */
  tideRise(seconds: number, hold: number): () => void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return () => {};
    const at = this.now(ctx), peak = at + Math.max(0.3, seconds), end = peak + hold;
    const sub = ctx.createOscillator(), a = ctx.createOscillator(), b = ctx.createOscillator();
    sub.type = 'sine';
    a.type = b.type = 'sawtooth';
    for (const [o, f] of [[sub, 41], [a, 82], [b, 82.8]] as const) {
      o.frequency.setValueAtTime(f, at);
      o.frequency.exponentialRampToValueAtTime(f * 1.5, peak);
    }
    // The bass is driven into saturation, so its overtones carry on small speakers too.
    const drive = ctx.createWaveShaper(), tone = ctx.createBiquadFilter();
    drive.curve = SATURATION;
    tone.type = 'lowpass';
    tone.Q.value = 7;
    tone.frequency.setValueAtTime(320, at);
    tone.frequency.exponentialRampToValueAtTime(1800, peak);
    a.connect(drive);
    b.connect(drive);
    drive.connect(tone);
    // The throb: 3 a second at first, 16 at the peak.
    const throb = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
    throb.gain.value = 0.65;
    depth.gain.value = 0.35;
    lfo.frequency.setValueAtTime(3, at);
    lfo.frequency.exponentialRampToValueAtTime(16, peak);
    lfo.connect(depth).connect(throb.gain);
    const env = ctx.createGain();
    // Heard at once (a ramp from silence stays inaudible for most of its length), then swelling.
    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(0.2, at + 0.12);
    env.gain.exponentialRampToValueAtTime(0.55, peak);
    env.gain.setValueAtTime(0.55, end);
    env.gain.exponentialRampToValueAtTime(0.0001, end + 0.3);
    sub.connect(throb);
    tone.connect(throb);
    throb.connect(env).connect(this.out!);
    const all = [sub, a, b, lfo];
    for (const o of all) { o.start(at); o.stop(end + 0.35); }
    return () => {
      const now = ctx.currentTime;
      env.gain.cancelScheduledValues(now);
      env.gain.setTargetAtTime(0, now, 0.02);
      for (const o of all) o.stop(now + 0.15);
    };
  }

  /**
   * Tide-Al crashes down: a crash cymbal (bright noise and a cluster of clashing square
   * waves, ringing out over 2 s), the slap of the water, and a deep boom under it.
   */
  tideCrash() {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const at = this.now(ctx), ring = 2.2;
    this.tone(70, 1.1, 0.9, 28);
    this.tone(140, 0.35, 0.4, 45);
    // The cymbal's wash.
    const wash = noise(ctx, ring), hi = ctx.createBiquadFilter(), wg = ctx.createGain();
    hi.type = 'highpass';
    hi.frequency.value = 3500;
    wg.gain.setValueAtTime(0.0001, at);
    wg.gain.exponentialRampToValueAtTime(0.55, at + 0.005);
    wg.gain.exponentialRampToValueAtTime(0.0001, at + ring);
    wash.connect(hi).connect(wg).connect(this.out!);
    wash.start(at);
    wash.stop(at + ring);
    // Its metal: square waves at clashing pitches, as the old drum machines made a cymbal.
    const metal = ctx.createBiquadFilter(), mg = ctx.createGain();
    metal.type = 'highpass';
    metal.frequency.value = 6500;
    mg.gain.setValueAtTime(0.0001, at);
    mg.gain.exponentialRampToValueAtTime(0.22, at + 0.005);
    mg.gain.exponentialRampToValueAtTime(0.0001, at + ring * 0.7);
    metal.connect(mg).connect(this.out!);
    for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(metal);
      o.start(at);
      o.stop(at + ring);
    }
    // The water slapping down.
    const slap = noise(ctx, 0.7), lo = ctx.createBiquadFilter(), sg = ctx.createGain();
    lo.type = 'lowpass';
    lo.frequency.setValueAtTime(2400, at);
    lo.frequency.exponentialRampToValueAtTime(300, at + 0.6);
    sg.gain.setValueAtTime(0.0001, at);
    sg.gain.exponentialRampToValueAtTime(0.6, at + 0.01);
    sg.gain.exponentialRampToValueAtTime(0.0001, at + 0.65);
    slap.connect(lo).connect(sg).connect(this.out!);
    slap.start(at);
    slap.stop(at + 0.7);
  }

  /** The Flattener as a cat: a meow, a buzzy tone through a vowel-like filter that opens and closes. */
  meow() {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const at = this.now(ctx), len = 0.55;
    const osc = ctx.createOscillator(), vowel = ctx.createBiquadFilter(), g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(480, at);
    osc.frequency.linearRampToValueAtTime(720, at + len * 0.35);
    osc.frequency.exponentialRampToValueAtTime(400, at + len);
    vowel.type = 'bandpass';
    vowel.Q.value = 5;
    vowel.frequency.setValueAtTime(700, at);
    vowel.frequency.linearRampToValueAtTime(1900, at + len * 0.3);
    vowel.frequency.exponentialRampToValueAtTime(800, at + len);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.55, at + 0.06);
    g.gain.setValueAtTime(0.55, at + len * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(vowel).connect(g).connect(this.out!);
    osc.start(at);
    osc.stop(at + len + 0.02);
  }

  /** The Flattener as a saw: a whine that spins up and keeps going. Returns how to cut it off. */
  whirr(seconds: number): () => void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return () => {};
    const at = this.now(ctx);
    const a = ctx.createOscillator(), b = ctx.createOscillator(), tone = ctx.createBiquadFilter(), g = ctx.createGain(), wob = ctx.createOscillator(), depth = ctx.createGain();
    a.type = b.type = 'sawtooth';
    for (const [o, f] of [[a, 1], [b, 1.012]] as const) {
      o.frequency.setValueAtTime(140 * f, at);
      o.frequency.exponentialRampToValueAtTime(420 * f, at + Math.min(1.2, seconds));
    }
    tone.type = 'lowpass';
    tone.frequency.value = 2400;
    wob.frequency.value = 34;
    depth.gain.value = 0.06;
    wob.connect(depth).connect(g.gain);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.16, at + 0.3);
    g.gain.setValueAtTime(0.16, at + seconds - 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    a.connect(tone);
    b.connect(tone);
    tone.connect(g).connect(this.out!);
    for (const o of [a, b, wob]) { o.start(at); o.stop(at + seconds + 0.02); }
    return () => {
      const now = ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setTargetAtTime(0, now, 0.03);
      for (const o of [a, b, wob]) o.stop(now + 0.15);
    };
  }

  /** The Flattener as a toad: a low croak, three quick rasps. */
  croak() {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const at = this.now(ctx);
    for (let i = 0; i < 3; i++) {
      const t0 = at + i * 0.1;
      const osc = ctx.createOscillator(), tone = ctx.createBiquadFilter(), g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(95, t0);
      osc.frequency.exponentialRampToValueAtTime(70, t0 + 0.08);
      tone.type = 'lowpass';
      tone.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
      osc.connect(tone).connect(g).connect(this.out!);
      osc.start(t0);
      osc.stop(t0 + 0.1);
    }
  }

  /** Something sent back at the Flattener: a tone rising away, the way it rolls. */
  sentBack() {
    this.tone(330, 0.32, 0.3, 990, 0, true);
  }

  /** The Flattener hit by his own power: a big low groan, falling. */
  bossHit() {
    this.play('kill');
    this.tone(220, 0.7, 0.5, 55);
    this.tone(330, 0.5, 0.25, 82, 0.05);
  }

  /**
   * The nearest Sinepede's steady tone. segments: how many it has left, 0 for none. near:
   * 0 far away, 1 on top of him. The sine is saturated a little before its level is set,
   * so it sounds the same at any distance, and a little reverb goes with it.
   */
  hum(segments: number, near: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.humOsc) {
      if (!segments) return;
      this.humOsc = ctx.createOscillator();
      const shape = ctx.createWaveShaper(), verb = ctx.createConvolver(), wet = ctx.createGain();
      shape.curve = SATURATION;
      shape.oversample = '2x';
      verb.buffer = roomImpulse(ctx, HUM_VERB_TIME);
      wet.gain.value = HUM_VERB_WET;
      this.humGain = ctx.createGain();
      this.humGain.gain.value = 0;
      this.humOsc.connect(shape).connect(this.humGain).connect(this.out!);
      this.humGain.connect(verb).connect(wet).connect(this.out!);
      this.humOsc.start();
    }
    const now = ctx.currentTime, gain = this.humGain!.gain, freq = this.humOsc.frequency;
    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(this.muted || !segments ? 0 : HUM_VOLUME * near * near, now, 0.04);
    if (segments) { freq.cancelScheduledValues(now); freq.setTargetAtTime(humPitch(segments), now, 0.03); }
  }

  /** A low tremble under the line's vibration, before a Disturchin comes up. Returns how to cut it off. */
  rumble(seconds: number): () => void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return () => {};
    const at = this.now(ctx);
    const osc = ctx.createOscillator(), g = ctx.createGain(), wobble = ctx.createOscillator(), depth = ctx.createGain();
    osc.frequency.value = 58;
    wobble.frequency.value = 26;
    depth.gain.value = 0.16;
    wobble.connect(depth).connect(g.gain);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.22, at + seconds);
    g.gain.setValueAtTime(0, at + seconds);
    osc.connect(g).connect(this.out!);
    for (const o of [osc, wobble]) { o.start(at); o.stop(at + seconds); }
    return () => { for (const o of [osc, wobble]) o.stop(); };
  }

  /** A Disturchin: harsh and clipped, higher when it grows and lower when it shrinks. Returns how to cut it off. */
  crunch(seconds: number, pitch = 1): () => void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return () => {};
    const at = this.now(ctx);
    const a = ctx.createOscillator(), b = ctx.createOscillator(), clip = ctx.createWaveShaper(), tone = ctx.createBiquadFilter(), g = ctx.createGain();
    a.type = b.type = 'sawtooth';
    a.frequency.value = 110 * pitch;
    b.frequency.value = 117 * pitch;
    clip.curve = DISTORTION;
    tone.type = 'lowpass';
    tone.frequency.value = 3200;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.3, at + 0.015);
    g.gain.setValueAtTime(0.3, at + seconds - 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    a.connect(clip);
    b.connect(clip);
    clip.connect(tone).connect(g).connect(this.out!);
    for (const o of [a, b]) { o.start(at); o.stop(at + seconds + 0.02); }
    return () => {
      const now = ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setTargetAtTime(0, now, 0.01);
      for (const o of [a, b]) o.stop(now + 0.06);
    };
  }

  toggleMute() { this.setMuted(!this.muted); }

  setMuted(on: boolean) {
    this.muted = audioPrefs.muted = on;
    saveAudioPrefs();
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  /** The music style: it plays the music and dresses every other sound. */
  setStyle(id: string) {
    this.music.style = styleById(id);
    audioPrefs.style = this.music.style.id;
    saveAudioPrefs();
    this.applyTint(this.nextBeat - this.lastBeat || 60 / 75);
  }

  /** The style after (1) or before (-1) the current one. */
  cycleStyle(d: number) {
    const i = STYLES.indexOf(this.style);
    this.setStyle(STYLES[(i + d + STYLES.length) % STYLES.length].id);
  }

  /** The style's lowpass and echo over the game's sounds. The echo is timed in beats, so it falls in time too. */
  private applyTint(beatSeconds: number) {
    const t = this.tint, ctx = this.ctx;
    if (!t || !ctx) return;
    const { cutoff, echo, echoBeats } = this.style.tint, now = ctx.currentTime;
    t.filter.frequency.setTargetAtTime(cutoff, now, 0.05);
    t.wet.gain.setTargetAtTime(echo, now, 0.05);
    t.delay.delayTime.setTargetAtTime(Math.min(1.9, beatSeconds * echoBeats), now, 0.05);
  }

  /** Nostalgia mode: the music goes through a bitcrusher. */
  setNostalgia(on: boolean) {
    this.crushed = on;
    this.music.setCrush(on);
  }

  /**
   * One beat of the music. Frames arrive unevenly, so each beat is placed exactly one
   * beat after the last on the audio clock, as long as the game is roughly there too.
   * beat: which beat of the bar, from 0. layers: how many of the style's layers play, 1 to 5.
   */
  beat(seconds: number, beat: number, meter: Meter, layers: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const soon = ctx.currentTime + BEAT_AHEAD;
    const at = Math.abs(this.nextBeat - soon) < BEAT_SLACK ? this.nextBeat : soon;
    this.nextBeat = at + seconds;
    this.lastBeat = at;
    if (beat === 0) this.applyTint(seconds);
    if (!this.muted) this.music.beat(at, seconds, beat, meter, layers);
  }

  /** A game starts its music from the first bar. */
  restartMusic() { this.music.restart(); }

  /** Sound can play: the browser has let it start, after a tap or a key. */
  get ready() { return this.ctx !== null; }

  /** The audio menu plays the music on its own clock, so a style can be heard while the game waits. */
  preview(bpm: number, meter: () => Meter, layers = LAYERS) {
    this.previewing = true;
    this.unlock();
    this.music.startPreview(bpm, meter, layers);
    this.applyTint(60 / bpm);
  }

  endPreview() {
    this.previewing = false;
    this.music.stopPreview();
  }
}

export const sfx = new Sfx();
