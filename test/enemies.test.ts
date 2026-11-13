// The Sinepede and the Disturchin, played through the real game with scripted keys.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DIFF, at } from '../src/data/difficulty';
import { TUNE } from '../src/data/tune';
import { SEG_W, Sinepede } from '../src/game/actors/sinepede';
import { BubbleBurst } from '../src/game/actors/bubble';
import { Urchin } from '../src/game/actors/urchin';
import { Worm } from '../src/game/actors/worm';
import { backwave, reflux } from '../src/game/game';
import { IDLE, headlessGame, seeded } from './helpers';

vi.mock('../src/core/sfx', () => ({ sfx: { unlock() {}, play() {}, toggleMute() {}, restartMusic() {}, setNostalgia() {}, preview() {}, endPreview() {}, ready: true, cycleStyle() {}, beat() {}, call() {}, cancelled() {}, fed() {}, grew() {}, shrank() {}, hum: vi.fn(), rumble() {}, tideRise() { return () => {}; }, tideCrash() {}, crunch() {}, slam() {}, sentBack() {}, bossHit() {}, meow() {}, whirr() {}, croak() {}, muted: true } }));

// These script each enemy to the second; test/beat.test.ts covers them on the beat.
DIFF.beatOn = 0;

const STEPS_PER_SECOND = 120;
const PULL = { ...IDLE, pullPressed: true };
const WIPE = { ...IDLE, dragPressed: true };

/** Wavell on the line and ready, with nothing else going on. */
function ready() {
  const g = headlessGame();
  g.quiet = true;
  g.start();
  g.wavell.state = 'ground';
  return g;
}
function flipUnder(g: ReturnType<typeof ready>) {
  g.wavell.side = -1;
  g.wavell.flip = 1;
}
function run(g: ReturnType<typeof ready>, seconds: number, k = IDLE) {
  for (let i = 0; i < seconds * STEPS_PER_SECOND; i++) g.tick(k);
}

// For every test in this file: the browser APIs the game touches while it plays, and the
// same random numbers every run, so no test passes or fails on the luck of the draw.
const fileRandom = Math.random;
beforeEach(() => {
  Math.random = seeded(1);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('Path2D', class { moveTo() {} lineTo() {} quadraticCurveTo() {} arc() {} closePath() {} rect() {} });
});
afterEach(() => {
  Math.random = fileRandom;
  vi.unstubAllGlobals();
});

describe('enemies on the line', () => {
  const nativeRandom = Math.random;
  beforeEach(() => {
    Math.random = seeded(21);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('Path2D', class { moveTo() {} lineTo() {} quadraticCurveTo() {} arc() {} closePath() {} });
  });
  afterEach(() => {
    Math.random = nativeRandom;
    vi.unstubAllGlobals();
  });

  const spans = (g: ReturnType<typeof ready>) => [
    ...g.sinepedes.filter((s) => s.harmful).map((s) => [s.x, s.back]),
    ...g.worms.filter((w) => w.harmful).map((w) => [w.x, w.back]),
    ...g.urchins.filter((u) => u.standing).map((u) => [u.x - u.reach, u.x + u.reach]),
    ...g.bubbles.filter((b) => b.harmful && !b.airborne).map((b) => [b.x - b.r, b.x + b.r]),
  ].sort((a, b) => a[0] - b[0]);
  const overlap = (g: ReturnType<typeof ready>) => spans(g).some((s, i, all) => i > 0 && s[0] < all[i - 1][1]);

  it('a crawler queues behind a Disturchin pulling its spikes back in, not through it', () => {
    const g = ready();
    const u = new Urchin(g.wavell.x + 90, 0.01, 0.01), sine = new Sinepede(g.wavell.x + 130, 100, 1);
    g.urchins.push(u);
    g.sinepedes.push(sine);
    for (let i = 0; i < STEPS_PER_SECOND && u.state !== 'close'; i++) g.tick(IDLE);
    expect(u.state).toBe('close');
    while (u.state === 'close') {
      g.tick(IDLE);
      if (u.state === 'close') expect(sine.x).toBeGreaterThanOrEqual(u.x + u.reach);
    }
  });

  it('a faster one queues behind a slower one', () => {
    const g = ready();
    const worm = new Worm(g.wavell.x + 80, 40), sine = new Sinepede(g.wavell.x + 130, 100, 1);
    worm.state = 'move';
    g.worms.push(worm);
    g.sinepedes.push(sine);
    run(g, 1);
    expect(sine.x).toBeGreaterThanOrEqual(worm.back);
    expect(sine.x - worm.back).toBeLessThan(10);
  });

  it('one waits behind a Disturchin, then carries on', () => {
    const g = ready();
    const u = new Urchin(g.wavell.x + 90, 0.5, 0.5), sine = new Sinepede(u.x + 40, 100, 1);
    g.urchins.push(u);
    g.sinepedes.push(sine);
    run(g, 0.8);
    expect(sine.x).toBeGreaterThanOrEqual(u.x + u.reach);
    run(g, 1);
    expect(u.standing).toBe(false);
    expect(sine.x).toBeLessThan(u.x);
  });

  it('one thrown back stops at the next, or shoves it along', () => {
    const g = ready();
    const u = new Urchin(g.wavell.x + 90, 5, 5), a = new Sinepede(g.wavell.x + 30, 0, 1);
    g.urchins.push(u);
    g.sinepedes.push(a);
    a.knock(2000);
    run(g, 0.5);
    expect(a.back).toBeLessThanOrEqual(u.x - u.reach);

    const h = ready();
    const front = new Sinepede(h.wavell.x + 60, 0, 1), behind = new Sinepede(h.wavell.x + 100, 0, 1);
    h.sinepedes.push(front, behind);
    front.knock(1000);
    run(h, 0.5);
    expect(behind.x).toBeGreaterThanOrEqual(front.back);
  });

  it.each([1, 3, 5, 9])('never overlap in a long, messy game at level %i', (level) => {
    const g = ready();
    g.quiet = false;
    let seen = 0, most = 0;
    for (let i = 0; i < 40000; i++) {
      g.level = level;
      g.lives = 9;
      g.wavell.safe = 9;
      const r = Math.random();
      g.tick({ ...IDLE, right: i % 900 < 700, left: i % 900 >= 800, dragPressed: r < 0.01, pullPressed: r > 0.99 });
      const n = spans(g).length;
      seen += n;
      most = Math.max(most, n);
      expect(overlap(g)).toBe(false);
    }
    expect(seen).toBeGreaterThan(1000);
    if (level >= 5) expect(most).toBeGreaterThan(1);
  });
});

describe('the Backwave', () => {
  const coming = (g: ReturnType<typeof ready>, x: number) => {
    const b = backwave(x, 0);
    g.backwaves.push(b);
    return b;
  };
  const holding = (g: ReturnType<typeof ready>, attack: typeof WIPE, facing: 1 | -1 = -1) => {
    g.wavell.facing = facing;
    g.tick(attack);
    while (!g.wavell.holding) g.tick(IDLE);
  };

  it('does not shrink on its way, and grows a little', () => {
    const g = ready();
    const b = backwave(g.neon.camX - 10, 0.01);
    g.backwaves.push(b);
    run(g, 0.1);
    const first = -g.line.sample(b.x);
    expect(first).toBeGreaterThan(DIFF.backAmp * 0.9);
    while (b.x < g.wavell.x - 30) g.tick(IDLE);
    const last = -g.line.sample(b.x);
    expect(last).toBeGreaterThan(first);
    expect(last).toBeLessThan(first * 1.3);
  });

  it('comes slower than the line\'s own waves', () => {
    const g = ready();
    const b = coming(g, g.wavell.x - 280);
    run(g, 0.5);
    expect(DIFF.backSpeed).toBeLessThan(g.line.c);
    expect(b.x).toBeCloseTo(g.wavell.x - 280 + DIFF.backSpeed * 0.5, 0);
  });

  it('is a real ripple: another wave runs through it and comes out whole', () => {
    const after = (withWave: boolean) => {
      const g = ready();
      if (withWave) g.backwaves.push(backwave(g.neon.camX - 10, 0.01));
      run(g, 0.05);
      const from = g.wavell.x - 35;
      g.line.pulse(from, 10, 11, -1);
      run(g, 0.33);
      const x = from - g.line.c * 0.33;
      return { other: g.line.sample(x), crest: withWave ? -g.line.sample(g.backwaves[0].x) : 0, apart: withWave ? g.backwaves[0].x - x : 0 };
    };
    const alone = after(false), crossed = after(true);
    expect(crossed.apart).toBeGreaterThan(50);
    expect(alone.other).toBeGreaterThan(2);
    expect(Math.abs(crossed.other - alone.other)).toBeLessThan(0.3 * alone.other);
    expect(crossed.crest).toBeGreaterThan(DIFF.backAmp * 0.9);
  });

  it('is not sent back by a wipe facing away from it', () => {
    const g = ready();
    holding(g, WIPE, 1);
    const b = coming(g, g.wavell.x - 16);
    run(g, 0.2);
    expect(b.dir).toBe(1);
    expect(g.wavell.alive).toBe(false);
    expect(g.score).toBe(0);
  });

  it('is sent back by a wipe, keeps its height, and earns him time', () => {
    const g = ready();
    holding(g, WIPE);
    const b = coming(g, g.wavell.x - 90);
    run(g, 0.1);
    expect(b.dir).toBe(-1);
    expect(g.wavell.alive).toBe(true);
    expect(g.score).toBe(10);
    const height = b.amp;
    while (g.backwaves.length && b.x > g.neon.camX + 40) {
      g.tick(IDLE);
      if (b.x < g.wavell.x - 60) expect(-g.line.sample(b.x)).toBeGreaterThan(height * 0.8);
    }
    while (g.backwaves.length) g.tick(IDLE);
    const end = g.endX;
    run(g, DIFF.backEarn - 0.1);
    expect(g.endX).toBe(end);
    run(g, 0.3);
    expect(g.endX).toBeGreaterThan(end);
  });

  it('is sent back from afar by a wipe thrown at it', () => {
    const g = ready();
    g.wavell.facing = -1;
    g.tick(WIPE);
    while (!g.pulses.length) g.tick(IDLE);
    const b = coming(g, g.pulses[0].x - 150);
    run(g, 0.3);
    expect(b.dir).toBe(-1);
    expect(b.x).toBeLessThan(g.wavell.x - 60);
  });

  it('carries the end of the line back to the left of the screen when wiped', () => {
    const g = ready();
    g.endX = g.neon.camX + 50;
    holding(g, WIPE);
    const b = coming(g, g.wavell.x - 90);
    run(g, 0.1);
    expect(b.dir).toBe(-1);
    const end = g.endX;
    for (let i = 0; i < STEPS_PER_SECOND * 2 && g.backwaves.length; i++) {
      g.tick(IDLE);
      if (g.backwaves.length) expect(g.endX).toBeLessThan(b.x);
    }
    expect(g.backwaves.length).toBe(0);
    expect(g.endX).toBeLessThan(end);
    expect(g.endX).toBeLessThanOrEqual(g.neon.camX);
    expect(g.wavell.alive).toBe(true);
  });

  it.each([['standing', 0], ['walking back left', -1]] as const)('keeps the end off the screen for its pause after a wipe, %s', (_name, walk) => {
    const g = ready();
    g.endX = g.wavell.x - 160;
    holding(g, WIPE);
    const b = coming(g, g.wavell.x - 90);
    run(g, 0.1);
    expect(b.dir).toBe(-1);
    for (let i = 0; i < STEPS_PER_SECOND * 2 && g.backwaves.length; i++) g.tick(IDLE);
    expect(g.backwaves.length).toBe(0);
    const k = { ...IDLE, left: walk < 0 };
    for (let i = 0; i < (DIFF.backEarn - 0.1) * STEPS_PER_SECOND; i++) {
      g.tick(k);
      expect(g.endX).toBeLessThanOrEqual(g.neon.camX);
      // The gauge fills up for the pause.
      if (i > STEPS_PER_SECOND * 0.6) expect(g.lead).toBeGreaterThan(0.97);
    }
    expect(g.wavell.alive).toBe(true);
    // Then it crumbles in again as usual.
    const end = g.endX;
    run(g, 0.5, k);
    expect(g.endX).toBeGreaterThan(end);
  });

  it('carries the end all the way to the left on a screen wider than his lead', () => {
    const g = ready();
    // Wide enough that the left of the screen is further back than the 240 u lead.
    (g.neon as { viewW: number }).viewW = 1000;
    run(g, 1);
    expect(g.wavell.x - g.neon.camX).toBeGreaterThan(DIFF.endLead + 60);
    g.endX = g.wavell.x - 150;
    holding(g, WIPE);
    const b = coming(g, g.wavell.x - 90);
    run(g, 0.1);
    expect(b.dir).toBe(-1);
    for (let i = 0; i < STEPS_PER_SECOND * 4 && g.backwaves.length; i++) g.tick(IDLE);
    expect(g.backwaves.length).toBe(0);
    // And it stays there: nothing pulls it back in afterwards.
    run(g, 0.5);
    expect(g.endX).toBeLessThanOrEqual(g.neon.camX);
  });

  it('is cancelled by a pull facing it, with no time earned', () => {
    const g = ready();
    g.wavell.facing = -1;
    const b = backwave(g.neon.camX - 10, 0.01);
    g.backwaves.push(b);
    const grace = () => (g as unknown as { endGrace: number }).endGrace;
    run(g, 0.05);
    g.tick(PULL);
    for (let i = 0; i < STEPS_PER_SECOND && g.backwaves.length; i++) g.tick(IDLE);
    expect(g.backwaves.length).toBe(0);
    expect(g.wavell.alive).toBe(true);
    expect(g.score).toBe(10);
    expect(Math.abs(g.line.sample(b.x))).toBeLessThan(DIFF.backAmp * 0.4);
    expect(grace()).toBeLessThan(DIFF.backEarn);
    const end = g.endX;
    run(g, 0.5);
    expect(g.endX).toBeGreaterThanOrEqual(end);
  });

  it('starts on the line when the end of the line is in view, never left of it', () => {
    const g = ready();
    g.endX = g.neon.camX + 30;
    const b = backwave(g.neon.camX - 10, 0.01);
    g.backwaves.push(b);
    run(g, 0.03);
    expect(b.warn).toBeLessThanOrEqual(0);
    expect(b.x - 11 * 2).toBeGreaterThan(g.endX);
    for (let i = 0; i < 12; i++) { g.tick(IDLE); expect(b.x).toBeGreaterThan(g.endX); }
  });

  it('does not come when there is too little line left behind him', () => {
    const g = ready();
    g.endX = g.wavell.x - 40;
    const b = backwave(g.neon.camX - 10, 0.01);
    g.backwaves.push(b);
    run(g, 0.2);
    expect(g.backwaves.length).toBe(0);
    expect(g.wavell.alive).toBe(true);
  });

  it('is not stopped by a pull facing away from it', () => {
    const g = ready();
    holding(g, PULL, 1);
    const b = coming(g, g.wavell.x - 16);
    run(g, 0.1);
    expect(b.dir).toBe(1);
    expect(g.wavell.alive).toBe(false);
  });
});

describe('the game', () => {
  const nativeRandom = Math.random;
  beforeEach(() => {
    Math.random = seeded(5);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('Path2D', class { moveTo() {} lineTo() {} quadraticCurveTo() {} arc() {} closePath() {} });
  });
  afterEach(() => {
    Math.random = nativeRandom;
    vi.unstubAllGlobals();
  });

  describe('the early levels', () => {
    /** Plays a walking game without attacks, and reports the most threats out at once. */
    function mostAtOnce(level: number, seconds: number) {
      const saved = { soloUntil: DIFF.soloUntil, startLevel: DIFF.startLevel, lives: DIFF.lives, levelScore: DIFF.levelScore };
      Object.assign(DIFF, { startLevel: level, lives: 99, levelScore: 1e6 });
      const g = headlessGame();
      g.start();
      let most = 0;
      for (let i = 0; i < seconds * STEPS_PER_SECOND; i++) {
        g.tick({ ...IDLE, right: true });
        const out = g.sinepedes.filter((s) => s.harmful).length + g.worms.filter((w) => w.harmful).length
          + g.bubbles.filter((b) => b.harmful).length + g.urchins.filter((u) => u.state === 'warn' || u.state === 'spikes').length
          + g.backwaves.length + g.refluxes.length;
        most = Math.max(most, out);
      }
      Object.assign(DIFF, saved);
      return most;
    }

    it('send one threat at a time', () => {
      expect(mostAtOnce(1, 180)).toBe(1);
    });

    it('send several at once after that', () => {
      expect(mostAtOnce(DIFF.soloUntil + 1, 180)).toBeGreaterThan(1);
    });
  });

  describe('walking into an enemy', () => {
    const SIDES = [['over the line', false], ['under the line', true]] as const;

    /** A Sinepede he walks into, the near segment on the given side of the line. */
    function bump(under: boolean, side: 1 | -1, count = 2, size = 0) {
      const g = ready();
      g.wavell.size = size;
      if (under) flipUnder(g);
      const s = new Sinepede(g.wavell.x + 30, 0, count, side);
      g.sinepedes.push(s);
      let i = 0;
      while (s.count === count && !s.recoiling && i++ < 120) g.tick({ ...IDLE, right: true });
      return { g, s, hitAt: g.wavell.x, sAt: s.x };
    }

    it.each(SIDES)('on the other side, it is pressed flat as it comes, and he keeps his shape %s', (_name, under) => {
      const g = ready();
      if (under) flipUnder(g);
      const W = g.wavell;
      const height = () => {
        const o = W.stroke(g.line)!;
        let h = 0;
        for (let i = 0; i < o.length; i += 2) h = Math.max(h, Math.abs(o[i + 1] - g.line.sample(o[i])));
        return h;
      };
      const standing = height();
      const s = new Sinepede(W.x + 120, 60, 2, under ? 1 : -1);
      g.sinepedes.push(s);
      let press = 1;
      for (let i = 0; i < STEPS_PER_SECOND * 3 && !s.recoiling && W.alive; i++) {
        g.tick(IDLE);
        press = Math.min(press, s.front(W.x)?.press ?? 1);
        expect(height()).toBeGreaterThan(standing * 0.85);
      }
      expect(press).toBeLessThan(0.5);
    });

    it.each(SIDES)('on his side, it throws them apart and grows %s', (_name, under) => {
      const { g, s, hitAt, sAt } = bump(under, under ? -1 : 1);
      expect(s.count).toBe(3);
      run(g, 0.5);
      expect(g.wavell.alive).toBe(true);
      expect(g.wavell.x).toBeLessThan(hitAt - 30);
      expect(s.x).toBeGreaterThan(sAt + 50);
      expect(s.count).toBe(3);
    });

    it.each(SIDES)('on the other side, it throws them apart, loses a segment and costs him a size %s', (_name, under) => {
      const { g, s, hitAt, sAt } = bump(under, under ? 1 : -1, 2, 1);
      expect(s.count).toBe(1);
      expect(g.wavell.size).toBe(0);
      run(g, 0.5);
      expect(g.wavell.alive).toBe(true);
      expect(g.wavell.x).toBeLessThan(hitAt - 30);
      expect(s.x).toBeGreaterThan(sAt + 50);
    });

    it.each(SIDES)('on the other side, at his smallest, it costs him his life %s', (_name, under) => {
      const { g, s } = bump(under, under ? 1 : -1);
      expect(g.wavell.alive).toBe(false);
      expect(g.wavell.death).toBe('flatten');
      expect(g.wavell.sinking).toBe(true);
      expect(s.count).toBe(1);
    });

    it.each(SIDES)('on the other side, a last segment flattens %s', (_name, under) => {
      const { g, s, sAt } = bump(under, under ? 1 : -1, 1, 1);
      expect(s.harmful).toBe(false);
      expect(g.wavell.size).toBe(0);
      expect(g.wavell.alive).toBe(true);
      // It melts where it is, with no throw back.
      expect(s.recoiling).toBe(false);
      run(g, 0.05);
      expect(Math.abs(s.x - sAt)).toBeLessThan(1);
      run(g, 1);
      expect(s.state).toBe('done');
    });

    it('costs him no size on his own side', () => {
      const g = ready();
      g.wavell.size = 1;
      g.sinepedes.push(new Sinepede(g.wavell.x + 2, 0, 1, 1));
      run(g, 0.2);
      expect(g.wavell.size).toBe(1);
    });

    it('can push him into the end of the line', () => {
      const g = ready();
      g.endX = g.wavell.x - 30;
      g.sinepedes.push(new Sinepede(g.wavell.x + 2, 0, 1, 1));
      run(g, 0.5);
      expect(g.wavell.death).toBe('fall');
    });

    /** A Worm he walks into, from behind it or from ahead. */
    function intoWorm(g: ReturnType<typeof ready>, dir: 1 | -1) {
      const w = new Worm(g.wavell.x + (dir > 0 ? 30 : -40), 0);
      w.state = 'move';
      g.worms.push(w);
      run(g, 1, { ...IDLE, right: dir > 0, left: dir < 0 });
      return w;
    }

    it.each([['from ahead', 1], ['from behind', -1]] as const)('a Worm kills him over it, the opposite side: %s', (_name, dir) => {
      const g = ready();
      intoWorm(g, dir);
      expect(g.wavell.alive).toBe(false);
    });

    it.each([['from ahead', 1], ['from behind', -1]] as const)('a Worm leaves him dizzy under the line, its own side: %s', (_name, dir) => {
      const g = ready();
      flipUnder(g);
      const w = intoWorm(g, dir);
      expect(g.wavell.alive).toBe(true);
      expect(g.wavell.dizzy).toBeGreaterThan(0);
      expect(w.harmful).toBe(false);
      expect(g.lives).toBe(DIFF.lives);
    });

    it.each([
      ['over the line, a bubble on top', false, 1],
      ['over the line, a bubble below', false, -1],
      ['under the line, a bubble on top', true, 1],
      ['under the line, a bubble below', true, -1],
    ] as const)('a Bubble Burst pops and leaves him dizzy: %s', (_name, under, side) => {
      const g = ready();
      if (under) flipUnder(g);
      const b = new BubbleBurst(g.wavell.x + 20, side, 5);
      g.bubbles.push(b);
      run(g, 0.3, { ...IDLE, right: true });
      expect(b.harmful).toBe(false);
      expect(g.wavell.alive).toBe(true);
      expect(g.wavell.dizzy).toBeGreaterThan(0);
    });
  });

  describe('the Bubble Burst', () => {
    it.each([
      ['on his side, pulled', 1, PULL, true],
      ['on his side, wiped', 1, WIPE, false],
      ['on the other side, wiped', -1, WIPE, true],
      ['on the other side, pulled', -1, PULL, false],
    ] as const)('takes the right attack and is fed by the wrong one: %s', (_name, side, attack, pops) => {
      const g = ready();
      const b = new BubbleBurst(g.wavell.x + 60, side, 3);
      g.bubbles.push(b);
      g.tick(attack);
      run(g, 0.8);
      if (pops) expect(b.harmful).toBe(false);
      else {
        expect(b.state).toBe('grow');
        expect(b.ripeness).toBeGreaterThan(0.4 + 0.8 / 3);
      }
    });

    it('is bigger and bursts sooner for being wiped', () => {
      const line = headlessGame().line;
      const plain = new BubbleBurst(0, 1, 2), fed = new BubbleBurst(0, 1, 2);
      fed.feed();
      plain.t = fed.t = 0;
      const secondsToBurst = (b: BubbleBurst) => {
        let t = 0;
        while (b.state === 'grow') { b.update(1 / STEPS_PER_SECOND, line); t += 1 / STEPS_PER_SECOND; }
        return t;
      };
      fed.feed();
      expect(fed.r).toBeGreaterThan(plain.r);
      expect(secondsToBurst(fed)).toBeLessThan(secondsToBurst(plain));
    });

    it('stays on the line unless it is one that floats off', () => {
      const g = ready();
      const b = new BubbleBurst(g.wavell.x + 150, 1, 1);
      g.bubbles.push(b);
      run(g, 0.9);
      expect(b.airborne).toBe(false);
    });

    /** One that has already let go, right over where he stands. */
    function floating(g: ReturnType<typeof ready>, dx = 0) {
      const b = new BubbleBurst(g.wavell.x + dx, 1, 0.1, 0.6);
      g.bubbles.push(b);
      return b;
    }

    it('floats off the line, out of reach of attacks, and bursts in the air', () => {
      const g = ready();
      const b = floating(g, 60);
      run(g, 0.15);
      expect(b.state).toBe('fly');
      const y = b.centre(g.line)[1];
      g.tick(PULL);
      run(g, 0.3);
      expect(b.state).toBe('fly');
      expect(b.centre(g.line)[1]).toBeLessThan(y - 4);
      run(g, 0.4);
      expect(b.harmful).toBe(false);
      expect(g.drops.length).toBeGreaterThan(0);
    });

    it('does not float off once it has been wiped', () => {
      const g = ready();
      const b = new BubbleBurst(g.wavell.x + 60, 1, 3, 1);
      g.bubbles.push(b);
      g.tick(WIPE);
      run(g, 0.8);
      expect(b.airborne).toBe(false);
    });

    it('leaves him dizzy on the line when it bursts over him', () => {
      const g = ready();
      floating(g);
      run(g, 1.6);
      expect(g.wavell.alive).toBe(true);
      expect(g.wavell.dizzy).toBeGreaterThan(0);
    });

    it('pops his bubble when it bursts near it', () => {
      const g = ready();
      g.tick({ ...IDLE, upPressed: true });
      run(g, TUNE.takeoff + 0.05);
      const b = floating(g, 28);
      expect(g.wavell.flying).toBe(true);
      run(g, 1.2);
      expect(b.harmful).toBe(false);
      expect(g.wavell.alive).toBe(false);
    });

    it('sprays only once', () => {
      const g = ready();
      g.bubbles.push(new BubbleBurst(g.wavell.x + 150, 1, 0.1));
      let most = 0;
      for (let i = 0; i < 40; i++) { g.tick(IDLE); most = Math.max(most, g.drops.length); }
      expect(most).toBeLessThanOrEqual(48);
      expect(most).toBeGreaterThan(0);
    });
  });

  describe('his size', () => {
    /** Hits him with a stationary crest, on his side of the line. */
    const hit = (g: ReturnType<typeof ready>) => {
      g.wavell.hurt('zap');
      g.tick(IDLE);
    };
    const grown = (size: number) => {
      const g = ready();
      g.wavell.size = size;
      return g;
    };

    /** A sparkle right on him, at this offset from the line (negative is above it). */
    const sparkle = (g: ReturnType<typeof ready>, off = -15) => {
      const x = g.wavell.x + 2;
      g.sparkles.push({ x, y: g.line.sample(x) + off, vx: 0, vy: 0, life: 5, max: 5, gold: false, p: 0 });
      g.tick(IDLE);
    };

    it('grows a size every ten sparkles, at most three times', () => {
      const g = ready();
      expect(DIFF.sparksPerSize).toBe(10);
      expect(DIFF.growMax).toBe(3);
      for (let i = 0; i < 9; i++) sparkle(g);
      expect(g.wavell.size).toBe(0);
      sparkle(g);
      expect(g.wavell.size).toBe(1);
      expect(g.wavell.sparks).toBe(0);
      for (let i = 0; i < 35; i++) sparkle(g);
      expect(g.wavell.size).toBe(3);
      expect(g.wavell.sparks).toBe(0);
    });

    it('only catches a sparkle on his own side of the line', () => {
      const g = ready();
      sparkle(g, 15);
      expect(g.wavell.sparks).toBe(0);
      expect(g.sparkles.length).toBe(1);
    });

    it('sends sparkles to both sides of the line in equal numbers', () => {
      const random = Math.random;
      Math.random = seeded(5);
      try {
        let above = 0, trials = 0;
        for (let i = 0; i < 600; i++) {
          const g = ready();
          g.quiet = false;
          g.playTime = 2.5;
          g.tick(IDLE);
          // One that starts off screen is gone at once, whichever side it was on.
          const s = g.sparkles[0];
          if (!s) continue;
          trials++;
          if (s.y < g.line.sample(s.x)) above++;
        }
        expect(trials).toBeGreaterThan(200);
        expect(above / trials).toBeGreaterThan(0.42);
        expect(above / trials).toBeLessThan(0.58);
      } finally {
        Math.random = random;
      }
    });

    it('draws him bigger and walks him faster', () => {
      const walked = (size: number) => {
        const g = grown(size), x = g.wavell.x;
        run(g, 1, { ...IDLE, right: true });
        return { far: g.wavell.x - x, scale: g.wavell.scale };
      };
      const [small, big, biggest] = [walked(0), walked(1), walked(2)];
      expect(big.far).toBeGreaterThan(small.far);
      expect(biggest.far).toBeGreaterThan(big.far);
      expect(big.scale).toBeGreaterThan(small.scale);
      expect(biggest.scale).toBeGreaterThan(big.scale);
    });

    it('takes a hit instead of a life, and is safe for a moment', () => {
      const g = grown(2);
      hit(g);
      expect(g.wavell.size).toBe(1);
      expect(g.wavell.alive).toBe(true);
      expect(g.lives).toBe(DIFF.lives);
      hit(g);
      expect(g.wavell.size).toBe(1);
      run(g, DIFF.growSafe + 0.1);
      hit(g);
      expect(g.wavell.size).toBe(0);
      run(g, DIFF.growSafe + 0.1);
      hit(g);
      expect(g.wavell.alive).toBe(false);
    });

    it('takes a hit from every enemy that would have killed him', () => {
      const cases: ((g: ReturnType<typeof ready>) => void)[] = [
        (g) => { const u = new Urchin(g.wavell.x + 2, 0.01, 2); g.urchins.push(u); },
        (g) => { const w = new Worm(g.wavell.x - 5, 0); w.state = 'move'; g.worms.push(w); },
        (g) => { g.backwaves.push(backwave(g.wavell.x - 1, 0)); },
      ];
      for (const make of cases) {
        const g = grown(1);
        make(g);
        run(g, 0.2);
        expect(g.wavell.size).toBe(0);
        expect(g.wavell.alive).toBe(true);
      }
    });

    it('does not save him from the end of the line', () => {
      const g = grown(2);
      g.endX = g.wavell.x - 4;
      g.tick(IDLE);
      expect(g.wavell.alive).toBe(false);
      expect(g.wavell.death).toBe('fall');
    });

    it('makes a bigger bubble that lasts longer, and popping it ends the game', () => {
      const flight = (size: number) => {
        const g = grown(size);
        run(g, 0.5);
        g.tick({ ...IDLE, upPressed: true });
        g.tick(IDLE);
        const r = g.wavell.bubbleR;
        let seconds = 0;
        while (g.wavell.alive) { g.tick({ ...IDLE, up: true }); seconds += 1 / STEPS_PER_SECOND; }
        return { g, r, seconds };
      };
      const small = flight(0), big = flight(2);
      expect(big.r).toBeGreaterThan(small.r);
      expect(big.seconds).toBeGreaterThan(small.seconds);
      expect(big.g.lives).toBe(0);
    });

    it('does not save the bubble from an enemy', () => {
      const g = grown(2);
      g.tick({ ...IDLE, upPressed: true });
      run(g, TUNE.takeoff + 0.05);
      g.sinepedes.push(new Sinepede(g.wavell.x + 2, 0, 1, 1));
      g.wavell.by = g.line.sample(g.wavell.x) - 20;
      run(g, 0.6);
      expect(g.wavell.alive).toBe(false);
    });

    it('is over at a hit with no size left, or at the end of the line or a pop at any size', () => {
      const over = (size: number, end: (g: ReturnType<typeof ready>) => void) => {
        const g = grown(size);
        end(g);
        run(g, 2);
        return g.mode;
      };
      expect(over(0, (g) => g.wavell.hurt('zap'))).toBe('over');
      expect(over(3, (g) => { g.endX = g.wavell.x - 4; })).toBe('over');
      expect(over(3, (g) => { g.wavell.state = 'fly'; g.wavell.hurt('pop'); })).toBe('over');
    });

    it('keeps the sparkles towards the next size when a hit takes one', () => {
      const g = grown(2);
      g.wavell.sparks = 4;
      hit(g);
      expect(g.wavell.size).toBe(1);
      expect(g.wavell.sparks).toBe(4);
    });

    it('goes back to the smallest with a lost life, when there are lives to spare', () => {
      const g = grown(2);
      g.lives = 2;
      g.endX = g.wavell.x - 4;
      run(g, 2);
      expect(g.wavell.alive).toBe(true);
      expect(g.wavell.size).toBe(0);
      expect(g.wavell.scale).toBe(1);
    });
  });

  describe('his bubble below the line', () => {
    const DOWN = { ...IDLE, downPressed: true }, UP = { ...IDLE, upPressed: true };
    const under = () => {
      const g = ready();
      g.tick(DOWN);
      run(g, 1);
      expect(g.wavell.under).toBe(true);
      expect(g.wavell.state).toBe('ground');
      return g;
    };
    const floating = () => {
      const g = under();
      g.tick(DOWN);
      run(g, TUNE.takeoff + 0.05);
      expect(g.wavell.flying).toBe(true);
      return g;
    };

    it('floats off with down, staying below the line', () => {
      const g = floating();
      expect(g.wavell.by).toBeGreaterThan(g.line.sample(g.wavell.x));
      const y = g.wavell.by;
      run(g, 0.2, { ...IDLE, down: true });
      expect(g.wavell.by).toBeGreaterThan(y);
    });

    it('still goes back through the line with up', () => {
      const g = under();
      g.tick(UP);
      run(g, 1);
      expect(g.wavell.under).toBe(false);
      expect(g.wavell.flying).toBe(false);
    });

    it('on top, down still goes through the line and up still floats', () => {
      const g = ready();
      g.tick(UP);
      run(g, 0.4);
      expect(g.wavell.flying).toBe(true);
      expect(g.wavell.by).toBeLessThan(g.line.sample(g.wavell.x));
    });

    it('lands with up, still under the line', () => {
      const g = floating();
      run(g, 1, { ...IDLE, up: true });
      expect(g.wavell.flying).toBe(false);
      expect(g.wavell.alive).toBe(true);
      run(g, 0.5);
      expect(g.wavell.state).toBe('ground');
      expect(g.wavell.under).toBe(true);
    });

    it('comes out of the line on his own side as he lands', () => {
      const g = floating();
      while (g.wavell.flying) g.tick({ ...IDLE, up: true });
      expect(g.wavell.state).toBe('land');
      let frames = 0;
      while (g.wavell.state === 'land') {
        g.tick(IDLE);
        const W = g.wavell, pts = W.stroke(g.line) ?? [], ground = g.line.sample(W.x);
        // Never more than a ripple of the line above it.
        for (let i = 1; i < pts.length; i += 2) expect(pts[i]).toBeGreaterThan(ground - 4);
        frames++;
      }
      expect(frames).toBeGreaterThan(0);
    });

    it('stops at the bottom of the view', () => {
      const g = floating();
      for (let i = 0; i < 2 * STEPS_PER_SECOND && g.wavell.flying; i++) g.tick({ ...IDLE, down: true });
      expect(g.wavell.by + g.wavell.bubbleR).toBeLessThanOrEqual(g.neon.viewBottom);
    });

    it('is popped by a Worm down there, but not over it on top', () => {
      const worm = (g: ReturnType<typeof ready>) => {
        const w = new Worm(g.wavell.x - 10, 0);
        w.state = 'move';
        g.worms.push(w);
      };
      const below = floating();
      worm(below);
      below.wavell.by = below.line.sample(below.wavell.x) + below.wavell.bubbleR;
      run(below, 0.1);
      expect(below.wavell.alive).toBe(false);
      const above = ready();
      above.tick(UP);
      run(above, 0.4);
      worm(above);
      run(above, 0.1);
      expect(above.wavell.alive).toBe(true);
    });
  });

  describe('sparkles from a kill', () => {
    /** Plants an enemy ahead, pulls once, and says what it left behind, above and below the line. */
    const killed = (plant: (g: ReturnType<typeof ready>) => void) => {
      const g = ready();
      plant(g);
      run(g, 0.3);
      g.tick(PULL);
      run(g, 0.8);
      const above = g.sparkles.filter((s) => s.y < g.line.sample(s.x)).length;
      return { above, below: g.sparkles.length - above };
    };

    it.each<[string, (g: ReturnType<typeof ready>) => void]>([
      ['a Sinepede', (g) => { g.sinepedes.push(new Sinepede(g.wavell.x + 60, 0, 1, 1)); }],
      ['a Worm', (g) => { const w = new Worm(g.wavell.x + 60, 0); w.state = 'move'; g.worms.push(w); }],
      ['a Disturchin', (g) => { g.urchins.push(new Urchin(g.wavell.x + 60, 0.01, 5)); }],
      ['a Bubble Burst', (g) => { g.bubbles.push(new BubbleBurst(g.wavell.x + 60, 1, 5)); }],
    ])('%s leaves one on each side of the line', (_name, plant) => {
      expect(DIFF.sparkleKill).toBe(2);
      expect(killed(plant)).toEqual({ above: 1, below: 1 });
    });

    it('a Sinepede leaves none until its last segment goes', () => {
      expect(killed((g) => { g.sinepedes.push(new Sinepede(g.wavell.x + 60, 0, 2, 1)); })).toEqual({ above: 0, below: 0 });
    });

    it('a Backwave pulled flat leaves them too', () => {
      const g = ready();
      g.wavell.facing = -1;
      g.backwaves.push(backwave(g.neon.camX + 40, 0.01));
      run(g, 0.05);
      g.tick(PULL);
      run(g, 0.8);
      expect(g.backwaves.length).toBe(0);
      expect(g.sparkles.length).toBe(2);
    });

    it('comes on top of a full screen of them', () => {
      const g = ready();
      g.sinepedes.push(new Sinepede(g.wavell.x + 60, 0, 1, 1));
      run(g, 0.3);
      for (let i = 0; i < DIFF.sparkleMax; i++) g.sparkles.push({ x: g.wavell.x - 60, y: g.line.sample(g.wavell.x - 60) - 30, vx: 0, vy: 0, life: 4, max: 4, gold: false, p: 0 });
      g.tick(PULL);
      run(g, 0.8);
      expect(g.sparkles.length).toBe(DIFF.sparkleMax + 2);
    });

    it('makes him glow for a second and a half when he grows', () => {
      const g = ready();
      expect(g.wavell.glowing).toBe(0);
      g.wavell.sparks = DIFF.sparksPerSize - 1;
      g.wavell.collect();
      expect(g.wavell.glowing).toBe(1.5);
      run(g, 1.4);
      expect(g.wavell.glowing).toBeGreaterThan(0);
      run(g, 0.2);
      expect(g.wavell.glowing).toBe(0);
    });
  });

  describe('the Sinepede', () => {
    it.each([1, 2, 3, 5])('hums with how many segments it has left (%i)', async (count) => {
      const { sfx } = await import('../src/core/sfx');
      const hum = vi.mocked(sfx.hum);
      const g = ready(), s = new Sinepede(g.wavell.x + 100, 0, count, 1);
      g.sinepedes.push(s);
      for (let i = 0; i < 600 && !s.harmful; i++) g.tick(IDLE);
      expect(s.harmful).toBe(true);
      hum.mockClear();
      // The hum is set once a frame, not in every step tick() runs.
      (g as unknown as { hum(): void }).hum();
      expect(hum).toHaveBeenLastCalledWith(count, expect.any(Number));
      expect(hum.mock.lastCall![1]).toBeGreaterThan(0);
    });

    it('is one unbroken stroke that leaves the flat line level at both ends', () => {
      const g = headlessGame();
      const s = new Sinepede(200, 0, 3, 1);
      s.update(10);
      const o = s.outline(g.line), n = o.length / 2;
      for (let i = 1; i < n; i++) expect(Math.hypot(o[i * 2] - o[i * 2 - 2], o[i * 2 + 1] - o[i * 2 - 1])).toBeLessThan(12);
      const slope = (a: number, b: number) => Math.abs((o[b * 2 + 1] - o[a * 2 + 1]) / (o[b * 2] - o[a * 2]));
      expect(o[1]).toBeCloseTo(g.line.sample(o[0]));
      expect(o[n * 2 - 1]).toBeCloseTo(g.line.sample(o[n * 2 - 2]));
      expect(slope(0, 1)).toBeLessThan(0.2);
      expect(slope(n - 2, n - 1)).toBeLessThan(0.2);
    });

    it('draws its shoulders back to leave room for what is next to it', () => {
      const g = headlessGame();
      const s = new Sinepede(200, 0, 1, 1);
      s.update(10);
      expect(s.outline(g.line, [0, 4])[0]).toBe(200);
      expect(s.outline(g.line, [0, 4]).at(-2)).toBe(s.back + 4);
    });

    it('only hurts where the wave is: the spikes reach no further', () => {
      const g = headlessGame();
      const s = new Sinepede(200, 0, 1, 1);
      s.update(10);
      const top = Math.min(...s.outline(g.line).filter((_, i) => i % 2 === 1));
      expect(top).toBeLessThan(-26);
      expect(s.touches(g.line, s.centre, top, 0)).toBe(false);
      expect(s.touches(g.line, s.centre, -24, 0)).toBe(true);
    });

    it('is one segment at level 1 and gets longer with the level, up to its limit', () => {
      expect(Math.floor(at('sineSegs', 1))).toBe(1);
      expect([1, 4, 5, 8, 9].map((l) => Math.floor(at('sineSegs', l)))).toEqual([1, 1, 2, 2, 3]);
      expect(Math.floor(at('sineSegs', 500))).toBe(4);
    });

    it('is set back a little by each right attack, so a long one can be worn down', () => {
      const g = ready();
      const s = new Sinepede(g.wavell.x + 60, 0, 3, 1);
      g.sinepedes.push(s);
      run(g, 0.3);
      const from = s.x;
      g.tick(PULL);
      for (let i = 0; i < STEPS_PER_SECOND && s.count === 3; i++) g.tick(IDLE);
      expect(s.count).toBe(2);
      run(g, 1);
      // Past the faded segment, and further on still.
      expect(s.x).toBeGreaterThan(from + SEG_W + 10);
    });

    it.each([4, 6])('a perfect player wears down %i segments at level 9', (count) => {
      const g = ready();
      g.level = 9;
      const W = g.wavell, s = new Sinepede(W.x + 200, at('sineSpeed', 9), count, 1);
      g.sinepedes.push(s);
      for (let i = 0; i < STEPS_PER_SECOND * 8 && s.harmful && W.alive; i++) {
        const f = s.front(W.x), near = f && s.frontCentre(W.x) - W.x < 90;
        const k = { ...IDLE };
        if (near && f && W.state === 'ground') { if (f.side === W.side) k.pullPressed = true; else k.dragPressed = true; }
        g.tick(k);
        expect(s.count).toBeLessThanOrEqual(count);
      }
      expect(s.harmful).toBe(false);
      expect(W.alive).toBe(true);
      expect(W.size).toBe(0);
    });

    it('alternates crests and troughs', () => {
      expect(new Sinepede(0, 0, 4, 1).sides).toEqual([1, -1, 1, -1]);
      expect(new Sinepede(0, 0, 3, -1).sides).toEqual([-1, 1, -1]);
    });

    it.each([
      ['a crest, pulled', 1, PULL],
      ['a trough, wiped', -1, WIPE],
    ] as const)('cancels with the right attack: %s', (_name, side, attack) => {
      const g = ready();
      const s = new Sinepede(g.wavell.x + 60, 0, 1, side);
      g.sinepedes.push(s);
      run(g, 0.3);
      const score = g.score;
      g.tick(attack);
      run(g, 1);
      expect(s.state).toBe('done');
      expect(g.score).toBeGreaterThan(score);
      expect(g.wavell.alive).toBe(true);
    });

    it.each([
      ['a crest, wiped', 1, WIPE],
      ['a trough, pulled', -1, PULL],
    ] as const)('is pushed back and grows a segment with the wrong attack: %s', (_name, side, attack) => {
      const g = ready();
      const s = new Sinepede(g.wavell.x + 60, 0, 1, side);
      g.sinepedes.push(s);
      run(g, 0.3);
      const x = s.x;
      g.tick(attack);
      run(g, 1);
      expect(s.count).toBe(2);
      expect(s.sides).toEqual([side, -side]);
      expect(s.x).toBeGreaterThan(x + SEG_W);
    });

    it('is worked through one segment at a time, alternating attacks', () => {
      const g = ready();
      const s = new Sinepede(g.wavell.x + 50, 0, 3, 1);
      g.sinepedes.push(s);
      run(g, 0.3);
      for (const [attack, left] of [[PULL, 2], [WIPE, 1], [PULL, 0]] as const) {
        g.tick(attack);
        run(g, 1);
        expect(s.count).toBe(left);
      }
      expect(s.state).toBe('done');
    });

  });

  describe('the Worm', () => {
    const worm = (g: ReturnType<typeof ready>) => {
      const w = new Worm(g.wavell.x + 60, 0);
      w.state = 'move';
      g.worms.push(w);
      return w;
    };

    it.each([['from on top', false], ['from under the line', true]])('is flattened by a pull, %s', (_name, under) => {
      const g = ready();
      if (under) flipUnder(g);
      const w = worm(g);
      g.tick(PULL);
      run(g, 0.8);
      expect(w.dead).toBe(true);
      expect(g.score).toBeGreaterThan(0);
    });

    it.each([['from on top', false], ['from under the line', true]])('grows and is pushed back by a wipe, %s', (_name, under) => {
      const g = ready();
      if (under) flipUnder(g);
      const w = worm(g), from = w.x;
      g.tick(WIPE);
      run(g, 1.2);
      expect(w.dead).toBe(false);
      expect(w.size).toBe(1);
      expect(w.x).toBeGreaterThan(from + 50);
    });
  });

  describe('the Disturchin', () => {
    /** Ticks until the wipe has landed on it, or gives up: a wipe that misses must fail, not hang. */
    const wipeLands = (g: ReturnType<typeof ready>, u: Urchin) => {
      const { size, hold } = u;
      g.tick(WIPE);
      for (let i = 0; i < STEPS_PER_SECOND * 2 && u.size === size && u.hold === hold && !u.moving; i++) g.tick(IDLE);
      expect(u.moving).toBe(true);
    };

    it('comes up ahead of him even when he has turned round, away from the end of the line', () => {
      const g = ready();
      g.quiet = false;
      g.playTime = DIFF.urchinFrom + 1;
      g.wavell.facing = -1;
      const clocks = g as unknown as { urchinClock: number; sineClock: number; wormClock: number; bubbleClock: number };
      clocks.urchinClock = 99;
      clocks.sineClock = clocks.wormClock = clocks.bubbleClock = -99;
      for (let i = 0; i < STEPS_PER_SECOND && !g.urchins.length; i++) { g.wavell.facing = -1; g.tick(IDLE); }
      expect(g.urchins.length).toBe(1);
      expect(g.urchins[0].x).toBeGreaterThan(g.wavell.x + 60);
    });

    it('starts its time over, and lasts longer, when wiped', () => {
      const g = ready();
      const u = new Urchin(g.wavell.x + 60, 0.1, 2);
      g.urchins.push(u);
      run(g, 0.7);
      expect(u.state).toBe('spikes');
      const before = u.t;
      wipeLands(g, u);
      expect(u.size).toBe(1);
      expect(u.hold).toBeCloseTo(2 + DIFF.urchinRenew);
      expect(u.t).toBeLessThan(before);
      expect(u.harmful).toBe(true);
      run(g, 2 + DIFF.urchinRenew - 0.2);
      expect(u.state).toBe('spikes');
      run(g, 0.4);
      expect(u.standing).toBe(false);
    });

    it('stops getting longer once it can not grow, but still starts over', () => {
      const g = ready();
      const u = new Urchin(g.wavell.x + 60, 0.1, 2);
      u.size = DIFF.maxSize;
      g.urchins.push(u);
      run(g, 0.7);
      const before = u.t;
      wipeLands(g, u);
      expect(u.hold).toBe(2);
      expect(u.t).toBeLessThan(before);
      expect(u.state).toBe('spikes');
    });

    it.each([['from on top', false], ['from under the line', true]])('is bounced back a little by a wipe, %s', (_name, under) => {
      const g = ready();
      if (under) flipUnder(g);
      const u = new Urchin(g.wavell.x + 60, 5, 5), from = u.x;
      g.urchins.push(u);
      g.tick(WIPE);
      run(g, 1.5);
      expect(u.size).toBe(1);
      expect(u.moving).toBe(false);
      const moved = u.x - from;
      expect(moved).toBeGreaterThan(DIFF.urchinKnock / 5 * 0.9);
      expect(moved).toBeLessThan(DIFF.urchinKnock / 5 * 1.1);
    });

    it('is not moved by a pull', () => {
      const g = ready();
      const u = new Urchin(g.wavell.x + 60, 5, 5);
      u.size = 2;
      const from = u.x;
      g.urchins.push(u);
      g.tick(PULL);
      run(g, 1);
      expect(u.size).toBe(1);
      expect(u.x).toBe(from);
    });

    it('warns, keeps its spikes out for the time given, then is gone', () => {
      const u = new Urchin(0, 0.5, 1);
      const line = headlessGame().line;
      expect(u.harmful).toBe(false);
      let spiked = 0, opened = 0;
      for (let i = 0; i < 3 * STEPS_PER_SECOND; i++) {
        u.update(1 / STEPS_PER_SECOND);
        if (u.justOpened) opened++;
        if (u.state === 'spikes') spiked++;
        for (const v of u.outline(line)) expect(Number.isFinite(v)).toBe(true);
      }
      expect(opened).toBe(1);
      expect(spiked / STEPS_PER_SECOND).toBeCloseTo(1, 1);
      expect(u.state).toBe('done');
    });

    it('does nothing during the warning', () => {
      const g = ready();
      g.urchins.push(new Urchin(g.wavell.x, 1, 1));
      run(g, 0.5);
      expect(g.wavell.alive).toBe(true);
    });

    it.each([
      ['over the line', false],
      ['under the line', true],
    ])('kills him while its spikes are out: %s', (_name, under) => {
      const g = ready();
      if (under) flipUnder(g);
      g.urchins.push(new Urchin(g.wavell.x, 0.2, 1));
      run(g, 0.5);
      expect(g.wavell.alive).toBe(false);
    });

    it.each([
      ['over the line', false],
      ['under the line', true],
    ])('dies to a pull: %s', (_name, under) => {
      const g = ready();
      if (under) flipUnder(g);
      const u = new Urchin(g.wavell.x + 60, 5, 1);
      g.urchins.push(u);
      const score = g.score;
      g.tick(PULL);
      run(g, 1);
      expect(u.state).toBe('done');
      expect(g.score).toBeGreaterThan(score);
    });

    it.each([
      ['over the line', false],
      ['under the line', true],
    ])('grows from a wipe: %s', (_name, under) => {
      const g = ready();
      if (under) flipUnder(g);
      const u = new Urchin(g.wavell.x + 60, 5, 1);
      g.urchins.push(u);
      const reach = u.reach;
      g.tick(WIPE);
      run(g, 1);
      expect(u.state).toBe('warn');
      expect(u.size).toBe(1);
      expect(u.reach).toBeGreaterThan(reach);
    });

    it('starts as a fuzz through the line, to both sides, that spreads and gets stronger', () => {
      const line = headlessGame().line;
      const u = new Urchin(0, 1, 1);
      const measure = () => {
        const o = u.outline(line), ys = o.filter((_, i) => i % 2 === 1), xs = o.filter((_, i) => i % 2 === 0);
        return { up: Math.min(...ys), down: Math.max(...ys), wide: Math.max(...xs) - Math.min(...xs) };
      };
      for (let i = 0; i < 24; i++) u.update(1 / STEPS_PER_SECOND);
      const early = measure();
      for (let i = 0; i < 84; i++) u.update(1 / STEPS_PER_SECOND);
      const late = measure();
      expect(u.state).toBe('warn');
      for (const m of [early, late]) {
        expect(m.up).toBeLessThan(0);
        expect(m.down).toBeGreaterThan(0);
      }
      expect(late.down).toBeGreaterThan(early.down);
      expect(late.wide).toBeGreaterThan(early.wide);
      // Still a vibration on the line, nothing like the spikes to come.
      expect(late.down).toBeLessThan(8);
    });

    it('has spikes that reach just as far on both sides', () => {
      const line = headlessGame().line;
      const u = new Urchin(0, 0.1, 1);
      for (let i = 0; i < 40; i++) u.update(1 / STEPS_PER_SECOND);
      expect(u.harmful).toBe(true);
      expect(u.touches(line, 0, -20, 1)).toBe(true);
      expect(u.touches(line, 0, 20, 1)).toBe(true);
    });

    it('takes one more pull for each size it grew', () => {
      const g = ready();
      const u = new Urchin(g.wavell.x + 60, 20, 1);
      g.urchins.push(u);
      g.tick(WIPE);
      run(g, 1);
      g.tick(WIPE);
      run(g, 1);
      expect(u.size).toBe(2);
      for (const left of [1, 0]) {
        g.tick(PULL);
        run(g, 1);
        expect(u.size).toBe(left);
        expect(u.standing).toBe(true);
      }
      g.tick(PULL);
      run(g, 1);
      expect(u.state).toBe('done');
    });

    it('stops grow at the size limit', () => {
      const u = new Urchin(0);
      for (let i = 0; i < DIFF.maxSize + 3; i++) u.grow();
      expect(u.size).toBe(DIFF.maxSize);
    });

    it('cuts off its sound when it goes early', () => {
      const u = new Urchin(0);
      const hush = vi.fn();
      u.hush = hush;
      u.sink();
      expect(hush).toHaveBeenCalledOnce();
    });
  });
});

describe('the pull', () => {
  const bubbleAt = (g: ReturnType<typeof ready>, x: number) => {
    const b = new BubbleBurst(x, 1, 3);
    g.bubbles.push(b);
    g.tick(PULL);
    run(g, 0.3);
    return b;
  };

  it('reaches a creature near the far edge of the view', () => {
    const g = ready();
    const b = bubbleAt(g, g.neon.camX + g.neon.viewW - 15);
    expect(b.harmful).toBe(false);
  });

  it('does not reach one past the edge of the view', () => {
    const g = ready();
    const b = bubbleAt(g, g.neon.camX + g.neon.viewW + 15);
    expect(b.harmful).toBe(true);
  });

  it('does not reach one behind him', () => {
    const g = ready();
    const b = bubbleAt(g, g.wavell.x - 60);
    expect(b.harmful).toBe(true);
  });
});

describe('a reflux', () => {
  const coming = (side: 1 | -1, under: boolean, size = 1) => {
    const g = ready();
    g.wavell.size = size;
    if (under) flipUnder(g);
    run(g, 0.3);
    g.refluxes.push(reflux(g.wavell.x - g.neon.camX + 60, -1, side, g.wavell));
    return g;
  };

  it.each([['above him', 1, false], ['below him', -1, true]] as const)('%s, it hits him', (_name, side, under) => {
    const g = coming(side, under);
    run(g, 0.6);
    expect(g.wavell.size).toBe(0);
  });

  it.each([['above', 1, true], ['below', -1, false]] as const)('%s the line, it passes him on the other side', (_name, side, under) => {
    const g = coming(side, under);
    run(g, 0.6);
    expect(g.wavell.size).toBe(1);
    expect(g.score).toBeGreaterThan(0);
  });

  it('runs half his height from the line, wherever the line goes', () => {
    const g = coming(1, false);
    const r = g.refluxes[0];
    expect(r.dist).toBeCloseTo(g.wavell.height / 2, 5);
    g.line.impulse(g.neon.camX + r.sx - 30, 150, 12);
    for (let i = 0; i < 20; i++) {
      g.tick(IDLE);
      expect(g.line.sample(g.neon.camX + r.sx) - r.y).toBeCloseTo(r.dist, 0);
    }
  });
});

describe('reaching the end of the line', () => {
  /** An enemy put right at the end, one step on. */
  function caught(put: (g: ReturnType<typeof ready>) => void) {
    const g = ready();
    g.endX = g.wavell.x - 100;
    put(g);
    g.tick(IDLE);
    return g;
  }
  const ENEMIES: [string, (g: ReturnType<typeof ready>) => void][] = [
    ['Sinepede', (g) => { g.sinepedes.push(new Sinepede(g.endX + 1, 0, 2, 1)); }],
    ['Worm', (g) => { const w = new Worm(g.endX + 1, 0); w.state = 'move'; g.worms.push(w); }],
    ['fuzzing Urchin', (g) => { g.urchins.push(new Urchin(g.endX + 1, 5, 5)); }],
    ['spiked Urchin', (g) => { const u = new Urchin(g.endX + 1, 0, 5); u.state = 'spikes'; u.t = 0.1; g.urchins.push(u); }],
  ];

  it.each(ENEMIES)('a %s burns along its contour as fast as the line, which crumbles on right after it', (_name, put) => {
    const g = caught(put);
    expect(g.sinepedes.length + g.urchins.length + g.worms.length).toBe(0);
    expect(g.crumbles.length).toBe(1);
    const c = g.crumbles[0];
    // The end of the line does not jump: it crumbles on through the creature at its own speed.
    g.endGrace = 0;
    const step = (g as unknown as { endSpeed: number }).endSpeed / STEPS_PER_SECOND;
    // A small one can be caught when the end has already reached its far side: then it goes at once.
    const past = Math.max(0, g.endX + 7 - c.right);
    let last = g.endX, frames = 0;
    while (g.crumbles.length && frames++ < 10 * STEPS_PER_SECOND) {
      g.tick(IDLE);
      expect(g.endX - last).toBeCloseTo(step, 6);
      last = g.endX;
      // The break is where the end of the line has got to.
      if (g.crumbles.length) expect(c.front).toBeCloseTo(g.endX + 7 - step, 6);
    }
    expect(g.crumbles.length).toBe(0);
    // Burnt away just as the end of the line reached its far side.
    expect(g.endX + 7).toBeGreaterThanOrEqual(c.right);
    expect(g.endX + 7 - c.right).toBeLessThanOrEqual(Math.max(step * 2, past + step * 2));
  });

  it('never takes him with it', () => {
    const g = ready();
    g.endX = g.wavell.x - 30;
    g.wavell.safe = 5;
    g.sinepedes.push(new Sinepede(g.endX + 1, 0, 3, 1));
    run(g, 0.1);
    expect(g.crumbles.length).toBe(1);
    expect(g.endX).toBeLessThan(g.wavell.x - 5);
    expect(g.wavell.alive).toBe(true);
  });

  it('leaves sparks going every way, none of them falling', () => {
    const g = caught(ENEMIES[0][1]);
    run(g, 0.3);
    const fan = (g.fx as unknown as { sparks: { vx: number; vy: number; grav: number; drag: number }[] }).sparks.filter((s) => s.drag === 0);
    expect(fan.every((s) => s.grav === 0)).toBe(true);
    expect(fan.some((s) => s.vx > 0)).toBe(true);
    expect(fan.some((s) => s.vy > 0)).toBe(true);
    expect(fan.some((s) => s.vy < 0)).toBe(true);
  });

  it('does not bother him', () => {
    const g = caught(ENEMIES[0][1]);
    run(g, 2);
    expect(g.wavell.alive).toBe(true);
  });
});
