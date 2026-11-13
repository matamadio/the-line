// Keeps the game smooth on screens that are too fast or too big for the device.
//
// Each frame is a stack of additive glows, so the cost grows with the number of
// pixels and with the number of frames a second. When frames start coming late, the
// game first draws on every other refresh, if the screen runs at 100 Hz or more (a
// 120 Hz phone or iPad then runs at an even 60). After that it lowers the resolution
// step by step, down to one canvas pixel per CSS pixel. It never goes back up while
// the page is open, so it can't flicker between two settings.

/** How many drawn frames each check looks at, and how many of them may be late. */
const WINDOW = 60, LATE_SHARE = 0.15;
/** A frame is late when it comes this many times later than it should. */
const LATE = 1.5;
/** Each step down multiplies the resolution by this. */
const STEP_DOWN = 0.8;
/** Frames ignored after a change, or after a pause, while the browser settles. */
const SETTLE = 30;
/** Gaps longer than this (s) are a pause, a hidden tab or a load: not slowness. */
const PAUSE = 0.25;

export class Pacing {
  /** Shortest time between two refreshes seen so far (s): the screen's refresh rate. */
  private refresh = PAUSE;
  /** Draw on one refresh in this many. */
  skip = 1;
  /** Resolution, as a share of the full one. Neon reads it. */
  scale = 1;
  private lastTick = -1;
  private lastDraw = -1;
  private drawn = 0;
  private late = 0;
  private settle = SETTLE;

  constructor(private readonly floor: number) {}

  /** Call on every animation frame with its time (ms). True when this one should be drawn. */
  tick(nowMs: number): boolean {
    const now = nowMs / 1000;
    if (this.lastTick >= 0) {
      const gap = now - this.lastTick;
      if (gap > PAUSE) this.pause();
      else if (gap > 0.002) this.refresh = Math.min(this.refresh, gap);
    }
    this.lastTick = now;
    // By time, not by count: a frame that ran long still leaves the next one on time.
    if (this.skip > 1 && this.lastDraw >= 0 && now - this.lastDraw < (this.skip - 0.5) * this.refresh) return false;
    if (this.lastDraw >= 0) this.measure(now - this.lastDraw);
    this.lastDraw = now;
    return true;
  }

  private measure(gap: number) {
    if (this.settle > 0) { this.settle--; return; }
    this.drawn++;
    if (gap > this.refresh * this.skip * LATE) this.late++;
    if (this.drawn < WINDOW) return;
    if (this.late > WINDOW * LATE_SHARE) this.degrade();
    this.drawn = this.late = 0;
  }

  /** After the page was hidden, the first frames back say nothing about the device. */
  pause() { this.settle = SETTLE; this.lastDraw = -1; this.drawn = this.late = 0; }

  /** Called once things have to get lighter: the caller reads skip and scale. */
  onChange: () => void = () => {};

  private degrade() {
    if (this.skip === 1 && this.refresh < 1 / 100) this.skip = 2;
    else if (this.scale > this.floor) this.scale = Math.max(this.floor, this.scale * STEP_DOWN);
    else return;
    this.settle = SETTLE;
    this.onChange();
  }
}
