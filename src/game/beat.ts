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
// A new one waits for the next bar, like a new tempo.

import { DEFAULT_METER, type Meter } from '../core/music';
import { DIFF, at } from '../data/difficulty';

export const BASE_BPM = 75;
const STEPS_PER_BEAT = 96;
/** A beat in simulation time, the same at any tempo. */
export const BEAT_SECONDS = STEPS_PER_BEAT / 120;
/** How long the line stays lit after a beat, in steps. */
const FLASH_STEPS = STEPS_PER_BEAT / 4;

export class BeatClock {
  bpm = BASE_BPM;
  meter: Meter = DEFAULT_METER;
  private steps = 0;
  private beatIndex = 0;
  /** A time signature waiting for the next bar. */
  private nextMeter: Meter | null = null;

  /** Back to the first beat of a bar, at this level's tempo, in this time signature. */
  reset(level: number, meter = this.nextMeter ?? this.meter) {
    this.steps = 0;
    this.beatIndex = 0;
    this.meter = meter;
    this.nextMeter = null;
    this.bpm = at('bpm', level);
  }

  /** Another time signature, from the next bar. */
  setMeter(m: Meter) { this.nextMeter = m === this.meter ? null : m; }

  get beats() { return this.meter.beats; }

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
    const fade = 1 - ((this.steps - 1) % STEPS_PER_BEAT) / FLASH_STEPS;
    return Math.max(0, fade) * (this.beatOfBar === 0 ? 1 : 0.6);
  }

  /**
   * One simulation step. Says when a beat falls on it, and whether it starts a bar.
   * The tempo only changes on a bar, so a level-up never trips the music.
   */
  step(level: number): 'bar' | 'beat' | null {
    const n = this.steps++;
    this.cueLevel = level;
    if (n % STEPS_PER_BEAT !== 0) return null;
    if (n > 0) this.beatIndex = (this.beatIndex + 1) % this.beats;
    if (this.beatIndex !== 0) return 'beat';
    if (this.nextMeter) { this.meter = this.nextMeter; this.nextMeter = null; }
    this.bpm = at('bpm', level);
    return 'bar';
  }
}
