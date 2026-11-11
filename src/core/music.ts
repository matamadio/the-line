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

  /** Where its notes go. Music moves it to a new fader each time the music starts again. */
  constructor(readonly ctx: AudioContext, public out: AudioNode) {}

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

  /**
   * An acid bass line's note: a saw through a resonant lowpass that snaps open and
   * closes again, the squelch of an old bass machine. An accent opens it further.
   */
  acid(at: number, freq: number, dur: number, vol: number, accent = false) {
    const ctx = this.ctx, end = at + dur + 0.1;
    const osc = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    f.type = 'lowpass';
    f.Q.value = 11;
    f.frequency.setValueAtTime(accent ? 2600 : 1400, at);
    f.frequency.exponentialRampToValueAtTime(260, at + 0.18);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(accent ? vol * 1.4 : vol, at + 0.003);
    g.gain.setValueAtTime(accent ? vol * 1.4 : vol, at + dur);
    g.gain.linearRampToValueAtTime(0, at + dur + 0.02);
    osc.connect(f).connect(g).connect(this.out);
    osc.start(at);
    osc.stop(end);
  }

  /**
   * A theremin-like lead: a pure, eerie tone that slides from the last note it played
   * (`from`, in Hz, or 0 to start on the note), with a slow fade in and a wide vibrato.
   */
  theremin(at: number, from: number, freq: number, dur: number, vol: number) {
    const ctx = this.ctx, end = at + dur + 1;
    const osc = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from || freq, at);
    osc.frequency.exponentialRampToValueAtTime(freq, at + 0.16);
    lfo.frequency.value = 5.5;
    depth.gain.setValueAtTime(freq * 0.006, at);
    depth.gain.linearRampToValueAtTime(freq * 0.016, at + Math.min(dur, 0.8));
    lfo.connect(depth).connect(osc.frequency);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.1);
    g.gain.setTargetAtTime(0, at + dur, 0.2);
    osc.connect(g).connect(this.out);
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
 * Nostalgia mode's sound: an old console's. The music is cut to CRUSH_RATE samples a
 * second and CRUSH_BITS bits, with soft filters either side, as the old consoles had.
 */
const CRUSH_RATE = 8000, CRUSH_BITS = 8;
/** The filters either side of the crusher (Hz): the one before keeps the cut-down rate from whistling. */
const CRUSH_BEFORE = 6500, CRUSH_AFTER = 4500;
/** It runs on the audio thread, from a module made here. */
const CRUSHER = `
class Crush extends AudioWorkletProcessor {
  constructor() { super(); this.phase = []; this.held = []; }
  process(inputs, outputs) {
    const input = inputs[0], output = outputs[0];
    if (!input.length) return true;
    const levels = 2 ** ${CRUSH_BITS - 1}, step = ${CRUSH_RATE} / sampleRate;
    for (let ch = 0; ch < output.length; ch++) {
      const x = input[ch] || input[0], y = output[ch];
      let h = this.held[ch] || 0, p = this.phase[ch] ?? 1;
      for (let i = 0; i < y.length; i++) {
        p += step;
        if (p >= 1) { p -= 1; h = Math.round(x[i] * levels) / levels; }
        y[i] = h;
      }
      this.held[ch] = h;
      this.phase[ch] = p;
    }
    return true;
  }
}
registerProcessor('crush', Crush);
`;

/** How loud the music is, over the sound effects (SFX_VOLUME in sfx.ts). */
const MUSIC_VOLUME = 0.5;
/** The preview's clock: how often it looks ahead, and how far (s). */
const PREVIEW_EVERY = 25, PREVIEW_AHEAD = 0.12;
/** How fast a run of the music fades when another takes over: the time constant (s). */
const RUN_FADE = 0.04;
/** How fast a layer that drops out fades: the time constant (s). It is all but gone in three. */
const LAYER_FADE = 0.6;

export class Music {
  private synth: Synth | null = null;
  private ctx: AudioContext | null = null;
  /** Where the instruments go in, and where the music leaves for the speakers. */
  private input: GainNode | null = null;
  private bus: GainNode | null = null;
  /** Nostalgia mode's way to the bus: a filter, the crusher and another filter. */
  private crusher: AudioNode | null = null;
  private crushed = false;
  style: Style = STYLES[0];
  private bar = -1;
  /** The current run of the music goes through this, so it can be faded out when another starts. */
  private fader: GainNode | null = null;
  /** One fader per layer, inside the run's, so a layer that drops out can fade away on its own. */
  private layerFaders: GainNode[] = [];
  /** How many layers played on the last beat. */
  private heard = LAYERS;
  private preview: { timer: number; next: number; beat: number; bpm: number; layers: number; meter: () => Meter } | null = null;

  init(ctx: AudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.bus = ctx.createGain();
    this.bus.gain.value = MUSIC_VOLUME;
    this.bus.connect(dest);
    this.synth = new Synth(ctx, this.input);
    this.newRun();
    this.route();
    if (!ctx.audioWorklet) return;
    const url = URL.createObjectURL(new Blob([CRUSHER], { type: 'application/javascript' }));
    ctx.audioWorklet.addModule(url).then(() => {
      const filter = (hz: number) => {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.Q.value = Math.SQRT1_2;
        f.frequency.value = Math.min(hz, ctx.sampleRate / 2 - 100);
        return f;
      };
      const before = filter(CRUSH_BEFORE), after = filter(CRUSH_AFTER);
      before.connect(new AudioWorkletNode(ctx, 'crush', { outputChannelCount: [2] })).connect(after).connect(this.bus!);
      this.crusher = before;
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
  restart() {
    this.bar = -1;
    this.newRun();
  }

  /**
   * Notes from here on go through a new fader. What the last run still has to play (a pad
   * or chord can ring for a whole bar) fades out at once, so two tunes never overlap.
   */
  private newRun() {
    const { ctx, synth, input } = this;
    if (!ctx || !synth || !input) return;
    const old = this.fader;
    if (old) {
      old.gain.setTargetAtTime(0, ctx.currentTime, RUN_FADE);
      setTimeout(() => old.disconnect(), RUN_FADE * 10 * 1000);
    }
    const fader = this.fader = ctx.createGain();
    fader.connect(input);
    this.layerFaders = Array.from({ length: LAYERS }, () => {
      const g = ctx.createGain();
      g.connect(fader);
      return g;
    });
    this.heard = LAYERS;
  }

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
    // A layer that drops out (the start screen's five becoming level 1's one) fades away
    // over a couple of seconds; one that joins comes in at full from its first note.
    this.layerFaders.forEach((g, i) => {
      if (i >= layers && i < this.heard) g.gain.setTargetAtTime(0, at, LAYER_FADE);
      if (i < layers && i >= this.heard) { g.gain.cancelScheduledValues(at); g.gain.setValueAtTime(1, at); }
    });
    this.heard = layers;
    this.style.layers.forEach((l, i) => {
      if (i >= layers) return;
      if (this.layerFaders[i]) s.out = this.layerFaders[i];
      l.play(s, b);
    });
  }

  /** Keep the music going on its own clock, at this tempo, while the game isn't driving it. */
  startPreview(bpm: number, meter: () => Meter, layers: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    // Already playing: carry on from where it is, so the music never jumps back to the first bar.
    if (this.preview) { Object.assign(this.preview, { bpm, meter, layers }); return; }
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
    if (!this.preview) return;
    window.clearInterval(this.preview.timer);
    this.preview = null;
    // What it already scheduled stops too.
    this.newRun();
  }
}
