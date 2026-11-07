// The music styles. Each one fills a beat with notes, whatever the time signature: it
// plays on the strong beats and the backbeats the meter gives it, never on a fixed
// count of four. All of them are in A, the key of the Sinepede's two notes (A and E),
// so the game's own tones always fit the music.
//
// To add a style, add an entry to STYLES: an id, a name for the menu, how it dresses
// the game's own tones, and play(). It shows up in the audio menu by itself.

import { hz, noteRand, type Beat, type Synth } from './music';

export interface Style {
  id: string;
  name: string;
  /** How far the off sixteenths are pushed late, as a share of a sixteenth. */
  swing: number;
  /**
   * How the game's own tones sound in this style: the wave of their tones (a Sinepede
   * always stays a pure sine, as it looks), a lowpass over them, and an echo, in beats.
   */
  tint: { wave: OscillatorType; cutoff: number; echo: number; echoBeats: number };
  /**
   * The notes of its scale, in semitones above A (0 to 11), if it keeps to one. Wavell's
   * tones are then moved to the nearest of them, so every note heard belongs to it.
   */
  scale?: readonly number[];
  play(s: Synth, b: Beat): void;
}

/** A chord: its root and its notes, in semitones from A 440. */
interface Chord { root: number; notes: readonly number[] }
const chord = (root: number, ...notes: number[]): Chord => ({ root, notes });

/** The chord for this bar, each lasting `bars` bars. */
const chordAt = (prog: readonly Chord[], b: Beat, bars = 1) => prog[Math.floor(b.bar / bars) % prog.length];

/** How long the bar is from this beat to its end (s). */
const restOfBar = (b: Beat) => (b.meter.beats - b.beat) * b.len;

/** A tune that wanders the scale in small steps, and rests now and then. */
class Tune {
  private at = 0;
  constructor(private readonly scale: readonly number[], private readonly rest: number) {}
  /** The next note in semitones from A 440, or null for a rest. Lands on a chord note on strong beats. */
  next(c: Chord, strong: boolean): number | null {
    if (noteRand() < this.rest) return null;
    const step = [-2, -1, -1, 1, 1, 2, 0][Math.floor(noteRand() * 7)];
    this.at = Math.max(0, Math.min(this.scale.length - 1, this.at + step));
    let n = this.scale[this.at];
    if (strong) {
      const near = c.notes.map((x) => x + 12).reduce((a, x) => (Math.abs(x - n) < Math.abs(a - n) ? x : a));
      n = near;
      this.at = this.scale.reduce((best, x, i) => (Math.abs(x - n) < Math.abs(this.scale[best] - n) ? i : best), 0);
    }
    return n;
  }
}

/** A minor pentatonic, from A 440 up. */
const MINOR_PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19];

// ---------------------------------------------------------------- Vibe: lo-fi, swung, warm keys

const VIBE_PROG = [chord(-12, -12, -9, -5, -2), chord(-16, -16, -12, -9, -5), chord(-9, -9, -5, -2, 2), chord(-14, -14, -10, -7, -3)];
const vibeTune = new Tune(MINOR_PENTA, 0.45);

const vibe: Style = {
  id: 'vibe', name: 'VIBE', swing: 0.22,
  tint: { wave: 'triangle', cutoff: 7000, echo: 0.22, echoBeats: 0.75 },
  play(s, b) {
    const c = chordAt(VIBE_PROG, b), e = b.energy;
    if (b.group) s.kick(b.t(0), 0.9, { decay: 0.1 });
    if (b.groupEnd && !b.group) s.snare(b.t(0), 0.5, { band: 1500, decay: 0.06 });
    // A ghost kick leading into the next strong beat.
    if (b.groupEnd && e > 0.35) s.kick(b.t(3), 0.35, { decay: 0.06 });
    s.hat(b.t(0), 0.12);
    s.hat(b.t(2), 0.2);
    if (e > 0.6) s.hat(b.t(3), 0.07);
    if (b.group) s.tone(b.t(0), hz(c.root - 12), b.len * 1.4, 0.55, { wave: 'triangle', cutoff: 500, release: 0.1 });
    if (b.beat === 0) for (const n of c.notes) s.keys(b.t(0), hz(n), restOfBar(b) * 0.95, 0.16);
    if (e > 0.55) for (const k of [0, 2]) {
      const n = vibeTune.next(c, k === 0 && b.group);
      if (n !== null) s.keys(b.t(k), hz(n), b.len * 0.4, 0.13);
    }
  },
};

// ---------------------------------------------------------------- Chill: slow pads, soft pulse, bells

const CHILL_PROG = [chord(-12, -12, -5, -2, 3, 7), chord(-16, -16, -9, -5, 0, 2)];
const chillTune = new Tune(MINOR_PENTA.map((x) => x + 12), 0.5);

const chill: Style = {
  id: 'chill', name: 'CHILL', swing: 0,
  tint: { wave: 'sine', cutoff: 3500, echo: 0.35, echoBeats: 1.5 },
  play(s, b) {
    const c = chordAt(CHILL_PROG, b, 2), e = b.energy;
    if (b.beat === 0) {
      s.kick(b.t(0), 0.55, { from: 90, to: 40, decay: 0.14 });
      s.pad(b.t(0), c.notes.map(hz), restOfBar(b), 0.35, 700 + e * 600);
      s.tone(b.t(0), hz(c.root - 12), restOfBar(b) * 0.9, 0.35, { attack: 0.08, release: 0.3 });
    }
    if (b.groupEnd) s.block(b.t(0), 0.18, 1200);
    s.hat(b.t(2), 0.06, 0.03, 6000);
    if (e > 0.3) {
      const n = chillTune.next(c, b.group);
      if (n !== null) s.tone(b.t(0), hz(n), 0.05, 0.12, { decay: 0.35, release: 0.5 });
    }
    if (e > 0.75 && b.groupEnd) {
      const n = chillTune.next(c, false);
      if (n !== null) s.tone(b.t(2), hz(n + 12), 0.05, 0.06, { decay: 0.3, release: 0.4 });
    }
  },
};

// ---------------------------------------------------------------- Bluegrass: boom-chick, banjo rolls

const GRASS_PROG = [chord(-12, -12, -8, -5), chord(-7, -7, -3, 0), chord(-12, -12, -8, -5), chord(-17, -17, -13, -10)];
/** A forward roll: which string each sixteenth picks, over the chord, with a high drone on the fifth string. */
const ROLL = [0, 1, 3, 0, 1, 3, 0, 3];

const bluegrass: Style = {
  id: 'bluegrass', name: 'BLUEGRASS', swing: 0.08,
  tint: { wave: 'triangle', cutoff: 6000, echo: 0.1, echoBeats: 0.25 },
  play(s, b) {
    const c = chordAt(GRASS_PROG, b), e = b.energy;
    // Boom on the strong beats, root then fifth; chick on the others. The boom is a soft,
    // round bass kept between 55 and 110 Hz: deep, but still there on small speakers.
    if (b.group) {
      let n = (b.beat === 0 ? c.root : c.root + 7) - 24;
      if (n < -36) n += 12;
      s.bass(b.t(0), hz(n), b.len * 0.9, 0.45);
    } else {
      s.strum(b.t(0), c.notes.map((n) => hz(n + 12)), 0.8, { bright: 0.6 });
      s.snare(b.t(0), 0.18, { band: 2500, decay: 0.04, tone: 0 });
    }
    if (e > 0.25) {
      const strings = [...c.notes.map((n) => n + 12), c.root + 19];
      const every = e > 0.5 ? 1 : 2;
      for (let k = 0; k < 4; k += every) {
        const i = ROLL[(b.beat * 4 + k) % ROLL.length];
        s.pluck(b.t(k), hz(strings[Math.min(i, strings.length - 1)]), 0.5, { bright: 0.85, seconds: 0.5, damp: 0.99 });
      }
    }
    if (e > 0.7 && b.group) s.block(b.t(2), 0.12, 700);
  },
};

// ---------------------------------------------------------------- Chiptune: square waves and noise, an old console

const CHIP_PROG = [chord(-12, 0, 3, 7), chord(-16, -4, 0, 3), chord(-9, 3, 7, 10), chord(-14, -2, 2, 5)];
const chipTune = new Tune(MINOR_PENTA.map((x) => x + 12), 0.3);

const chiptune: Style = {
  id: 'chip', name: 'CHIPTUNE', swing: 0,
  tint: { wave: 'square', cutoff: 9000, echo: 0, echoBeats: 0.5 },
  play(s, b) {
    const c = chordAt(CHIP_PROG, b), e = b.energy;
    if (b.group) s.kick(b.t(0), 0.8, { from: 180, to: 50, decay: 0.05, wave: 'triangle' });
    if (b.groupEnd && !b.group) s.snare(b.t(0), 0.35, { band: 3000, decay: 0.05, tone: 0 });
    s.hat(b.t(2), 0.08, 0.012, 9000);
    // The bass jumps an octave on the eighths, like a console's triangle channel.
    for (const k of [0, 2]) s.tone(b.t(k), hz(c.root - 12 + (k ? 12 : 0)), b.len * 0.4, 0.4, { wave: 'triangle', release: 0.02 });
    if (e > 0.35) for (let k = 0; k < 4; k++) {
      s.tone(b.t(k), hz(c.notes[(b.beat * 4 + k) % c.notes.length]), b.len * 0.18, 0.05, { wave: 'square', release: 0.01 });
    }
    if (e > 0.65) {
      const n = chipTune.next(c, b.group);
      if (n !== null) s.tone(b.t(0), hz(n), b.len * 0.7, 0.07, { wave: 'square', release: 0.03 });
    }
  },
};

// ---------------------------------------------------------------- Lotus: bamboo flutes, koto and temple woods

/**
 * The yo scale on A (A, B, D, E, F sharp): the bright pentatonic of Japanese folk songs,
 * and the scale everything in Lotus keeps to, Wavell's tones included. It keeps A and E,
 * the Sinepede's notes.
 */
const YO = [0, 2, 5, 7, 9];
/** The scale across the instruments' range, in semitones from A 440. */
const YO_RANGE = [-12, -10, -7, -5, -3, 0, 2, 5, 7, 9, 12];
/** No Western chords: a soft drone and its fifth, moving slowly between A, D and E, all of them in the scale. */
const LOTUS_PROG = [chord(-24, -12, -5, 0), chord(-19, -7, 0, 5), chord(-24, -12, -5, 0), chord(-17, -5, 2, 7)];
/** The flute sings in the middle and top of the range, where the scale sounds brightest. */
const shakuhachi = new Tune(YO_RANGE.slice(3), 0.35);
const koto = new Tune(YO_RANGE.slice(0, 9), 0.4);
/** The koto's sweep up its strings, the sound it is best known for. */
const SWEEP = [-12, -10, -7, -5, -3, 0];

const lotus: Style = {
  id: 'lotus', name: 'LOTUS', swing: 0,
  tint: { wave: 'sine', cutoff: 3000, echo: 0.3, echoBeats: 1.5 },
  scale: YO,
  play(s, b) {
    const c = chordAt(LOTUS_PROG, b, 2), e = b.energy, first = b.beat === 0;
    // Under it all, a soft hum on the drone and its fifth: no plucked bass, no drum.
    if (first) {
      const dur = restOfBar(b);
      s.tone(b.t(0), hz(c.root), dur, 0.1, { attack: 0.6, release: 0.8, cutoff: 500 });
      s.tone(b.t(0), hz(c.root + 7), dur, 0.045, { attack: 0.8, release: 0.8, cutoff: 700 });
    }
    // Temple woods: a hollow block on the strong beats, a light tap on the backbeats.
    if (b.group) s.block(b.t(0), first ? 0.2 : 0.12, 520, 0.05);
    if (b.groupEnd && !b.group && e > 0.3) s.block(b.t(0), 0.06, 1150, 0.025);
    // The koto: a gentle sweep every other bar, and a few unhurried notes in between.
    if (first && b.bar % 2 === 0) s.strum(b.t(0), SWEEP.map(hz), 0.34, { bright: 0.45, seconds: 1.6, gap: 0.08, damp: 0.998 });
    else {
      const n = koto.next(c, b.group);
      if (n !== null) s.pluck(b.t(0), hz(n), 0.26, { bright: 0.45, seconds: 1.4, damp: 0.998 });
      // Now and then the same string again, an octave up, as it dies away.
      if (n !== null && e > 0.45 && noteRand() < 0.3) s.pluck(b.t(2), hz(n + 12), 0.09, { bright: 0.45, seconds: 1.2, damp: 0.998 });
    }
    // The shakuhachi: long breaths on the bar and half way through it, with rests between.
    if (first || (b.group && e > 0.4)) {
      const n = shakuhachi.next(c, first);
      if (n !== null) s.flute(b.t(0), hz(n), Math.min(restOfBar(b), b.len * 3) * 0.85, 0.19);
    }
    // A higher flute answers at the end of the bar, quietly.
    if (e > 0.5 && b.beat === b.meter.beats - 1 && noteRand() < 0.5) {
      const n = shakuhachi.next(c, false);
      if (n !== null) s.flute(b.t(1), hz(n + 12), b.len * 0.6, 0.06);
    }
  },
};

export const STYLES: readonly Style[] = [vibe, chill, bluegrass, chiptune, lotus];
export const styleById = (id: string) => STYLES.find((s) => s.id === id) ?? STYLES[0];
