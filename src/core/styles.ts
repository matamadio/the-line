// The music styles. Each one fills a beat with notes, whatever the time signature: it
// plays on the strong beats and the backbeats the meter gives it, never on a fixed
// count of four. All of them are in A, the key of the Sinepede's two notes (A and E),
// so the game's own tones always fit the music.
//
// Each style is five layers, and the music builds up one instrument per level: level 1
// plays the first layer, level 2 adds the second, and so on until all five play from
// level 5 on. A style may have a sixth and a seventh, joining at levels 6 and 7.
//
// To add a style, add an entry to STYLES: an id, a name for the menu, how it dresses
// the game's own tones, and its five layers. It shows up in the audio menu by itself.

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
  /** The first plays from level 1, and each of the others joins one level later: a sixth at level 6, a seventh at 7. */
  layers: readonly [Layer, Layer, Layer, Layer, Layer] | readonly [Layer, Layer, Layer, Layer, Layer, Layer] | readonly [Layer, Layer, Layer, Layer, Layer, Layer, Layer];
}

/** One instrument's part. The first layer may hold a few: the base the others build on. */
export interface Layer { name: string; play(s: Synth, b: Beat): void }

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
  layers: [
    { name: 'kick, bass and electric piano', play(s, b) {
      const c = chordAt(VIBE_PROG, b);
      if (b.group) s.kick(b.t(0), 0.9, { decay: 0.1 });
      // A ghost kick leading into the next strong beat.
      if (b.groupEnd) s.kick(b.t(3), 0.35, { decay: 0.06 });
      if (b.group) s.tone(b.t(0), hz(c.root - 12), b.len * 1.4, 0.55, { wave: 'triangle', cutoff: 500, release: 0.1 });
      if (b.beat === 0) for (const n of c.notes) s.keys(b.t(0), hz(n), restOfBar(b) * 0.95, 0.16);
    } },
    { name: 'snare', play(s, b) {
      if (b.groupEnd && !b.group) s.snare(b.t(0), 0.5, { band: 1500, decay: 0.06 });
    } },
    { name: 'hi-hats', play(s, b) {
      s.hat(b.t(0), 0.12);
      s.hat(b.t(2), 0.2);
      s.hat(b.t(3), 0.07);
    } },
    { name: 'piano melody', play(s, b) {
      const c = chordAt(VIBE_PROG, b);
      for (const k of [0, 2]) {
        const n = vibeTune.next(c, k === 0 && b.group);
        if (n !== null) s.keys(b.t(k), hz(n), b.len * 0.4, 0.13);
      }
    } },
    { name: 'warm pad', play(s, b) {
      if (b.beat === 0) s.pad(b.t(0), chordAt(VIBE_PROG, b).notes.map(hz), restOfBar(b), 0.14, 800);
    } },
  ],
};

// ---------------------------------------------------------------- Chill: slow pads, soft pulse, bells

const CHILL_PROG = [chord(-12, -12, -5, -2, 3, 7), chord(-16, -16, -9, -5, 0, 2)];
const chillTune = new Tune(MINOR_PENTA.map((x) => x + 12), 0.5);
const chillFlute = new Tune(MINOR_PENTA, 0.4);

const chill: Style = {
  id: 'chill', name: 'CHILL', swing: 0,
  tint: { wave: 'sine', cutoff: 3500, echo: 0.35, echoBeats: 1.5 },
  layers: [
    { name: 'pad, deep bass and woodblock', play(s, b) {
      const c = chordAt(CHILL_PROG, b, 2);
      if (b.beat === 0) {
        s.pad(b.t(0), c.notes.map(hz), restOfBar(b), 0.35, 1000);
        s.tone(b.t(0), hz(c.root - 12), restOfBar(b) * 0.9, 0.35, { attack: 0.08, release: 0.3 });
      }
      if (b.groupEnd) s.block(b.t(0), 0.18, 1200);
    } },
    { name: 'soft kick', play(s, b) {
      if (b.beat === 0) s.kick(b.t(0), 0.55, { from: 90, to: 40, decay: 0.14 });
    } },
    { name: 'shaker', play(s, b) {
      s.hat(b.t(2), 0.12, 0.03, 6000);
    } },
    { name: 'bells', play(s, b) {
      const n = chillTune.next(chordAt(CHILL_PROG, b, 2), b.group);
      if (n !== null) s.tone(b.t(0), hz(n), 0.05, 0.12, { decay: 0.35, release: 0.5 });
    } },
    { name: 'flute', play(s, b) {
      // Long, quiet notes at the end of each group, under the bells.
      if (!b.groupEnd) return;
      const n = chillFlute.next(chordAt(CHILL_PROG, b, 2), false);
      if (n !== null) s.flute(b.t(1), hz(n), b.len * 1.5, 0.09);
    } },
  ],
};

// ---------------------------------------------------------------- Bluegrass: boom-chick, banjo, mandolin, fiddle

const GRASS_PROG = [chord(-12, -12, -8, -5), chord(-7, -7, -3, 0), chord(-12, -12, -8, -5), chord(-17, -17, -13, -10)];
/** A forward roll: which string each sixteenth picks, over the chord, with a high drone on the fifth string. */
const ROLL = [0, 1, 3, 0, 1, 3, 0, 3];
/** The fiddle plays in A major, around the middle of its range. */
const fiddleTune = new Tune([-5, -3, -1, 0, 2, 4, 5, 7, 9, 12], 0.25);

const bluegrass: Style = {
  id: 'bluegrass', name: 'BLUEGRASS', swing: 0.08,
  tint: { wave: 'triangle', cutoff: 6000, echo: 0.1, echoBeats: 0.25 },
  layers: [
    { name: 'bass, guitar and brushes', play(s, b) {
      const c = chordAt(GRASS_PROG, b);
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
    } },
    { name: 'banjo', play(s, b) {
      // It rolls in the background on the eighths: in the chord's own octave with the drone
      // a fifth above the root, mellow rather than bright.
      const c = chordAt(GRASS_PROG, b), strings = [...c.notes, c.root + 7];
      for (const k of [0, 2]) {
        const i = ROLL[(b.beat * 4 + k) % ROLL.length];
        s.pluck(b.t(k), hz(strings[Math.min(i, strings.length - 1)]), 0.2, { bright: 0.55, seconds: 0.5, damp: 0.99 });
      }
    } },
    { name: 'mandolin chop', play(s, b) {
      // A short, muted chord high up on the backbeat.
      if (b.groupEnd && !b.group) s.strum(b.t(0), chordAt(GRASS_PROG, b).notes.map((n) => hz(n + 24)), 0.45, { bright: 0.7, seconds: 0.15, damp: 0.96, gap: 0.006 });
    } },
    { name: 'fiddle', play(s, b) {
      // A long bowed note on the strong beats.
      if (!b.group) return;
      const n = fiddleTune.next(chordAt(GRASS_PROG, b), b.beat === 0);
      if (n !== null) s.fiddle(b.t(0), hz(n), b.len * 1.6, 0.1);
    } },
    { name: 'spoons', play(s, b) {
      // Wooden taps on the off sixteenths, pushing it along.
      s.block(b.t(1), 0.1, 1400, 0.012);
      s.block(b.t(3), 0.14, 1400, 0.012);
    } },
  ],
};

// ---------------------------------------------------------------- Chiptune: square waves and noise, an old console

const CHIP_PROG = [chord(-12, 0, 3, 7), chord(-16, -4, 0, 3), chord(-9, 3, 7, 10), chord(-14, -2, 2, 5)];
const chipTune = new Tune(MINOR_PENTA.map((x) => x + 12), 0.3);

const chiptune: Style = {
  id: 'chip', name: 'CHIPTUNE', swing: 0,
  tint: { wave: 'square', cutoff: 9000, echo: 0, echoBeats: 0.5 },
  layers: [
    { name: 'kick and triangle bass', play(s, b) {
      const c = chordAt(CHIP_PROG, b);
      if (b.group) s.kick(b.t(0), 0.8, { from: 180, to: 50, decay: 0.05, wave: 'triangle' });
      // The bass jumps an octave on the eighths, like a console's triangle channel.
      for (const k of [0, 2]) s.tone(b.t(k), hz(c.root - 12 + (k ? 12 : 0)), b.len * 0.4, 0.4, { wave: 'triangle', release: 0.02 });
    } },
    { name: 'noise drums', play(s, b) {
      if (b.groupEnd && !b.group) s.snare(b.t(0), 0.35, { band: 3000, decay: 0.05, tone: 0 });
      s.hat(b.t(2), 0.08, 0.012, 9000);
    } },
    { name: 'arpeggio', play(s, b) {
      const c = chordAt(CHIP_PROG, b);
      for (let k = 0; k < 4; k++) s.tone(b.t(k), hz(c.notes[(b.beat * 4 + k) % c.notes.length]), b.len * 0.18, 0.05, { wave: 'square', release: 0.01 });
    } },
    { name: 'square lead', play(s, b) {
      const n = chipTune.next(chordAt(CHIP_PROG, b), b.group);
      if (n !== null) s.tone(b.t(0), hz(n), b.len * 0.7, 0.07, { wave: 'square', release: 0.03 });
    } },
    { name: 'tom fills', play(s, b) {
      // Falling triangle toms on the last beat of every other bar, into the next one.
      if (b.bar % 2 !== 1 || b.beat !== b.meter.beats - 1) return;
      for (let k = 0; k < 4; k++) s.kick(b.t(k), 0.4, { from: 260 - k * 40, to: 120 - k * 15, decay: 0.05, wave: 'triangle' });
    } },
  ],
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
/** The koto's arpeggio: up and back down the chord's root, fifth, octave and the scale's ninth. */
const KOTO_ARP = [0, 7, 12, 14, 12, 7];
/** The koto's sweep up its strings, the sound it is best known for. */
const SWEEP = [-12, -10, -7, -5, -3, 0];

const lotus: Style = {
  id: 'lotus', name: 'LOTUS', swing: 0,
  tint: { wave: 'sine', cutoff: 3000, echo: 0.3, echoBeats: 1.5 },
  scale: YO,
  layers: [
    { name: 'temple woods', play(s, b) {
      // Only wood at first: a low temple block on the strong beats, high clappers between.
      if (b.group) s.block(b.t(0), b.beat === 0 ? 0.22 : 0.13, 520, 0.05);
      if (b.groupEnd && !b.group) s.block(b.t(0), 0.11, 1150, 0.025);
      if (b.beat === b.meter.beats - 1 && b.bar % 2 === 1) s.block(b.t(2), 0.07, 1150, 0.025);
    } },
    { name: 'koto arpeggio', play(s, b) {
      // Two notes a beat, rising and falling over the chord, the strings left to ring.
      const c = chordAt(LOTUS_PROG, b, 2), step = (b.bar * b.meter.beats + b.beat) * 2;
      for (const k of [0, 2]) {
        const n = c.root + 12 + KOTO_ARP[(step + k / 2) % KOTO_ARP.length];
        s.pluck(b.t(k), hz(n), b.beat === 0 && k === 0 ? 0.26 : 0.18, { bright: 0.45, seconds: 1.4, damp: 0.998 });
      }
    } },
    { name: 'flutes', play(s, b) {
      const c = chordAt(LOTUS_PROG, b, 2);
      // The shakuhachi: long breaths on the strong beats, with rests between.
      if (b.group) {
        const n = shakuhachi.next(c, b.beat === 0);
        if (n !== null) s.flute(b.t(0), hz(n), Math.min(restOfBar(b), b.len * 3) * 0.85, 0.19);
      }
      // A high flute answers at the end of every other bar, quietly.
      if (b.beat === b.meter.beats - 1 && b.bar % 2 === 1) {
        const n = shakuhachi.next(c, false);
        if (n !== null) s.flute(b.t(1), hz(n + 12), b.len * 0.6, 0.06);
      }
    } },
    { name: 'soft drone', play(s, b) {
      // A soft hum on the drone and its fifth under it all.
      if (b.beat !== 0) return;
      const c = chordAt(LOTUS_PROG, b, 2), dur = restOfBar(b);
      s.tone(b.t(0), hz(c.root), dur, 0.1, { attack: 0.6, release: 0.8, cutoff: 500 });
      s.tone(b.t(0), hz(c.root + 7), dur, 0.045, { attack: 0.8, release: 0.8, cutoff: 700 });
    } },
    { name: 'taiko and koto sweep', play(s, b) {
      // A deep drum to open each bar, and the koto sweeping up its strings every other bar.
      if (b.beat !== 0) return;
      s.taiko(b.t(0), 0.3);
      if (b.bar % 2 === 0) s.strum(b.t(0), SWEEP.map(hz), 0.3, { bright: 0.45, seconds: 1.6, gap: 0.08, damp: 0.998 });
    } },
  ],
};

// ---------------------------------------------------------------- Tekno: four on the floor, acid, rave stabs

/**
 * The chords, by name, each lasting two bars. Edit this line to change the progression: a
 * note (A to G, with # or b) and then nothing (major), m, 7, m7 or maj7. The game is in A
 * minor, so chords from it fit best: Am Bdim C Dm Em F G, plus E or E7 (the major V).
 */
const TEK_CHORDS = 'Am7 Dm7 Fmaj7 E7';

const NOTE: Record<string, number> = { A: 0, B: 2, C: 3, D: 5, E: 7, F: 8, G: 10 };
const QUALITY: Record<string, number[]> = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6] };
/**
 * Reads chord names like 'Am7 Fmaj7' into chords. Each note goes between G sharp and G
 * below A440, so the chords sit close together and the stabs step rather than leap.
 */
const chords = (names: string) => names.trim().split(/\s+/).map((name) => {
  const m = /^([A-G])([#b]?)(.*)$/.exec(name);
  const quality = m && QUALITY[m[3]];
  if (!m || !quality) throw new Error(`Unknown chord: ${name}`);
  const root = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const place = (n: number) => { n = (((n % 12) + 12) % 12) - 12; return n > -2 ? n - 12 : n; };
  return chord(place(root), ...quality.map((q) => place(root + q)));
});
const TEK_PROG = chords(TEK_CHORDS);

/** A natural minor, in semitones above A. */
const A_MINOR = [0, 2, 3, 5, 7, 8, 10];
const pitchClass = (n: number) => ((n % 12) + 12) % 12;
/**
 * The scale under a chord: the style's scale (A natural minor unless it says), with any of
 * the chord's own notes that fall outside it (the G sharp of E7) taking the place of the
 * scale note just below.
 */
const scaleFor = (c: Chord, base: readonly number[] = A_MINOR) => {
  const notes = new Set(base);
  for (const n of c.notes) if (!notes.has(pitchClass(n))) { notes.delete(pitchClass(n - 1)); notes.add(pitchClass(n)); }
  return notes;
};
/** Moves a note to the nearest note of the scale, down when two are as near. */
const inScale = (n: number, scale: Set<number>) => {
  for (let d = 0; ; d++) {
    if (scale.has(pitchClass(n - d))) return n - d;
    if (scale.has(pitchClass(n + d))) return n + d;
  }
};
/**
 * The acid line, a sixteenth at a time: semitones above the chord's root (then moved into
 * the chord's scale, so a minor third stays in key over a major chord), or null for a rest. The steps in ACID_ACCENT are accented: louder, and the filter opens wider.
 */
const ACID: readonly (number | null)[] = [0, null, 12, 0, 3, null, 0, 7, 0, null, 10, 0, 12, 3, null, 7];
const ACID_ACCENT = [0, 4, 8, 12];

/** The bass note of a chord, kept between 55 and 110 Hz. */
const lowRoot = (c: Chord) => { let n = c.root - 24; while (n < -36) n += 12; return n; };

const tekno: Style = {
  id: 'tekno', name: 'TEKNO', swing: 0,
  tint: { wave: 'square', cutoff: 5000, echo: 0.2, echoBeats: 0.75 },
  layers: [
    { name: 'kick and offbeat bass', play(s, b) {
      // A kick on every beat, whatever the time signature, and the bass in the gaps between.
      const c = chordAt(TEK_PROG, b, 2);
      s.kick(b.t(0), 1, { from: 160, to: 45, decay: 0.12 });
      s.tone(b.t(2), hz(lowRoot(c)), b.len * 0.3, 0.55, { wave: 'sawtooth', cutoff: 520, release: 0.02 });
    } },
    { name: 'open hi-hat', play(s, b) {
      s.hat(b.t(2), 0.34, 0.05, 7000);
    } },
    { name: 'clap', play(s, b) {
      // Two bursts a hair apart sound like hands.
      if (!b.groupEnd || b.group) return;
      s.snare(b.t(0), 0.42, { band: 1200, decay: 0.03, tone: 0 });
      s.snare(b.t(0) + 0.012, 0.5, { band: 1300, decay: 0.07, tone: 0 });
    } },
    { name: 'acid line', play(s, b) {
      const c = chordAt(TEK_PROG, b, 2), root = lowRoot(c) + 12, scale = scaleFor(c);
      for (let k = 0; k < 4; k++) {
        const i = (b.beat * 4 + k) % ACID.length, n = ACID[i];
        if (n !== null) s.acid(b.t(k), hz(inScale(root + n, scale)), b.len * 0.2, 0.14, ACID_ACCENT.includes(i));
      }
    } },
    { name: 'rave stabs', play(s, b) {
      // A short chord on the off beat at the end of each group, every other bar.
      if (!b.groupEnd || b.bar % 2 === 0) return;
      for (const n of chordAt(TEK_PROG, b, 2).notes) s.tone(b.t(2), hz(n + 12), 0.04, 0.07, { wave: 'sawtooth', cutoff: 2200, decay: 0.08, release: 0.1 });
    } },
  ],
};

// ---------------------------------------------------------------- Trip: trip-hop, slow and heavy, a lonely lead

/** The chords, by name, one bar each. Change them as TEK_CHORDS says. */
const TRIP_CHORDS = 'B Em7 A B';
const TRIP_PROG = chords(TRIP_CHORDS);
/** E dorian (E F# G A B C# D), in semitones above A. Under the B chord, its D sharp takes D's place. */
const E_DORIAN = [0, 2, 4, 5, 7, 9, 10];
/** The lead wanders E dorian from the E above A 440. */
const tripTune = new Tune([7, 9, 10, 12, 14, 16, 17, 19, 21], 0.5);
/** The lead's last note (Hz), so the next slides up or down from it. */
let tripLast = 0;

const trip: Style = {
  id: 'trip', name: 'TRIP', swing: 0.3,
  tint: { wave: 'sine', cutoff: 2800, echo: 0.3, echoBeats: 1 },
  layers: [
    { name: 'heavy kick, sub bass and Rhodes', play(s, b) {
      const c = chordAt(TRIP_PROG, b);
      // Boom, bap, and a lazy boom just after the bap.
      if (b.group) {
        s.kick(b.t(0), 1, { from: 120, to: 42, decay: 0.16 });
        s.tone(b.t(0), hz(lowRoot(c)), b.len * 1.6, 0.5, { wave: 'sine', cutoff: 220, release: 0.2 });
      }
      if (b.groupEnd && !b.group) s.kick(b.t(2), 0.6, { from: 110, to: 42, decay: 0.12 });
      if (b.beat === 0) for (const n of c.notes) s.keys(b.t(0), hz(n), restOfBar(b) * 0.9, 0.12);
    } },
    { name: 'dusty snare and vinyl crackle', play(s, b) {
      if (b.groupEnd && !b.group) s.snare(b.t(0), 0.6, { band: 900, decay: 0.14 });
      // The crackle: tiny clicks, scattered at random.
      for (let k = 0; k < 4; k++) if (noteRand() < 0.4) s.hat(b.t(k) + noteRand() * 0.05, 0.08, 0.003, 2500);
    } },
    { name: 'lazy hi-hats', play(s, b) {
      s.hat(b.t(0), 0.16, 0.03, 6000);
      s.hat(b.t(2), 0.26, 0.05, 6000);
      if (noteRand() < 0.5) s.hat(b.t(3), 0.06, 0.02, 6000);
    } },
    { name: 'theremin lead', play(s, b) {
      const c = chordAt(TRIP_PROG, b), n = tripTune.next(c, b.group);
      if (n === null) return;
      const f = hz(inScale(n, scaleFor(c, E_DORIAN)));
      s.theremin(b.t(0), tripLast, f, b.len * 0.95, 0.09);
      tripLast = f;
    } },
    { name: 'string swell', play(s, b) {
      if (b.beat === 0) s.pad(b.t(0), chordAt(TRIP_PROG, b).notes.map((n) => hz(n + 12)), restOfBar(b), 0.12, 1400);
    } },
  ],
};

// ---------------------------------------------------------------- Epic: an orchestra, glorious and pompous

/**
 * The chords, two bars each, by name like TEK_CHORDS: the big minor of film music, A minor
 * rising through F and C to G and back.
 */
const EPIC_CHORDS = 'Am F C G';
const EPIC_PROG = chords(EPIC_CHORDS);
/** The cellos' figure under each beat, two notes a beat: semitones above the chord's root. */
const CELLO_FIGURE = [0, 0, 7, 0, 12, 7, 0, 7];
/**
 * The violins' figure, a beat of triplets at a time over two beats: 1 a short bow, 2 an
 * accent held a little, 0 a rest. The accents fall off the beat.
 */
const VIOLIN_FIGURE: readonly (readonly (0 | 1 | 2)[])[] = [[1, 0, 2], [0, 2, 1]];
/** The horns' tune, from the A natural minor scale over two octaves. */
const hornTune = new Tune([0, 2, 3, 5, 7, 8, 10, 12, 14, 15], 0.2);
/**
 * The marching drums, over two beats of four sixteenths each (in 6/8, triplets). The bass
 * drum on a 3 + 3 + 2 (on 1, the last sixteenth of 1, and the "and" of 2), pushing ahead of
 * the beat. The snare a military cadence: "TAT, ta-ta" (a flammed accent, two taps on the
 * last sixteenths), then "rrrrr-TAT" (a buzz roll swelling into an accent on the "and").
 */
const MARCH_BASS = [[0, 3], [2]];
/** How loud the tuba call is: the loudest thing in the orchestra while it plays. */
const TUBA_VOLUME = 0.32;
/** How many bars a phrase lasts: the timpani roll and the cymbal swell lead into the next. */
const EPIC_PHRASE = 4;
/** How many beats are left in the group this beat is in, counting it: to the next strong beat. */
const groupLeft = (b: Beat) => {
  let end = 0;
  for (const g of b.meter.groups) { end += g; if (b.beat < end) return end - b.beat; }
  return b.meter.beats - b.beat;
};
/** The last beat of a phrase. */
const endOfPhrase = (b: Beat) => b.bar % EPIC_PHRASE === EPIC_PHRASE - 1 && b.beat === b.meter.beats - 1;

const epic: Style = {
  id: 'epic', name: 'EPIC', swing: 0,
  tint: { wave: 'sawtooth', cutoff: 3200, echo: 0.28, echoBeats: 1 },
  scale: A_MINOR,
  layers: [
    { name: 'timpani and cellos', play(s, b) {
      const c = chordAt(EPIC_PROG, b, 2), low = lowRoot(c);
      // Timpani on the root at the head of each bar and the fifth on the other strong beats,
      // rolling into the next phrase.
      if (b.beat === 0) s.timpani(b.t(0), hz(low), 0.42);
      else if (b.group) s.timpani(b.t(0), hz(low + 7), 0.28);
      if (endOfPhrase(b)) s.timpaniRoll(b.t(0), hz(low), b.len, 0.3);
      // The cellos drive two notes a beat, short and dug in.
      const step = (b.bar * b.meter.beats + b.beat) * 2;
      for (const k of [0, 2]) {
        const n = low + 12 + CELLO_FIGURE[(step + k / 2) % CELLO_FIGURE.length];
        s.section(b.t(k), hz(n), b.len * 0.38, b.group && k === 0 ? 0.2 : 0.14, { cutoff: 1300, bow: 0.02 });
      }
    } },
    { name: 'marching drums', play(s, b) {
      // A field drum, syncopated, and a military snare: TAT, ta-ta, rrrrr-TAT. On the last
      // beat of a phrase the snare rolls right through it, swelling into the next. Every
      // accent and tap has a snap on top: a high, tight crack of the wires and the rim.
      const half = b.beat % 2;
      for (const k of MARCH_BASS[half]) s.kick(b.t(k), k ? 0.4 : 0.5, { from: 120, to: 58, decay: 0.16 });
      const snap = (at: number, vol: number) => {
        s.snare(at, vol, { band: 5500, decay: 0.022, tone: 0 });
        s.block(at, vol * 0.45, 1900, 0.008);
      };
      const tap = (at: number, vol: number) => s.snare(at, vol, { band: 2800, decay: 0.035, tone: 0.25 });
      const accent = (at: number, vol = 0.18) => {
        tap(at - 0.018, vol * 0.35);
        s.snare(at, vol, { band: 2600, decay: 0.07, tone: 0.35 });
        snap(at, vol * 0.9);
      };
      const roll = (from: number, to: number, vol0: number, vol1: number) => {
        const n = Math.max(4, Math.round((to - from) / 0.032));
        for (let i = 0; i < n; i++) tap(from + ((to - from) * i) / n, vol0 + ((vol1 - vol0) * i) / n);
      };
      if (endOfPhrase(b)) roll(b.t(0), b.at + b.len, 0.03, 0.12);
      else if (half === 0) { accent(b.t(0)); for (const [k, v] of [[2, 0.08], [3, 0.1]]) { tap(b.t(k), v); snap(b.t(k), v * 0.7); } }
      else { roll(b.t(0), b.t(2), 0.03, 0.08); accent(b.t(2)); }
    } },
    { name: 'basses and violas', play(s, b) {
      // The chord held through the bar by the violas, the basses an octave under the root.
      if (b.beat !== 0) return;
      const c = chordAt(EPIC_PROG, b, 2), dur = restOfBar(b);
      s.section(b.t(0), hz(lowRoot(c)), dur, 0.16, { cutoff: 700, bow: 0.2 });
      for (const n of c.notes) s.section(b.t(0), hz(n), dur, 0.07, { cutoff: 1800, bow: 0.3 });
      // A choir sings the chord with them, from the second bar of each chord: "aah".
      if (b.bar % 2 === 1) s.choir(b.t(0), c.notes.map(hz), dur, 0.14);
    } },
    { name: 'violins and glockenspiel', play(s, b) {
      // Syncopated triplet hits on the chord's top notes: a figure over two beats that skips
      // some of the triplets and leans on the off ones, a held accent tied over the gap.
      const c = chordAt(EPIC_PROG, b, 2), third = b.len / 3;
      const figure = VIOLIN_FIGURE[(b.bar * b.meter.beats + b.beat) % VIOLIN_FIGURE.length];
      figure.forEach((hit, k) => {
        if (!hit) return;
        const accent = hit === 2, dur = third * (accent ? 1.4 : 0.55);
        for (const n of c.notes.slice(-2)) s.section(b.at + k * third, hz(n + 24), dur, accent ? 0.16 : 0.09, { cutoff: 3600, bow: 0.02 });
      });
      // The glockenspiel sparkles down the chord at the end of each phrase.
      if (endOfPhrase(b)) [...c.notes].reverse().forEach((n, i) => s.glock(b.at + i * third, hz(n + 36), 0.09));
    } },
    { name: 'horns and trombones', play(s, b) {
      const c = chordAt(EPIC_PROG, b, 2);
      // Trombones punch the chord on the off beats, short and heavy.
      if (b.groupEnd && !b.group) for (const n of c.notes) s.brass(b.t(0), hz(n - 12), b.len * 0.3, 0.05, 0.2);
      // The tune, in long, noble notes on the strong beats, held to the next one.
      if (!b.group) return;
      const n = hornTune.next(c, b.beat === 0);
      if (n === null) return;
      s.brass(b.t(0), hz(n - 12), groupLeft(b) * b.len * 0.92, 0.17);
    } },
    { name: 'percussion and fanfare', play(s, b) {
      const c = chordAt(EPIC_PROG, b, 2);
      // A bass drum on the head of each bar, and a military snare on the triplets, rolling into each phrase.
      if (b.beat === 0) s.kick(b.t(0), 0.35, { from: 70, to: 38, decay: 0.3 });
      const third = b.len / 3;
      if (endOfPhrase(b)) for (let k = 0; k < 6; k++) s.snare(b.at + k * third / 2, 0.06 + 0.02 * k, { band: 2200, decay: 0.04, tone: 0.2 });
      else if (b.groupEnd) for (const k of [0, 2]) s.snare(b.at + k * third, k ? 0.07 : 0.1, { band: 2200, decay: 0.04, tone: 0.2 });
      // A crash opens each phrase, a cymbal swells into it.
      if (b.beat === 0 && b.bar % EPIC_PHRASE === 0) s.crash(b.t(0), 0.16);
      if (endOfPhrase(b)) s.swell(b.t(0), b.len, 0.14);
      // Trumpets: a fanfare on the chord at the head of every other bar, short, short, long.
      if (b.beat === 0 && b.bar % 2 === 0) {
        const top = c.notes.map((n) => n + 12);
        s.brass(b.t(0), hz(top[0]), b.len * 0.2, 0.1, 1);
        s.brass(b.t(1), hz(top[1]), b.len * 0.2, 0.1, 1);
        s.brass(b.t(2), hz(top[2]), Math.min(restOfBar(b) - b.len * 0.5, b.len * 2) * 0.9, 0.12, 1);
      }
    } },
    { name: 'tuba call', play(s, b) {
      // The glorious tuba call, from level 7, every two bars: a short root, then the fifth
      // held long and proud to the end of the bar.
      if (b.bar % 2 !== 0) return;
      const root = lowRoot(chordAt(EPIC_PROG, b, 2)) + 12;
      if (b.beat === 0) {
        s.tuba(b.t(0), hz(root), b.len * 0.35, TUBA_VOLUME);
        s.tuba(b.t(2), hz(root + 7), (restOfBar(b) - b.len / 2) * 0.95, TUBA_VOLUME);
      }
    } },
  ],
};

// ---------------------------------------------------------------- Anxiety: a tempo that seems to run away

/*
 * The game plays on the beat, so the tempo never really changes. The rush is an illusion,
 * made of two endless loops, each ANX_CYCLE bars long and joining up with no seam:
 *
 * - A Risset rhythm (the Shepard tone's rhythmic twin): ticks on five rungs, each twice as
 *   fast as the one under it, every rung speeding up smoothly until it is twice as fast by
 *   the end of the cycle, when it has become the rung above. The loudest rungs are in the
 *   middle; the fastest fades out as it speeds up and the slowest fades in, so the ticking
 *   seems to speed up for ever. It floats free of the beat in between, and lands on it
 *   again at the head of every cycle.
 * - A Shepard tone: octaves of a sine all gliding up an octave over the cycle, the top one
 *   fading out as a new one fades in under, so it seems to rise for ever.
 *
 * Over them, an ostinato in groups of three sixteenths against the beat's four (a hemiola),
 * and strings on a tense chord swelling and ebbing over the cycle. A heartbeat stays on the
 * downbeat and a clock ticks each beat: the anchor, so the real beat can always be found.
 */

/** How many bars one turn of the illusion lasts. */
const ANX_CYCLE = 8;
/** How far into the cycle this beat is, from 0 to just under 1. */
const anxPhase = (b: Beat) => ((b.bar % ANX_CYCLE) + b.beat / b.meter.beats) / ANX_CYCLE;
/** The Risset rhythm's rungs, and about how many ticks a beat its slowest plays at the start. */
const RISSET_RUNGS = 5;
const RISSET_BASE = 0.5;
/** How loud a rung is at x (its rung plus how far through the cycle): a bell, nothing at either end. */
const rissetLevel = (x: number) => Math.sin((Math.PI * x) / RISSET_RUNGS) ** 2;
/** The Shepard tone's octaves, from A 55 up, and the bell over them (loudest in the middle). */
const SHEPARD_OCTAVES = 6;
const shepardLevel = (x: number) => Math.sin((Math.PI * x) / SHEPARD_OCTAVES) ** 2;
/** The ostinato, a group of three sixteenths at a time: semitones over A 220. */
const ANX_OSTINATO = [0, 1, 0];
/** The tense chord the strings hold: A, B flat a half step over it, and E. */
const ANX_CLUSTER = [-12, -11, -5, 0];

const anxiety: Style = {
  id: 'anxiety', name: 'ANXIETY', swing: 0,
  tint: { wave: 'triangle', cutoff: 4000, echo: 0.25, echoBeats: 0.75 },
  layers: [
    { name: 'heartbeat and clock', play(s, b) {
      // The anchor: a heartbeat, lub-dub, on every downbeat, over a low A held through the
      // bar, and a dry clock tick on every beat.
      if (b.beat === 0) {
        s.kick(b.at, 1, { from: 90, to: 40, decay: 0.12 });
        s.kick(b.at + b.len * 0.28, 0.65, { from: 80, to: 38, decay: 0.1 });
        s.tone(b.at, hz(-36), restOfBar(b), 0.22, { wave: 'triangle', attack: 0.3, release: 0.3, cutoff: 300 });
      }
      s.block(b.at, b.beat === 0 ? 0.25 : 0.16, 2400, 0.008);
    } },
    { name: 'risset rhythm', play(s, b) {
      // Every tick of every rung that falls in this beat. A rung starting at k ticks a cycle
      // speeds up as 2^(t/C), so its nth tick comes at t = C log2(1 + n/k); k is a whole
      // number, so by the end of the cycle each rung has become the one above it.
      const C = ANX_CYCLE * b.meter.beats, t0 = (b.bar % ANX_CYCLE) * b.meter.beats + b.beat;
      const m = Math.max(1, Math.round((RISSET_BASE * C) / Math.LN2));
      for (let i = 0; i < RISSET_RUNGS; i++) {
        const k = m * 2 ** i;
        for (let n = Math.ceil(k * (2 ** (t0 / C) - 1) - 1e-9); ; n++) {
          const t = C * Math.log2(1 + n / k);
          if (t >= t0 + 1 - 1e-9) break;
          const x = i + t / C, level = rissetLevel(x) * 0.5;
          if (level > 0.003) s.hat(b.at + (t - t0) * b.len, level, 0.016, 3000 + 1100 * x);
        }
      }
    } },
    { name: 'shepard tone', play(s, b) {
      // Octaves of a sine, each gliding up across this beat as far as the cycle goes in a
      // beat, louder the nearer the middle of the bell; the top fades out, a new one in under.
      const p0 = anxPhase(b), p1 = p0 + 1 / (ANX_CYCLE * b.meter.beats);
      for (let k = 0; k < SHEPARD_OCTAVES; k++) {
        const v0 = shepardLevel(k + p0) * 0.065, v1 = shepardLevel(k + p1) * 0.065;
        if (Math.max(v0, v1) < 0.002) continue;
        s.glide(b.at, 55 * 2 ** (k + p0), 55 * 2 ** (k + p1), b.len + 0.02, v0, v1);
      }
    } },
    { name: 'hemiola ostinato', play(s, b) {
      // A pluck on every sixteenth, in groups of three (A, B flat, A) with the first of each
      // leaning in, so its accents fall every three sixteenths against the beat's four; a bass
      // note every three eighths, the same hemiola an octave of time lower. Counted on across
      // the bars, so the accents meet the beat only every third beat.
      const first = (b.bar * b.meter.beats + b.beat) * 4;
      for (let k = 0; k < 4; k++) {
        const n = first + k, at = b.at + (k / 4) * b.len, accent = n % 3 === 0;
        s.pluck(at, hz(-12 + ANX_OSTINATO[n % 3]), accent ? 0.22 : 0.08, { bright: 0.55, seconds: 0.25 });
        if (n % 6 === 0) s.bass(at, hz(-36 + (n % 12 === 0 ? 0 : 1)), b.len * 1.2, 0.3);
      }
    } },
    { name: 'swelling strings', play(s, b) {
      // The tense chord held by strings each bar, swelling and ebbing over the cycle, their
      // bow shaking faster and their tone opening as they swell: no edge, so no seam.
      if (b.beat !== 0) return;
      const w = Math.sin(Math.PI * anxPhase(b)) ** 2;
      for (const n of ANX_CLUSTER) s.section(b.at, hz(n), restOfBar(b), 0.04 + 0.14 * w, { cutoff: 1200 + 3000 * w, bow: 0.3, tremolo: 6 + 8 * w });
    } },
  ],
};

export const STYLES: readonly Style[] = [vibe, chill, trip, lotus, epic, anxiety, tekno, chiptune, bluegrass];
export const styleById = (id: string) => STYLES.find((s) => s.id === id) ?? STYLES[0];
