// The beat (a prototype, see issue #3). Turn it on with `?beat` in the address, or with
// the first knob of the Beat group in the difficulty editor.
//
// The whole world runs at bpm / BASE_BPM, so everything stays the same length in
// beats and a faster tempo needs no other numbers changed. At BASE_BPM the walk cycle
// is exactly half a beat. The beat is counted in simulation steps, never on a clock,
// so replays stay exact: 96 steps of 1/120 s is one beat at any tempo.

import { at } from '../data/difficulty';

export const BASE_BPM = 75;
const STEPS_PER_BEAT = 96;
const BEATS_PER_BAR = 4;
/** How long the line stays lit after a beat, in steps. */
const FLASH_STEPS = STEPS_PER_BEAT / 4;

export class BeatClock {
  bpm = BASE_BPM;
  private steps = 0;

  /** Back to the first beat of a bar, at this level's tempo. */
  reset(level: number) {
    this.steps = 0;
    this.bpm = at('bpm', level);
  }

  /** How fast the world runs. */
  get speed() { return this.bpm / BASE_BPM; }
  /** Which beat of the bar we are on, 0 to 3. */
  get beatOfBar() { return Math.floor(Math.max(0, this.steps - 1) / STEPS_PER_BEAT) % BEATS_PER_BAR; }
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
    if (n % STEPS_PER_BEAT !== 0) return null;
    if (n % (STEPS_PER_BEAT * BEATS_PER_BAR) !== 0) return 'beat';
    this.bpm = at('bpm', level);
    return 'bar';
  }
}
