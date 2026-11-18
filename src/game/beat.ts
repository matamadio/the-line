// The beat (see issue #3). Enemies come in on it, on the beats the level allows, and
// their sounds fall on it. The first knob of the Beat group in the difficulty editor
// turns it off.
//
// The whole world runs at bpm / BASE_BPM, so everything stays the same length in
// beats and a faster tempo needs no other numbers changed. At BASE_BPM the walk cycle
// is exactly half a beat. The beat is counted in simulation steps, never on a clock,
// so replays stay exact: 96 steps of 1/120 s is one beat at any tempo.
//
// How many beats make a bar is the time signature the player picked in the audio menu.
// A new one waits for the next bar, like a new tempo. The tempo counts quarter notes: in
// 6/8 and 7/8 a beat is an eighth, half as long, but the world runs no faster.

import { DEFAULT_METER, type Meter } from '../core/music';
import { DIFF, at } from '../data/difficulty';

export const BASE_BPM = 75;
/** Simulation steps to a quarter note, at any tempo. */
const QUARTER_STEPS = 96;
/** A quarter note in simulation time, the same at any tempo. */
export const BEAT_SECONDS = QUARTER_STEPS / 120;
/** How long the line stays lit after a beat, in steps. */
const FLASH_STEPS = QUARTER_STEPS / 4;

export class BeatClock {
  bpm = BASE_BPM;
  meter: Meter = DEFAULT_METER;
  private steps = 0;
  /** Steps since the last beat. */
  private sinceBeat = 0;
  private beatIndex = 0;
  /** A time signature waiting for the next bar. */
  private nextMeter: Meter | null = null;

  /** Back to the first beat of a bar, at this level's tempo, in this time signature. */
  reset(level: number, meter = this.nextMeter ?? this.meter) {
    this.steps = 0;
    this.sinceBeat = 0;
    this.beatIndex = 0;
    this.meter = meter;
    this.nextMeter = null;
    this.bpm = at('bpm', level);
  }

  /** Another time signature, from the next bar. */
  setMeter(m: Meter) { this.nextMeter = m === this.meter ? null : m; }

  get beats() { return this.meter.beats; }
  /** How long a beat lasts on the clock (s): a quarter, or an eighth in 6/8 and 7/8. */
  get seconds() { return (60 / this.bpm) * this.meter.unit; }
  /** A beat in simulation steps. */
  private get beatSteps() { return QUARTER_STEPS * this.meter.unit; }
  /** How many beats before its cue beat a Sinepede is called: two quarters' worth, so its warning is as long in any time signature. */
  get heraldBeats() { return Math.round(2 / this.meter.unit); }

  /** How fast the world runs. */
  get speed() { return this.bpm / BASE_BPM; }
  /** Which beat of the bar we are on, from 0. */
  get beatOfBar() { return this.beatIndex; }
  /** May an enemy come in on this beat? The last of the bar only, then also the one half a bar before it: never more than two to a bar. */
  get cueBeats() { return this.cueAt(this.beatOfBar, this.cueLevel); }
  private cueLevel = 1;
  /** The same question for any beat of the bar (from 0) and level. In 4/4: beat 4, then 2 and 4. */
  cueAt(beat: number, level: number) {
    const last = this.beats - 1;
    return beat === last || (level >= DIFF.cueTwoFrom && beat === last - Math.floor(this.beats / 2));
  }

  /** 1 just after a beat, fading to 0. Stronger on the first beat of a bar. */
  get flash() {
    if (this.steps === 0) return 0;
    const fade = 1 - this.sinceBeat / FLASH_STEPS;
    return Math.max(0, fade) * (this.beatOfBar === 0 ? 1 : 0.6);
  }

  /**
   * One simulation step. Says when a beat falls on it, and whether it starts a bar.
   * The tempo only changes on a bar, so a level-up never trips the music.
   */
  step(level: number): 'bar' | 'beat' | null {
    const n = this.steps++;
    this.cueLevel = level;
    if (n > 0) {
      if (++this.sinceBeat < this.beatSteps) return null;
      this.sinceBeat = 0;
      this.beatIndex = (this.beatIndex + 1) % this.beats;
    }
    if (this.beatIndex !== 0) return 'beat';
    if (this.nextMeter) { this.meter = this.nextMeter; this.nextMeter = null; }
    this.bpm = at('bpm', level);
    return 'bar';
  }
}
