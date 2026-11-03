// The line is a wave equation, so the easy way to break it is to make it blow up.

import { describe, expect, it } from 'vitest';
import { SpringLine } from '../src/game/line';

const peak = (l: SpringLine) => Math.max(...Array.from(l.y, Math.abs));

function settledLine() {
  const line = new SpringLine();
  line.cover(0, 320);
  return line;
}

describe('the line', () => {
  it('stays flat when nothing touches it', () => {
    const line = settledLine();
    for (let i = 0; i < 240; i++) line.step(1 / 240);
    expect(peak(line)).toBe(0);
  });

  it('carries a wave along at its wave speed', () => {
    const line = settledLine();
    line.pulse(100, 20, 10, 1);
    for (let i = 0; i < 48; i++) line.step(1 / 240);
    // A fifth of a second later the crest has moved on by c / 5.
    const crest = 100 + line.c / 5;
    expect(Math.abs(line.sample(crest))).toBeGreaterThan(Math.abs(line.sample(100)));
  });

  it('calms down again after being hit hard', () => {
    const line = settledLine();
    for (let i = 0; i < 20; i++) line.impulse(50 + i * 12, 400, 8);
    const hit = peak(line);
    for (let i = 0; i < 240 * 10; i++) line.step(1 / 240);
    expect(Number.isFinite(peak(line))).toBe(true);
    expect(peak(line)).toBeLessThan(Math.max(hit, 1));
  });
});
