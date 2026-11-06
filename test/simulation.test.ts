// Plays the real game with scripted keys. The animation lab's scrubbing and live tuning
// rely on the simulation being exact: same seed and same keys, same game.

import { DIFF } from '../src/data/difficulty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Controls } from '../src/core/input';
import { I } from '../src/data/anim';
import { TUNE } from '../src/data/tune';
import { MORPH_TIME, TitleDust } from '../src/game/title';
import { TITLE_HINTS, nostalgiaButton } from '../src/game/hud';
import { hasGlyph } from '../src/core/pixelfont';
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

  it('climbs out of the line hands first, and nothing shows below it', () => {
    const g = headlessGame();
    g.start();
    const W = g.wavell;
    /** How high he stands above the line and how far he shows below it. */
    const extent = () => {
      const o = W.stroke(g.line)!;
      let up = 0, down = 0;
      for (let i = 0; i < o.length; i += 2) {
        const h = g.line.sample(o[i]) - o[i + 1];
        up = Math.max(up, h);
        down = Math.max(down, -h);
      }
      return { up, down };
    };
    const seen: number[] = [];
    while (W.state === 'appear') {
      run(g, 0.1);
      if (W.state !== 'appear') break;
      const e = extent();
      seen.push(e.up);
      expect(e.down).toBeLessThan(2.5);
    }
    // Only the fists at first, then the head, then all of him.
    expect(seen[0]).toBeLessThan(3);
    expect(seen[2]).toBeLessThan(4);
    expect(seen[seen.length - 1]).toBeGreaterThan(25);
  });

  it.each([['on top of the line', 1], ['under the line', -1]])('hit by an enemy %s, he sinks into it with one hand up to the last', (_name, side) => {
    const g = headlessGame();
    g.start();
    const W = g.wavell;
    W.state = 'ground';
    if (side < 0) { W.side = -1; W.flip = 1; }
    W.hurt('zap');
    /** The furthest point out from the line on his side, and how far he shows on the other. */
    const reach = () => {
      const o = W.stroke(g.line)!;
      let out = 0, x = 0, wrong = 0;
      for (let i = 0; i < o.length; i += 2) {
        const h = side * (g.line.sample(o[i]) - o[i + 1]);
        if (h > out) { out = h; x = o[i]; }
        wrong = Math.max(wrong, -h);
      }
      return { out, x, wrong };
    };
    const seen: { out: number; x: number }[] = [];
    while (W.t < W.linger - 0.05) {
      run(g, 0.05);
      const r = reach();
      seen.push(r);
      expect(r.wrong).toBeLessThan(3);
    }
    // Late on, what still shows is the raised hand, off to one side of him.
    const late = seen[Math.floor(seen.length * 0.88)];
    expect(late.out).toBeGreaterThan(2);
    expect(late.out).toBeLessThan(10);
    expect(Math.abs(late.x - W.x)).toBeGreaterThan(5);
    run(g, 0.1);
    expect(W.stroke(g.line)).toBeNull();
    expect(g.lives).toBeGreaterThanOrEqual(0);
  });

  it('leaves no line across his face as he sinks, and his eyes pop once, in red', () => {
    const g = headlessGame();
    g.start();
    const W = g.wavell;
    W.state = 'ground';
    W.hurt('zap');
    const sparks = () => (g.fx as unknown as { sparks: { color: string }[] }).sparks.length;
    let pops = 0, last = sparks();
    while (W.t < W.linger) {
      run(g, 1 / STEPS_PER_SECOND);
      const now = sparks();
      if (now >= last + 20) pops++;
      last = now;
      const head = (W as unknown as { cur: Float32Array }).cur[I.head + 1];
      if (head < 1 && head > -2) {
        // The head is cut by the line: nothing lies on the line under it.
        const o = W.stroke(g.line)!;
        for (let i = 0; i < o.length; i += 2) {
          const onLine = Math.abs(g.line.sample(o[i]) - o[i + 1]) < 0.05;
          if (onLine) expect(Math.abs(o[i] - (W.x - 2))).toBeGreaterThan(1.5);
        }
      }
    }
    expect(pops).toBe(1);
  });

  it('shows his body as soon as it is above the line, not all at once when the hands let go', () => {
    const g = headlessGame();
    g.start();
    const W = g.wavell;
    const length = () => {
      const o = W.stroke(g.line)!;
      let d = 0;
      for (let i = 2; i < o.length; i += 2) d += Math.hypot(o[i] - o[i - 2], o[i + 1] - o[i - 1]);
      return d;
    };
    run(g, TUNE.appearTime * 0.52);
    const elbow = (W as unknown as { cur: Float32Array }).cur[I.elbowF + 1];
    expect(elbow).toBeGreaterThan(3);
    // The arms are in the stroke already: well over what the head and the line alone would take.
    expect(length()).toBeGreaterThan(90);
    let last = length(), jump = 0;
    while (W.state === 'appear') {
      run(g, 1 / 120);
      if (W.state !== 'appear') break;
      const now = length();
      jump = Math.max(jump, now - last);
      last = now;
    }
    expect(jump).toBeLessThan(6);
  });

  it.each([['climbing out', false], ['sinking', true]])('never draws a stray piece of line back along the line, %s', (_name, sink) => {
    const g = headlessGame();
    g.start();
    const W = g.wavell;
    if (sink) { W.state = 'ground'; W.hurt('zap'); }
    const busy = () => (sink ? W.t < W.linger - 0.01 : W.state === 'appear');
    while (busy()) {
      run(g, 1 / 120);
      if (!busy()) break;
      const o = W.stroke(g.line)!;
      const on = (i: number) => Math.abs(g.line.sample(o[i]) - o[i + 1]) < 0.05;
      for (let i = 2; i < o.length; i += 2) {
        if (on(i) && on(i - 2)) expect(o[i - 2] - o[i]).toBeLessThan(3);
      }
    }
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

  it('sinks him into the line and lets him rise again in the middle of the screen, with the line whole', () => {
    const g = headlessGame();
    g.start();
    run(g, 2);
    g.backToTitle(false);
    expect(g.mode).toBe('title');
    expect(g.wavell.state).toBe('dead');
    expect(g.wavell.sinking).toBe(true);
    run(g, TUNE.sinkTime - 0.05);
    expect(g.wavell.stroke(g.line)).not.toBeNull();
    run(g, 0.1);
    expect(g.wavell.stroke(g.line)).toBeNull();
    run(g, 0.35);
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
  // The box sits down to the left of the fake view, with its links under a heading.
  // A button acts when the finger lifts: true if the tap landed on one.
  const tap = (g: ReturnType<typeof headlessGame>, x: number, y: number) => {
    const run = g.input.uiTap!(x, y);
    run?.();
    return run !== null;
  };
  const links = { settings: [20, 178], animation: [20, 187], heading: [20, 165] } as const;

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

describe('the title coming apart', () => {
  it('goes from left to right, quickly, and is gone', () => {
    const g = headlessGame(), dust = new TitleDust();
    dust.update(0.1, g.neon, 0);
    const early = dust.rest;
    dust.update(0.2, g.neon, 0);
    const later = dust.rest;
    expect(later.length).toBeLessThan(early.length);
    expect(later[0]).toBeGreaterThan(early[0]);
    expect(dust.done).toBe(false);
    dust.update(0.3, g.neon, 0);
    expect(dust.rest.length).toBe(0);
    dust.update(0.8, g.neon, 0);
    expect(dust.done).toBe(true);
  });
});

describe('nostalgia mode', () => {
  it('has a pixel font for every character the game writes', () => {
    const texts = [...TITLE_HINTS, '← → walk   ↓ through the line   ↑ float / back up', 'left thumb: walk  ·  down: through the line', 'SWIPE ↔ to pull  ·  swipe ↕ to wipe',
      'WRONG ATTACK, IT GREW! BACKWAVE: float over it (UP)', 'Share menu, then Add to Home Screen', '000123  LEVEL 12  ·  75 BPM'];
    for (const t of texts) for (const ch of t) expect(hasGlyph(ch), ch).toBe(true);
  });

  it('goes on and off from its key and its button, and redraws at the new size', () => {
    vi.stubGlobal('document', { fullscreenEnabled: false });
    const g = headlessGame(), resize = vi.fn();
    Object.assign(g.neon, { resize, retro: false });
    g.input.onKey.get('KeyN')!();
    expect(g.neon.retro).toBe(true);
    expect(resize).toHaveBeenCalledTimes(1);
    const [x, y] = nostalgiaButton(g.neon);
    g.input.uiTap!(x, y)!();
    expect(g.neon.retro).toBe(false);
    expect(resize).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
