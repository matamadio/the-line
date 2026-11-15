// Keeps the game smooth on screens that are too fast or too big for the device.
//
// Each frame is a stack of additive glows, so the cost grows with the number of
// pixels and with the number of frames a second. When frames start coming late, the
// game first draws on every other refresh, if the screen runs at 100 Hz or more (a
// 120 Hz phone or iPad then runs at an even 60). After that it lowers the resolution
// step by step (see Neon for how low it goes). Last, it turns on lite mode: no blurred
// shadows, fewer strokes for lines out of focus. A device far too slow (most frames
// under 16 a second) goes straight to the lightest setting, instead of a step at a
// time. It never goes back up while the page is open, so it can't flicker between two settings.

/** How many drawn frames each check looks at, and how many of them may be late. */
const WINDOW = 60, LATE_SHARE = 0.15;
/** A frame is late when it comes this many times later than it should. */
const LATE = 1.5;
/** Each step down multiplies the resolution by this. */
const STEP_DOWN = 0.8;
/** Frames ignored after a change, or after a pause, while the browser settles. */
const SETTLE = 30;
/** And no longer than this (s): on a slow device 30 frames can take many seconds. */
const SETTLE_MAX = 0.5;
/** Each check looks at no more than this long (s), for the same reason. */
const WINDOW_MAX = 1.5;
/**
 * Frames slower than this (s), most of them, are too slow to go a step at a time. It is
 * not measured against the refresh rate: a device slow from its very first frame never
 * shows how fast its screen could go.
 */
const FAR_GAP = 1 / 16, FAR_SHARE = 0.5;
/** Gaps longer than this (s) are a pause or a load: not slowness. A slow TV can take a quarter of a second for every frame. */
const PAUSE = 1;

export class Pacing {
  /** Shortest time between two refreshes seen so far (s): the screen's refresh rate. */
  private refresh = PAUSE;
  /** Draw on one refresh in this many. */
  skip = 1;
  /** Resolution, as a share of the full one. Neon reads it. */
  scale = 1;
  /** The last step: cheaper glows. Neon reads it. */
  lite = false;
  private lastTick = -1;
  private lastDraw = -1;
  private drawn = 0;
  private late = 0;
  private farLate = 0;
  /** When the current check began, and when settling began (s). */
  private windowFrom = -1;
  private settleFrom = -1;
  private settle = SETTLE;

  /** floor: the lowest share of the full resolution to go to before lite mode, or what tells it (it can change with the window). */
  constructor(private readonly floor: number | (() => number)) {}

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
    if (this.lastDraw >= 0) this.measure(now - this.lastDraw, now);
    this.lastDraw = now;
    return true;
  }

  private measure(gap: number, now: number) {
    if (this.settle > 0) {
      if (this.settleFrom < 0) this.settleFrom = now;
      if (--this.settle > 0 && now - this.settleFrom < SETTLE_MAX) return;
      this.settle = 0;
      this.settleFrom = -1;
      this.windowFrom = now;
      return;
    }
    this.drawn++;
    const due = this.refresh * this.skip;
    if (gap > due * LATE) this.late++;
    if (gap > FAR_GAP) this.farLate++;
    if (this.drawn < WINDOW && now - this.windowFrom < WINDOW_MAX) return;
    if (this.drawn >= 4 && this.farLate > this.drawn * FAR_SHARE) this.lightest();
    else if (this.late > this.drawn * LATE_SHARE) this.degrade();
    this.drawn = this.late = this.farLate = 0;
    this.windowFrom = now;
  }

  /** Far too slow: straight to the lowest resolution and lite mode. */
  private lightest() {
    if (this.lite && this.scale <= this.lowest + 1e-6) return;
    if (this.refresh < 1 / 100) this.skip = 2;
    this.scale = Math.min(this.scale, this.lowest);
    this.lite = true;
    this.settle = SETTLE;
    this.onChange();
  }

  /** After the page was hidden, the first frames back say nothing about the device. */
  pause() { this.settle = SETTLE; this.settleFrom = -1; this.lastDraw = -1; this.drawn = this.late = this.farLate = 0; }

  /** Called once things have to get lighter: the caller reads skip and scale. */
  onChange: () => void = () => {};

  /** The lowest share of the full resolution it would go to, now. */
  get floorNow() { return typeof this.floor === 'number' ? this.floor : this.floor(); }
  private get lowest() { return this.floorNow; }

  private degrade() {
    if (this.skip === 1 && this.refresh < 1 / 100) this.skip = 2;
    else if (this.scale > this.lowest + 1e-6) this.scale = Math.max(this.lowest, this.scale * STEP_DOWN);
    else if (!this.lite) this.lite = true;
    else return;
    this.settle = SETTLE;
    this.onChange();
  }
}
