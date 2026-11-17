import { describe, expect, it } from 'vitest';
import { Pacing } from '../src/core/pacing';

/**
 * Runs the pacing for a number of refreshes of a screen at hz. work(i) is how long drawn
 * frame i takes (ms); the browser calls back on the first refresh after it is done.
 */
function run(p: Pacing, hz: number, refreshes: number, work: (drawn: number) => number = () => 1, start = 0) {
  const r = 1000 / hz;
  let t = start, drawn = 0;
  for (let i = 0; i < refreshes; i++) {
    const busy = p.tick(t) ? work(drawn++) : 0.2;
    t = (Math.floor((t + busy) / r + 1e-6) + 1) * r;
  }
  return t;
}

describe('pacing', () => {
  it('leaves a device that keeps up alone', () => {
    const p = new Pacing(0.5);
    run(p, 60, 2000);
    run(p, 120, 2000, () => 1, 100000);
    expect(p.skip).toBe(1);
    expect(p.scale).toBe(1);
  });

  it('a steady 30 fps throttle (battery saver) is not slowness', () => {
    const p = new Pacing(0.5);
    run(p, 30, 2000);
    expect(p.scale).toBe(1);
  });

  it('a slow 120 Hz screen first halves the frame rate, then lowers the resolution', () => {
    const p = new Pacing(0.5);
    let changes = 0;
    p.onChange = () => changes++;
    // 4 to 12 ms a frame: too much for an even 120, fine for 60.
    run(p, 120, 1000, (i) => (i % 2 ? 12 : 4));
    expect(p.skip).toBe(2);
    expect(p.scale).toBe(1);
    // At 60 it keeps up: nothing else changes.
    run(p, 120, 4000, (i) => (i % 2 ? 12 : 4), 100000);
    expect(changes).toBe(1);
    expect(p.scale).toBe(1);
  });

  it('a slow 60 Hz screen lowers the resolution down to its floor, then goes lite, and no further', () => {
    const p = new Pacing(0.5);
    let changes = 0;
    p.onChange = () => changes++;
    run(p, 60, 5000, (i) => (i % 2 ? 20 : 10));
    expect(p.skip).toBe(1);
    expect(p.scale).toBe(0.5);
    expect(p.lite).toBe(true);
    const after = changes;
    run(p, 60, 3000, (i) => (i % 2 ? 20 : 10), 200000);
    expect(changes).toBe(after);
  });

  it('a slow TV that can only go a little lower gets there, then goes lite, without wasted steps', () => {
    // A 1080p TV at one canvas pixel per CSS pixel can go down to 720 tall: 2/3.
    const p = new Pacing(() => 2 / 3);
    let changes = 0;
    p.onChange = () => changes++;
    run(p, 60, 5000, (i) => (i % 2 ? 20 : 10));
    expect(p.scale).toBeCloseTo(2 / 3);
    expect(p.lite).toBe(true);
    // 1, 0.8, 2/3, then lite.
    expect(changes).toBe(3);
  });

  it('a TV slow from its first frame goes straight to the lightest setting, within seconds', () => {
    // 4 fps from the start: every gap is a quarter of a second, so the refresh rate looks like 4 Hz.
    const p = new Pacing(() => 2 / 3);
    let changes = 0, at = -1;
    p.onChange = () => { changes++; if (at < 0) at = t; };
    let t = 0;
    for (let i = 0; i < 40; i++) { p.tick(t); t += 250; }
    expect(p.lite).toBe(true);
    expect(p.scale).toBeCloseTo(2 / 3);
    expect(changes).toBe(1);
    expect(at).toBeLessThan(3000);
  });

  it('a steady 11 fps goes lightest too', () => {
    const p = new Pacing(0.5);
    let t = 0;
    for (let i = 0; i < 60; i++) { p.tick(t); t += 90; }
    expect(p.lite).toBe(true);
  });

  it('a device that keeps up never goes lite', () => {
    const p = new Pacing(0.5);
    run(p, 60, 3000);
    expect(p.lite).toBe(false);
  });

  it('a stray early frame does not make the screen look faster than it is', () => {
    // A fast computer at 60 Hz whose browser now and then calls back 3 ms after the last frame.
    const p = new Pacing(0.5);
    let t = 0;
    for (let i = 0; i < 4000; i++) { p.tick(t); t += i % 200 === 7 ? 3 : 1000 / 60; }
    expect(p.skip).toBe(1);
    expect(p.scale).toBe(1);
    expect(p.lite).toBe(false);
  });

  it('a 144 Hz screen with uneven frames keeps its glow', () => {
    // Frames land a refresh early or late now and then, as on a busy desktop.
    const p = new Pacing(0.5), r = 1000 / 144;
    let t = 0, seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 6000; i++) { p.tick(t); t += r * (rnd() < 0.08 ? 2 : 1); }
    expect(p.lite).toBe(false);
    expect(p.scale).toBe(1);
  });

  it('pauses and the odd hitch are not slowness', () => {
    const p = new Pacing(0.5);
    let t = run(p, 60, 3000, (i) => (i % 100 === 0 ? 50 : 5));
    t += 5000; // a hidden tab
    run(p, 60, 100, () => 5, t);
    expect(p.scale).toBe(1);
  });
});
