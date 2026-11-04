// Plays the real game with scripted keys. The animation lab's scrubbing and live tuning
// rely on the simulation being exact: same seed and same keys, same game.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Controls } from '../src/core/input';
import { IDLE, headlessGame, seeded } from './helpers';

// No audio in tests. start() would otherwise open an AudioContext.
vi.mock('../src/core/sfx', () => ({ sfx: { unlock() {}, play() {}, toggleMute() {}, beat() {}, call() {}, cancelled() {}, fed() {}, grew() {}, shrank() {}, hum() {}, rumble() {}, crunch() {}, muted: true } }));

const SECONDS = 120;
const STEPS_PER_SECOND = 120;

/** Runs a scripted game and returns what it went through. */
function play(seed: number) {
  Math.random = seeded(seed);
  const keys = seeded(seed + 1);
  const g = headlessGame();
  g.start();
  const seen = { sinepedes: 0, urchins: 0, worms: 0, bubbles: 0, deaths: 0, maxScore: 0 };
  let lives = g.lives, k: Controls = IDLE;
  for (let i = 0; i < SECONDS * STEPS_PER_SECOND; i++) {
    if (i % 30 === 0) {
      k = { ...IDLE, right: keys() < 0.85, downPressed: keys() < 0.05, upPressed: keys() < 0.04, dragPressed: keys() < 0.2, pullPressed: keys() < 0.25 };
    } else k = { ...k, downPressed: false, upPressed: false, dragPressed: false, pullPressed: false };
    g.tick(k);
    if (g.mode === 'over') g.start();
    seen.sinepedes = Math.max(seen.sinepedes, g.sinepedes.length);
    seen.urchins = Math.max(seen.urchins, g.urchins.length);
    seen.worms = Math.max(seen.worms, g.worms.length);
    seen.bubbles = Math.max(seen.bubbles, g.bubbles.length);
    seen.maxScore = Math.max(seen.maxScore, g.score);
    if (g.lives < lives) seen.deaths++;
    lives = g.lives;
    for (const v of [g.endX, g.wavell.x, g.wavell.by, g.line.sample(g.wavell.x)]) {
      if (!Number.isFinite(v)) throw new Error(`not a number at step ${i}`);
    }
  }
  return { seen, score: g.score, level: g.level, lives: g.lives, x: g.wavell.x, endX: g.endX };
}

describe('the simulation', () => {
  const nativeRandom = Math.random;
  beforeEach(() => {
    // The only browser API the rules touch (to word a hint for touch or keyboard).
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('Path2D', class { moveTo() {} lineTo() {} quadraticCurveTo() {} arc() {} closePath() {} });
  });
  afterEach(() => {
    Math.random = nativeRandom;
    vi.unstubAllGlobals();
  });

  it('is exact: the same seed and keys give the same game', () => {
    expect(play(7)).toEqual(play(7));
  });

  it('plays a couple of minutes with every kind of enemy and no broken numbers', () => {
    const { seen } = play(11);
    expect(seen.sinepedes).toBeGreaterThan(0);
    expect(seen.urchins).toBeGreaterThan(0);
    expect(seen.worms).toBeGreaterThan(0);
    expect(seen.bubbles).toBeGreaterThan(0);
    expect(seen.deaths).toBeGreaterThan(0);
    expect(seen.maxScore).toBeGreaterThan(0);
  });

  it('a Wavell who stands still is caught by the end of the line', () => {
    Math.random = seeded(3);
    const g = headlessGame();
    g.quiet = true;
    g.start();
    const lives = g.lives;
    for (let i = 0; i < 20 * STEPS_PER_SECOND; i++) g.tick(IDLE);
    expect(g.lives).toBeLessThan(lives);
  });
});
