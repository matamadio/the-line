// The line as a vibrating string: points fixed every 2 world units along x, each
// with a vertical displacement, integrated with the wave equation plus a weak pull
// back to rest. The window of points slides with the camera by whole points, so
// scrolling never smears the waves.

import { TUNE } from '../data/tune';

const H = 2;
const SPONGE = 24;
const VISC = 40;
/** What it takes, measured, for a carried bump to settle at the height it was asked for. */
const CARRY_GAIN = 1.19;

export class SpringLine {
  /** Wave speed in units per second. Pulses travel at exactly this speed. */
  get c() { return TUNE.lineSpeed; }
  private k = 5;
  private damp = 1.1;
  base = 0;
  y: Float32Array;
  v: Float32Array;
  private f: Float32Array;

  constructor(private n = 420) {
    this.y = new Float32Array(n);
    this.v = new Float32Array(n);
    this.f = new Float32Array(n);
  }

  /** Another line, in the same shape and state as this one. */
  clone() {
    const c = new SpringLine(this.n);
    c.base = this.base;
    c.y.set(this.y);
    c.v.set(this.v);
    return c;
  }

  /** Dead flat and still. */
  clear() {
    this.y.fill(0);
    this.v.fill(0);
  }

  get spacing() { return H; }
  get count() { return this.n; }
  xAt(i: number) { return this.base + i * H; }

  /** Slide and resize the window so it covers [left, right]. */
  cover(left: number, right: number) {
    const want = Math.floor(left / H) * H;
    const need = Math.ceil((right - want) / H) + 2;
    if (need > this.n) {
      const grow = (a: Float32Array) => { const b = new Float32Array(need); b.set(a); return b; };
      this.y = grow(this.y); this.v = grow(this.v); this.f = grow(this.f);
      this.n = need;
    }
    const d = Math.round((want - this.base) / H);
    if (d === 0) return;
    this.base = want;
    for (const a of [this.y, this.v]) {
      if (Math.abs(d) >= this.n) a.fill(0);
      else if (d > 0) { a.copyWithin(0, d); a.fill(0, this.n - d); }
      else { a.copyWithin(-d, 0, this.n + d); a.fill(0, 0, -d); }
    }
  }

  sample(x: number): number {
    const t = (x - this.base) / H;
    const i = Math.floor(t);
    if (i < 0 || i >= this.n - 1) return 0;
    const f = t - i;
    return this.y[i] * (1 - f) + this.y[i + 1] * f;
  }

  /** Add a vertical velocity with a smooth falloff around x. */
  impulse(x: number, dv: number, radius = 6) {
    this.each(x, radius * 2.5, (i, d) => { this.v[i] += dv * Math.exp(-(d * d) / (radius * radius)); });
  }

  /** Accumulate a force (applied on the next step) around x. */
  push(x: number, force: number, radius = 4) {
    this.each(x, radius * 2.5, (i, d) => { this.f[i] += force * Math.exp(-(d * d) / (radius * radius)); });
  }

  /** Add a bump that travels right (dir 1) or left (-1), by default at wave speed: y = amp * gauss(x - x0 - dir speed t). */
  pulse(x0: number, amp: number, width: number, dir = 1, speed = this.c) {
    this.each(x0, width * 3, (i, d) => {
      const g = amp * Math.exp(-(d * d) / (width * width));
      this.y[i] += g;
      this.v[i] += dir * speed * g * 2 * d / (width * width);
    });
  }

  /**
   * The forces that keep a bump started with pulse() going at its own speed, slower
   * than the line's waves, without losing height. Call it once per step (`vel` signed).
   * It stays a wave in the line: other waves run through it and add up with it. `swell`
   * is how much height to add to it on this step.
   */
  carry(x0: number, amp: number, width: number, vel: number, swell = 0) {
    const w2 = width * width, cc = this.c * this.c;
    this.each(x0, width * 3, (i, d) => {
      const g = amp * Math.exp(-(d * d) / w2);
      const g1 = (-2 * d / w2) * g;
      const g2 = (4 * d * d / (w2 * w2) - 2 / w2) * g;
      const g3 = (12 * d / (w2 * w2) - 8 * d * d * d / (w2 * w2 * w2)) * g;
      // What the wave equation in step() needs for y = g(x - vel t). Each step's forces
      // only act on the first of its two halves, hence the 2.
      this.f[i] += 2 * CARRY_GAIN * ((vel * vel - cc) * g2 + this.k * g - this.damp * vel * g1 + VISC * H * H * vel * g3);
      if (amp) this.y[i] += (swell / amp) * g;
    });
  }

  /** Damp the line flat around x (k 0..1 at the centre): two opposite waves cancelling out. */
  calm(x: number, radius: number, k = 1) {
    this.each(x, radius * 2.5, (i, d) => {
      const a = 1 - k * Math.exp(-(d * d) / (radius * radius));
      this.y[i] *= a;
      this.v[i] *= a;
    });
  }

  /**
   * n points of a smooth hump riding the line, centred on cx: amp > 0 hangs down,
   * amp < 0 stands up. Both ends sit on the line, so it can be spliced into it.
   */
  hump(cx: number, width: number, amp: number, n: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1), x = cx + (s - 0.5) * width;
      out.push(x, this.sample(x) + amp * Math.sin(Math.PI * s) ** 2);
    }
    return out;
  }

  /** The strongest displacement over [x0, x1] in direction s (-1 up, 1 down). */
  surge(x0: number, x1: number, s: number): number {
    let m = 0;
    for (let x = x0; x <= x1; x += H) m = Math.max(m, s * this.sample(x));
    return m;
  }

  /** Force the shape between x0 and x1, in either order (used while Wavell holds the line up). */
  shape(x0: number, x1: number, fn: (x: number) => number) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    const i0 = Math.max(1, Math.ceil((x0 - this.base) / H));
    const i1 = Math.min(this.n - 2, Math.floor((x1 - this.base) / H));
    for (let i = i0; i <= i1; i++) { this.y[i] = fn(this.xAt(i)); this.v[i] = 0; }
  }

  step(dt: number) {
    const { y, v, f, n } = this;
    const cc = (this.c * this.c) / (H * H);
    for (let i = 1; i < n - 1; i++) {
      const sponge = i < SPONGE ? (SPONGE - i) / SPONGE : i > n - 1 - SPONGE ? (i - (n - 1 - SPONGE)) / SPONGE : 0;
      // The last term damps only the jagged point-to-point wiggle, not the waves.
      const a = cc * (y[i - 1] - 2 * y[i] + y[i + 1]) - this.k * y[i] - (this.damp + sponge * 30) * v[i] + f[i]
        + VISC * (v[i - 1] - 2 * v[i] + v[i + 1]);
      v[i] += a * dt;
    }
    for (let i = 1; i < n - 1; i++) y[i] += v[i] * dt;
    y[0] = y[n - 1] = 0;
    f.fill(0);
  }

  private each(x: number, reach: number, fn: (i: number, d: number) => void) {
    const i0 = Math.max(1, Math.floor((x - reach - this.base) / H));
    const i1 = Math.min(this.n - 2, Math.ceil((x + reach - this.base) / H));
    for (let i = i0; i <= i1; i++) fn(i, this.xAt(i) - x);
  }
}
