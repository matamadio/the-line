// The game's music, made on the spot with Web Audio. There are no recordings: every
// note is an oscillator or a burst of noise, so the music can follow any tempo and any
// time signature exactly, and costs nothing to download.
//
// The game calls beat() once per beat, already placed on the audio clock, and the style
// fills that beat with its notes. Between games, while the audio menu is open, preview()
// keeps its own clock so a style and a time signature can be heard before playing.

import { STYLES, type Style } from './styles';

/** How many layers every style has: the music stops building up at this level. */
export const LAYERS = 5;

/** A time signature: how many beats to a bar, and how they group, which says where the strong ones fall. */
export interface Meter { id: string; beats: number; groups: readonly number[] }
export const METERS: readonly Meter[] = [
  { id: '2/4', beats: 2, groups: [2] },
  { id: '3/4', beats: 3, groups: [3] },
  { id: '4/4', beats: 4, groups: [2, 2] },
  { id: '5/4', beats: 5, groups: [3, 2] },
  { id: '6/8', beats: 6, groups: [3, 3] },
  { id: '7/8', beats: 7, groups: [2, 2, 3] },
];
export const DEFAULT_METER = METERS[2];
export const meterById = (id: string) => METERS.find((m) => m.id === id) ?? DEFAULT_METER;

/** Where each group of a bar starts, and so where its strong beats are. */
export function groupStarts(m: Meter) {
  const out: number[] = [];
  let b = 0;
  for (const g of m.groups) { out.push(b); b += g; }
  return out;
}

/** One beat for a style to fill. */
export interface Beat {
  /** When it sounds, and how long it lasts (s). */
  at: number;
  len: number;
  /** Which beat of the bar, from 0, and which bar since the music started. */
  beat: number;
  bar: number;
  meter: Meter;
  /** A group of the bar starts here: a strong beat. The last beat of a group is the backbeat. */
  group: boolean;
  groupEnd: boolean;
  /** How many of the style's five layers play, 1 to 5: one more for each level. */
  layers: number;
  /** When the kth sixteenth of the beat sounds, swung as the style likes. */
  t(k: number): number;
}

/** The music's own random numbers, so making sound never moves the game's (see CONTRIBUTING.md). */
let seed = 0x2f6e2b1;
export function noteRand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A pitch in semitones from A 440. */
export const hz = (semitones: number) => 440 * 2 ** (semitones / 12);

/** The instruments every style plays: drums, plucked strings, keys, pads and plain tones. */
export class Synth {
  private noiseBuf: AudioBuffer | null = null;
  private plucks = new Map<string, AudioBuffer>();

  constructor(readonly ctx: AudioContext, readonly out: AudioNode) {}

  private get noise() {
    if (!this.noiseBuf) {
      const sr = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, sr, sr);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = noteRand() * 2 - 1;
    }
    return this.noiseBuf;
  }

  /** A gain into the output, rising to vol in `attack` and dying away with time constant `decay`. */
  private hit(at: number, vol: number, attack: number, decay: number, end: number) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + attack);
    g.gain.setTargetAtTime(0, at + attack, decay);
    g.gain.setValueAtTime(0, end);
    g.connect(this.out);
    return g;
  }

  private burst(at: number, seconds: number, into: AudioNode) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.connect(into);
    src.start(at, noteRand() * 0.5, seconds);
  }

  /** A drum's thump: a tone that drops fast. */
  kick(at: number, vol = 1, o: { from?: number; to?: number; decay?: number; wave?: OscillatorType } = {}) {
    const { from = 140, to = 44, decay = 0.09, wave = 'sine' } = o, end = at + decay * 6;
    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + 0.12);
    osc.connect(this.hit(at, vol, 0.003, decay, end));
    osc.start(at);
    osc.stop(end);
  }

  /** A snare or a brush: noise through a band, with a little tone under it. */
  snare(at: number, vol = 1, o: { band?: number; decay?: number; tone?: number } = {}) {
    const { band = 1800, decay = 0.05, tone = 0.4 } = o, end = at + decay * 6;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = band;
    f.Q.value = 0.8;
    f.connect(this.hit(at, vol, 0.002, decay, end));
    this.burst(at, end - at, f);
    if (tone > 0) {
      const osc = this.ctx.createOscillator();
      osc.frequency.setValueAtTime(220, at);
      osc.frequency.exponentialRampToValueAtTime(160, at + 0.05);
      osc.connect(this.hit(at, vol * tone, 0.002, 0.03, at + 0.2));
      osc.start(at);
      osc.stop(at + 0.2);
    }
  }

  /** A hi-hat or a shaker: a short hiss up high. */
  hat(at: number, vol = 1, decay = 0.02, freq = 7500) {
    const f = this.ctx.createBiquadFilter(), end = at + decay * 6;
    f.type = 'highpass';
    f.frequency.value = freq;
    f.connect(this.hit(at, vol, 0.001, decay, end));
    this.burst(at, end - at, f);
  }

  /** A woodblock or a rim: a very short, hollow tone. A longer decay makes a temple block. */
  block(at: number, vol = 1, freq = 900, decay = 0.018) {
    const osc = this.ctx.createOscillator(), end = at + decay * 7;
    osc.frequency.value = freq;
    osc.connect(this.hit(at, vol, 0.001, decay, end));
    osc.start(at);
    osc.stop(end);
  }

  /** A plain note: one oscillator, through a lowpass if asked, held for `dur` then let go. */
  tone(at: number, freq: number, dur: number, vol: number, o: { wave?: OscillatorType; attack?: number; release?: number; cutoff?: number; decay?: number } = {}) {
    const { wave = 'sine', attack = 0.005, release = 0.08, cutoff = 0, decay = 0 } = o, end = at + dur + release * 5;
    const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + attack);
    if (decay > 0) g.gain.setTargetAtTime(0, at + attack, decay);
    else g.gain.setValueAtTime(vol, at + dur);
    g.gain.setTargetAtTime(0, at + dur, release);
    let node: AudioNode = osc;
    if (cutoff > 0) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      osc.connect(f);
      node = f;
    }
    node.connect(g).connect(this.out);
    osc.start(at);
    osc.stop(end);
  }

  /** An electric piano: a sine bent by another, brighter at the strike and mellowing. */
  keys(at: number, freq: number, dur: number, vol: number) {
    const car = this.ctx.createOscillator(), mod = this.ctx.createOscillator(), depth = this.ctx.createGain(), g = this.ctx.createGain(), end = at + dur + 0.6;
    car.frequency.value = freq;
    mod.frequency.value = freq * 2;
    depth.gain.setValueAtTime(freq * 1.2, at);
    depth.gain.setTargetAtTime(freq * 0.15, at, 0.25);
    mod.connect(depth).connect(car.frequency);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.006);
    g.gain.setTargetAtTime(vol * 0.3, at + 0.006, 0.35);
    g.gain.setTargetAtTime(0, at + dur, 0.12);
    car.connect(g).connect(this.out);
    for (const o of [car, mod]) { o.start(at); o.stop(end); }
  }

  /** A pad: two detuned saws per note, darkened, swelling in and fading out. */
  pad(at: number, freqs: readonly number[], dur: number, vol: number, cutoff = 900) {
    const f = this.ctx.createBiquadFilter(), g = this.ctx.createGain(), swell = Math.min(dur * 0.4, 1.2), end = at + dur + 2;
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol / freqs.length, at + swell);
    g.gain.setTargetAtTime(0, at + dur, 0.4);
    f.connect(g).connect(this.out);
    for (const fr of freqs) for (const cents of [-8, 8]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = fr;
      osc.detune.value = cents;
      osc.connect(f);
      osc.start(at);
      osc.stop(end);
    }
  }

  /**
   * A plucked string (Karplus-Strong): a burst of noise going round a loop as long as one
   * period of the note, losing its highs each time. bright: 0 for a dull thud, 1 for a banjo.
   */
  pluck(at: number, freq: number, vol: number, o: { bright?: number; seconds?: number; damp?: number } = {}) {
    const { bright = 0.5, seconds = 1.2, damp = 0.996 } = o;
    const key = `${Math.round(freq * 4)}|${bright}|${seconds}|${damp}`;
    let buf = this.plucks.get(key);
    if (!buf) {
      const sr = this.ctx.sampleRate, n = Math.max(2, Math.round(sr / freq));
      buf = this.ctx.createBuffer(1, Math.floor(sr * seconds), sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = noteRand() * 2 - 1;
      for (let i = n; i < d.length; i++) d[i] = damp * (bright * d[i - n] + (1 - bright) * 0.5 * (d[i - n] + d[i - n - 1 < 0 ? 0 : i - n - 1]));
      this.plucks.set(key, buf);
    }
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = buf;
    g.gain.value = vol;
    src.connect(g).connect(this.out);
    src.start(at);
  }

  /**
   * A bamboo flute, like a shakuhachi: a soft tone that breathes in, with a little air
   * in it and a vibrato that only starts once the note has settled.
   */
  flute(at: number, freq: number, dur: number, vol: number) {
    const ctx = this.ctx, end = at + dur + 0.8;
    const osc = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq * 0.97, at);
    osc.frequency.linearRampToValueAtTime(freq, at + 0.12);
    lfo.frequency.value = 5;
    depth.gain.setValueAtTime(0, at);
    depth.gain.linearRampToValueAtTime(freq * 0.012, at + Math.min(dur, 0.5));
    lfo.connect(depth).connect(osc.frequency);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.12);
    g.gain.setTargetAtTime(0, at + dur, 0.15);
    osc.connect(g).connect(this.out);
    for (const o of [osc, lfo]) { o.start(at); o.stop(end); }
    // The breath: noise around the note, strongest as it starts.
    const air = ctx.createBiquadFilter();
    air.type = 'bandpass';
    air.frequency.value = freq * 2;
    air.Q.value = 2;
    air.connect(this.hit(at, vol * 0.5, 0.05, 0.2, end));
    this.burst(at, end - at, air);
  }

  /**
   * A soft, round bass, like a gently plucked upright: a sine with a quiet octave above it,
   * kept dark by a lowpass, with a cushioned start and a slow fall rather than a twang.
   */
  bass(at: number, freq: number, dur: number, vol: number) {
    const ctx = this.ctx, end = at + dur + 0.6;
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass';
    f.frequency.value = 380;
    f.Q.value = 0.5;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.015);
    g.gain.setTargetAtTime(vol * 0.45, at + 0.015, 0.22);
    g.gain.setTargetAtTime(0, at + dur, 0.09);
    f.connect(g).connect(this.out);
    for (const [mult, wave, level] of [[1, 'sine', 1], [2, 'triangle', 0.22]] as const) {
      const osc = ctx.createOscillator(), lv = ctx.createGain();
      osc.type = wave;
      osc.frequency.value = freq * mult;
      lv.gain.value = level;
      osc.connect(lv).connect(f);
      osc.start(at);
      osc.stop(end);
    }
  }

  /**
   * A fiddle: a bowed saw, softened by a lowpass, swelling in with the bow and taking
   * on a vibrato once the note has settled.
   */
  fiddle(at: number, freq: number, dur: number, vol: number) {
    const ctx = this.ctx, end = at + dur + 0.6;
    const osc = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    lfo.frequency.value = 5.5;
    depth.gain.setValueAtTime(0, at);
    depth.gain.linearRampToValueAtTime(freq * 0.01, at + Math.min(dur, 0.35));
    lfo.connect(depth).connect(osc.frequency);
    f.type = 'lowpass';
    f.frequency.value = 2200;
    f.Q.value = 0.7;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.08);
    g.gain.setTargetAtTime(0, at + dur, 0.12);
    osc.connect(f).connect(g).connect(this.out);
    for (const o of [osc, lfo]) { o.start(at); o.stop(end); }
  }

  /** A big drum, like a taiko: a deep, slow-dying thump with the skin's slap on top. */
  taiko(at: number, vol = 1, size = 1) {
    this.kick(at, vol, { from: 110 / size, to: 42 / size, decay: 0.18 * size });
    this.snare(at, vol * 0.35, { band: 320 / size, decay: 0.06, tone: 0 });
  }

  /** A strummed chord: the strings one after another, a few milliseconds apart. */
  strum(at: number, freqs: readonly number[], vol: number, o: { bright?: number; seconds?: number; damp?: number; gap?: number } = {}) {
    const { gap = 0.012, ...rest } = o;
    freqs.forEach((f, i) => this.pluck(at + i * gap, f, vol / Math.sqrt(freqs.length), { seconds: 0.6, ...rest }));
  }
}

/**
 * The bitcrusher of nostalgia mode: fewer levels for each sample, and each sample held for
 * several, like an old sound chip. It runs on the audio thread, from a module made here.
 */
const CRUSHER = `
class Crush extends AudioWorkletProcessor {
  constructor() { super(); this.left = 0; this.held = []; }
  process(inputs, outputs) {
    const input = inputs[0], output = outputs[0];
    if (!input.length) return true;
    const levels = 2 ** ${5 - 1}, hold = 4;
    let left = this.left;
    for (let ch = 0; ch < output.length; ch++) {
      const x = input[ch] || input[0], y = output[ch];
      let h = this.held[ch] || 0, c = this.left;
      for (let i = 0; i < y.length; i++) {
        if (c <= 0) { h = Math.round(x[i] * levels) / levels; c = hold; }
        c--;
        y[i] = h;
      }
      this.held[ch] = h;
      left = c;
    }
    this.left = left;
    return true;
  }
}
registerProcessor('crush', Crush);
`;

/** How loud the music is under the game's own sounds. */
const MUSIC_VOLUME = 0.42;
/** The preview's clock: how often it looks ahead, and how far (s). */
const PREVIEW_EVERY = 25, PREVIEW_AHEAD = 0.12;

export class Music {
  private synth: Synth | null = null;
  private ctx: AudioContext | null = null;
  /** Where the instruments go in, and where the music leaves for the speakers. */
  private input: GainNode | null = null;
  private bus: GainNode | null = null;
  private crusher: AudioWorkletNode | null = null;
  private crushed = false;
  style: Style = STYLES[0];
  private bar = -1;
  private preview: { timer: number; next: number; beat: number; bpm: number; layers: number; meter: () => Meter } | null = null;

  init(ctx: AudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.bus = ctx.createGain();
    this.bus.gain.value = MUSIC_VOLUME;
    this.bus.connect(dest);
    this.synth = new Synth(ctx, this.input);
    this.route();
    if (!ctx.audioWorklet) return;
    const url = URL.createObjectURL(new Blob([CRUSHER], { type: 'application/javascript' }));
    ctx.audioWorklet.addModule(url).then(() => {
      this.crusher = new AudioWorkletNode(ctx, 'crush', { outputChannelCount: [2] });
      this.crusher.connect(this.bus!);
      this.route();
    }).catch(() => { /* no crusher: the music plays clean */ });
  }

  private route() {
    const { input, bus, crusher } = this;
    if (!input || !bus) return;
    input.disconnect();
    input.connect(this.crushed && crusher ? crusher : bus);
  }

  /** Nostalgia mode puts the music through the bitcrusher. */
  setCrush(on: boolean) {
    this.crushed = on;
    this.route();
  }

  /** From the first bar again: a new game starts its tune from the top. */
  restart() { this.bar = -1; }

  /** One beat, placed on the audio clock at `at`, lasting len seconds. */
  beat(at: number, len: number, beat: number, meter: Meter, layers: number) {
    const s = this.synth;
    if (!s) return;
    if (beat === 0 || this.bar < 0) this.bar++;
    const starts = groupStarts(meter), swing = this.style.swing;
    const b: Beat = {
      at, len, beat, meter, layers, bar: this.bar,
      group: starts.includes(beat),
      groupEnd: starts.includes(beat + 1) || beat === meter.beats - 1,
      t: (k) => at + (k + (k % 2 ? swing : 0)) * (len / 4),
    };
    this.style.layers.forEach((l, i) => { if (i < layers) l.play(s, b); });
  }

  /** Keep the music going on its own clock, at this tempo, while the game isn't driving it. */
  startPreview(bpm: number, meter: () => Meter, layers: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.stopPreview();
    this.restart();
    const p = { timer: 0, next: ctx.currentTime + 0.05, beat: 0, bpm, layers, meter };
    p.timer = window.setInterval(() => {
      const len = 60 / p.bpm;
      while (p.next < ctx.currentTime + PREVIEW_AHEAD) {
        const m = p.meter();
        if (p.beat >= m.beats) p.beat = 0;
        this.beat(p.next, len, p.beat, m, p.layers);
        p.beat = (p.beat + 1) % m.beats;
        p.next += len;
      }
    }, PREVIEW_EVERY);
    this.preview = p;
  }

  stopPreview() {
    if (this.preview) window.clearInterval(this.preview.timer);
    this.preview = null;
  }
}
