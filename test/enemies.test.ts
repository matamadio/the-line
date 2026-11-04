// The Sinepede and the Sea Urchin, played through the real game with scripted keys.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DIFF, at } from '../src/data/difficulty';
import { SEG_W, Sinepede } from '../src/game/actors/sinepede';
import { BubbleBurst } from '../src/game/actors/bubble';
import { Urchin } from '../src/game/actors/urchin';
import { Worm } from '../src/game/actors/worm';
import { IDLE, headlessGame, seeded } from './helpers';

vi.mock('../src/core/sfx', () => ({ sfx: { unlock() {}, play() {}, toggleMute() {}, beat() {}, call() {}, cancelled() {}, fed() {}, grew() {}, shrank() {}, hum() {}, rumble() {}, crunch() {}, muted: true } }));

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

    it.each(SIDES)('a crest hurts him %s', (_name, under) => {
      const g = ready();
      if (under) flipUnder(g);
      g.sinepedes.push(new Sinepede(g.wavell.x + 30, 0, 1, 1));
      run(g, 1, { ...IDLE, right: true });
      expect(g.wavell.alive).toBe(false);
    });

    it.each(SIDES)('a trough hurts him %s', (_name, under) => {
      const g = ready();
      if (under) flipUnder(g);
      g.sinepedes.push(new Sinepede(g.wavell.x + 30, 0, 1, -1));
      run(g, 1, { ...IDLE, right: true });
      expect(g.wavell.alive).toBe(false);
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
      run(g, 0.3);
      const b = floating(g, 40);
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
      g.sinepedes.push(new Sinepede(g.wavell.x + 2, 0, 1, 1));
      g.tick(IDLE);
      g.sinepedes = [];
    };
    const grown = (size: number) => {
      const g = ready();
      g.wavell.size = size;
      return g;
    };

    it('grows by catching a bonus, at most twice', () => {
      const g = ready();
      for (let i = 0; i < 3; i++) {
        g.growths.push({ x: g.wavell.x + 2, y: 0, side: 1, life: 5, p: 0 });
        g.tick(IDLE);
      }
      expect(g.wavell.size).toBe(DIFF.growMax);
      expect(DIFF.growMax).toBe(2);
    });

    it('only catches a bonus on his own side of the line', () => {
      const g = ready();
      g.growths.push({ x: g.wavell.x + 2, y: 0, side: -1, life: 5, p: 0 });
      run(g, 0.1);
      expect(g.wavell.size).toBe(0);
      expect(g.growths.length).toBe(1);
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
        (g) => { g.sinepedes.push(new Sinepede(g.wavell.x + 2, 0, 1, -1)); },
        (g) => { g.backwaves.push({ x: g.wavell.x - 1, dir: 1, warn: 0, done: false }); },
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

    it('makes a bigger bubble that lasts longer, and popping it costs a life', () => {
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
      expect(big.g.lives).toBe(DIFF.lives - 1);
    });

    it('does not save the bubble from an enemy', () => {
      const g = grown(2);
      g.tick({ ...IDLE, upPressed: true });
      run(g, 0.4);
      g.sinepedes.push(new Sinepede(g.wavell.x + 2, 0, 1, 1));
      g.wavell.by = g.line.sample(g.wavell.x) - 20;
      run(g, 0.6);
      expect(g.wavell.alive).toBe(false);
    });

    it('goes back to the smallest with a lost life', () => {
      const g = grown(2);
      g.endX = g.wavell.x - 4;
      run(g, 2);
      expect(g.wavell.alive).toBe(true);
      expect(g.wavell.size).toBe(0);
      expect(g.wavell.scale).toBe(1);
    });
  });

  describe('the Sinepede', () => {
    it('is one segment at level 1 and gets longer with the level, up to its limit', () => {
      expect(Math.floor(at('sineSegs', 1))).toBe(1);
      expect(Math.floor(at('sineSegs', 3))).toBe(2);
      expect(Math.floor(at('sineSegs', 500))).toBe(6);
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

    it('kills him on contact on his side, and cancels with him on the other', () => {
      const a = ready();
      a.sinepedes.push(new Sinepede(a.wavell.x + 40, 100, 1, 1));
      run(a, 0.6);
      expect(a.wavell.alive).toBe(false);
      expect(a.wavell.death).toBe('zap');

      const b = ready();
      b.sinepedes.push(new Sinepede(b.wavell.x + 40, 100, 1, -1));
      run(b, 0.6);
      expect(b.wavell.alive).toBe(false);
      expect(b.wavell.death).toBe('flatten');
    });
  });

  describe('the Sea Urchin', () => {
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
