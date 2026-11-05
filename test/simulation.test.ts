// Plays the real game with scripted keys. The animation lab's scrubbing and live tuning
// rely on the simulation being exact: same seed and same keys, same game.

import { DIFF } from '../src/data/difficulty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Controls } from '../src/core/input';
import { TUNE } from '../src/data/tune';
import { MORPH_TIME } from '../src/game/title';
import { IDLE, headlessGame, seeded } from './helpers';

// No audio in tests. start() would otherwise open an AudioContext.
vi.mock('../src/core/sfx', () => ({ sfx: { pause() {}, unlock() {}, play() {}, toggleMute() {}, beat() {}, call() {}, cancelled() {}, fed() {}, grew() {}, shrank() {}, hum() {}, rumble() {}, crunch() {}, muted: true } }));

const SECONDS = 120;
const STEPS_PER_SECOND = 120;

/** Runs a scripted game and returns what it went through. Extra lives keep a clumsy player in for the later enemies. */
function play(seed: number, startLives?: number) {
  Math.random = seeded(seed);
  const keys = seeded(seed + 1);
  const g = headlessGame();
  g.start();
  if (startLives) g.lives = startLives;
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
    const { seen } = play(11, 20);
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

describe('the rise on load', () => {
  const run = (g: ReturnType<typeof headlessGame>, seconds: number) => {
    for (let i = 0; i < seconds * STEPS_PER_SECOND; i++) g.tick(IDLE);
  };

  it('keeps the line flat until he has grown out of it, in the middle of the screen', () => {
    const g = headlessGame();
    run(g, TUNE.riseHold);
    expect(g.wavell.state).toBe('appear');
    expect(Math.max(...g.line.y.map(Math.abs))).toBe(0);
    expect(g.neon.camX + g.neon.viewW / 2).toBeCloseTo(g.wavell.x);
    run(g, TUNE.riseTime * 0.9);
    expect(g.wavell.state).toBe('appear');
    run(g, TUNE.riseTime * 0.2);
    expect(g.wavell.state).toBe('ground');
  });

  it('does not appear again when the game starts', () => {
    const g = headlessGame();
    run(g, TUNE.riseHold + TUNE.riseTime + 0.1);
    g.start();
    expect(g.wavell.state).toBe('ground');
    expect(g.wavell.events).not.toContain('appear');
  });

  it('finishes quickly from where it was if the game starts while he rises', () => {
    const g = headlessGame();
    run(g, TUNE.riseHold + TUNE.riseTime / 2);
    g.start();
    expect(g.wavell.state).toBe('appear');
    expect(g.wavell.t).toBeGreaterThan(0);
    expect(g.wavell.events).not.toContain('appear');
    run(g, TUNE.appearTime);
    expect(g.wavell.state).toBe('ground');
  });

  it('appears again after a game over', () => {
    const g = headlessGame();
    g.start();
    g.mode = 'over';
    g.start();
    expect(g.wavell.state).toBe('appear');
    expect(g.wavell.events).toContain('appear');
  });
});

describe('going back to the start screen', () => {
  const run = (g: ReturnType<typeof headlessGame>, seconds: number) => {
    for (let i = 0; i < seconds * STEPS_PER_SECOND; i++) g.tick(IDLE);
  };

  it('flattens him and lets him rise again in the middle of the screen, with the line whole', () => {
    const g = headlessGame();
    g.start();
    run(g, 2);
    g.backToTitle(false);
    expect(g.mode).toBe('title');
    expect(g.wavell.state).toBe('dead');
    run(g, 1);
    expect(g.wavell.state).toBe('appear');
    run(g, TUNE.riseHold + TUNE.riseTime);
    expect(g.wavell.state).toBe('ground');
    expect(g.endX).toBe(g.wavell.x - 1000);
    expect(g.neon.camX + g.neon.viewW / 2).toBeCloseTo(g.wavell.x);
  });

  it('only runs the word through its change coming from FLATLINED', () => {
    const g = headlessGame();
    g.start();
    g.backToTitle(false);
    expect(g.morphT).toBe(MORPH_TIME);
    g.backToTitle(true);
    expect(g.morphT).toBe(0);
    run(g, MORPH_TIME);
    expect(g.morphT).toBeGreaterThanOrEqual(MORPH_TIME - 0.01);
  });

  it('starts a clean game even if he has not come back yet', () => {
    const g = headlessGame();
    g.start();
    g.lives = 0;
    g.score = 500;
    g.backToTitle(false);
    g.start();
    expect(g.mode).toBe('play');
    expect(g.wavell.alive).toBe(true);
    expect(g.lives).toBe(DIFF.lives);
    expect(g.score).toBe(0);
  });

  it('keeps the best score of a game left halfway', () => {
    const g = headlessGame();
    g.start();
    g.score = g.best + 100;
    const score = g.score;
    g.backToTitle(false);
    expect(g.best).toBe(score);
  });

  it('is never left paused', () => {
    const g = headlessGame();
    g.start();
    g.setPaused(true);
    g.backToTitle(false);
    expect(g.paused).toBe(false);
  });
});

describe('the dev menu', () => {
  // The fake view is 320x200: the box sits down to the left, with its links under a heading.
  const tap = (g: ReturnType<typeof headlessGame>, x: number, y: number) => g.input.uiTap!(x, y);
  const links = { settings: [40, 163], animation: [40, 179], heading: [40, 148] } as const;

  beforeEach(() => vi.stubGlobal('location', { href: '' }));
  afterEach(() => vi.unstubAllGlobals());

  it('opens each editor from the start screen', () => {
    const g = headlessGame();
    expect(tap(g, ...links.settings)).toBe(true);
    expect(location.href).toBe('difficulty.html');
    expect(tap(g, ...links.animation)).toBe(true);
    expect(location.href).toBe('lab.html');
  });

  it('keeps a tap on the rest of the box from starting the game', () => {
    const g = headlessGame();
    expect(tap(g, ...links.heading)).toBe(true);
    expect(location.href).toBe('');
  });

  it('is not there during a game, or while the word is changing', () => {
    const g = headlessGame();
    g.start();
    expect(tap(g, ...links.settings)).toBe(false);
    g.backToTitle(true);
    expect(tap(g, ...links.settings)).toBe(false);
    expect(location.href).toBe('');
  });
});
