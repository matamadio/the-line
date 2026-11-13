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

  it('a slow 60 Hz screen lowers the resolution down to its floor, and no further', () => {
    const p = new Pacing(0.5);
    run(p, 60, 5000, (i) => (i % 2 ? 20 : 10));
    expect(p.skip).toBe(1);
    expect(p.scale).toBe(0.5);
  });

  it('pauses and the odd hitch are not slowness', () => {
    const p = new Pacing(0.5);
    let t = run(p, 60, 3000, (i) => (i % 100 === 0 ? 50 : 5));
    t += 5000; // a hidden tab
    run(p, 60, 100, () => 5, t);
    expect(p.scale).toBe(1);
  });
});
