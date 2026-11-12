// THE FLATTENER, the level 10 boss, played through the real game with scripted keys.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DIFF, levelStart } from '../src/data/difficulty';
import type { BossPower, Flattener } from '../src/game/actors/flattener';
import { BOSS } from '../src/data/boss';
import { HEIGHT } from '../src/game/actors/wavell';
import { reflux } from '../src/game/game';
import { IDLE, headlessGame, seeded } from './helpers';

vi.mock('../src/core/sfx', () => ({ sfx: { unlock() {}, play() {}, toggleMute() {}, restartMusic() {}, setNostalgia() {}, preview() {}, endPreview() {}, ready: true, cycleStyle() {}, beat() {}, call() {}, cancelled() {}, fed() {}, grew() {}, shrank() {}, hum() {}, rumble() {}, crunch() {}, slam() {}, sentBack() {}, bossHit() {}, meow() {}, whirr() {}, croak() {}, muted: true } }));

DIFF.beatOn = 0;

const STEPS_PER_SECOND = 120;
const WIPE = { ...IDLE, dragPressed: true };
type G = ReturnType<typeof headlessGame>;

/** Score enough for the last level: the boss climbs out of the line. */
function atBoss() {
  const g = headlessGame();
  g.start();
  g.wavell.state = 'ground';
  g.score = levelStart(DIFF.lastLevel);
  run(g, 0.2);
  return g;
}
function run(g: G, seconds: number, k = IDLE) {
  for (let i = 0; i < seconds * STEPS_PER_SECOND; i++) g.tick(k);
}
/** Out of the line and in his place, and holding his next power for a while. */
function standing(B: Flattener) {
  B.state = 'idle';
  (B as unknown as { wait: number }).wait = 99;
}
/** Make him use this power now. */
function use(B: Flattener, p: BossPower) {
  standing(B);
  (B as unknown as { begin(p: BossPower): void }).begin(p);
}

const fileRandom = Math.random;
beforeEach(() => {
  Math.random = seeded(5);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('Path2D', class { moveTo() {} lineTo() {} quadraticCurveTo() {} arc() {} closePath() {} rect() {} });
});
afterEach(() => {
  Math.random = fileRandom;
  vi.unstubAllGlobals();
});

describe('the Flattener', () => {
  it('boss.json: every step uses a shape that exists, and every outline starts and ends on the line', () => {
    for (const [name, p] of Object.entries(BOSS.powers)) {
      expect(p.steps.length, name).toBeGreaterThan(0);
      for (const st of p.steps) expect(BOSS.shapes[st.shape], `${name}: ${st.shape}`).toBeDefined();
    }
    for (const [name, sh] of Object.entries(BOSS.shapes)) {
      if (sh.kind !== 'path') continue;
      expect(sh.pts[0][1], name).toBe(0);
      expect(sh.pts[sh.pts.length - 1][1], name).toBe(0);
    }
    expect(Object.values(BOSS.powers).some((p) => p.from <= 1 && p.steps.some((st) => st.fire === 'slam'))).toBe(true);
  });

  it('stands farther ahead of Wavell than before', () => {
    const g = atBoss();
    run(g, 3);
    expect(g.boss!.x - g.wavell.x).toBeGreaterThan(140);
  });

  it('comes at the last level, and nothing else does', () => {
    const g = atBoss();
    expect(g.level).toBe(DIFF.lastLevel);
    expect(g.boss).not.toBeNull();
    run(g, 6, { ...IDLE, right: true });
    expect(g.sinepedes.length + g.worms.length + g.urchins.length + g.backwaves.length).toBe(0);
  });

  it('the end of the line crumbles at the fight speed', () => {
    const g = atBoss();
    run(g, 2);
    const e0 = g.endX;
    run(g, 1);
    expect(g.endX - e0).toBeCloseTo(DIFF.bossEnd, 0);
  });

  it('walks on ahead and stays in view', () => {
    const g = atBoss();
    for (let i = 0; i < 8 * STEPS_PER_SECOND; i++) {
      g.tick({ ...IDLE, right: true });
      const B = g.boss;
      if (!B || !g.wavell.alive) break;
      if (B.away) continue;
      expect(B.front).toBeGreaterThan(g.wavell.x);
      expect(B.back).toBeLessThanOrEqual(g.neon.camX + g.neon.viewW + 12);
    }
  });

  it('keeps his outline on the line, root to root, in every shape', () => {
    const g = atBoss(), B = g.boss!;
    for (const p of ['wave', 'cat', 'saw', 'toad'] as BossPower[]) {
      use(B, p);
      for (let i = 0; i < 8; i++) {
        run(g, 0.1);
        const o = B.outline(g.line), n = o.length;
        expect(o[1]).toBeCloseTo(g.line.sample(o[0]), 3);
        expect(o[n - 1]).toBeCloseTo(g.line.sample(o[n - 2]), 3);
        expect(o.every(Number.isFinite)).toBe(true);
      }
    }
  });

  it('slams the line first, sending a front wave at Wavell', () => {
    const g = atBoss();
    let seen = false;
    for (let i = 0; i < 6 * STEPS_PER_SECOND && !seen; i++) { g.tick(IDLE); seen = g.tidals.length > 0; }
    expect(seen).toBe(true);
    expect(g.tidals[0].dir).toBe(-1);
  });

  it('a front wave sent back takes a size', () => {
    const g = atBoss(), B = g.boss!;
    standing(B);
    g.tidals.push({ x: B.front - 30, dir: 1, amp: 30, done: false, gone: false });
    run(g, 0.4);
    expect(B.hp).toBe(DIFF.bossHits - 1);
  });

  it('a wipe facing the front wave sends it back at him', () => {
    const g = atBoss(), B = g.boss!, W = g.wavell;
    standing(B);
    g.tidals.push({ x: W.x + 120, dir: -1, amp: 30, done: false, gone: false });
    run(g, 0.3);
    run(g, 1 / STEPS_PER_SECOND, WIPE);
    run(g, 0.6);
    expect(W.alive).toBe(true);
    expect(W.size).toBe(0);
    expect(B.hp).toBe(DIFF.bossHits - 1);
  });

  /** The refluxes the cat shoots, in order. */
  function catShots(g: G) {
    const B = g.boss!, seen: { side: number; dist: number }[] = [], known = new Set<object>();
    use(B, 'cat');
    for (let i = 0; i < 8 * STEPS_PER_SECOND; i++) {
      g.wavell.safe = 9;
      g.tick(IDLE);
      for (const r of g.refluxes) if (!known.has(r)) { known.add(r); seen.push({ side: r.side, dist: r.dist }); }
      if (B.state === 'idle') break;
    }
    return seen;
  }

  it('as a cat, shoots three refluxes: low and high over the line, and low under it, in a random order', () => {
    const orders = new Set<string>();
    for (let k = 0; k < 8; k++) {
      Math.random = seeded(10 + k);
      const seen = catShots(atBoss());
      expect(seen.length).toBe(3);
      const key = (r: { side: number; dist: number }) => `${r.side}:${r.dist}`;
      expect(seen.map(key).sort()).toEqual([`-1:${HEIGHT * 0.5}`, `1:${HEIGHT * 0.5}`, `1:${HEIGHT * 1.75}`].sort());
      orders.add(seen.map(key).join(' '));
    }
    expect(orders.size).toBeGreaterThan(2);
  });

  it('the high shot clears Wavell on the line until he is at full size', () => {
    for (const size of [0, 1, 2, 3]) {
      const g = atBoss(), W = g.wavell;
      W.size = size;
      W.scale = 1 + DIFF.growScale * size;
      g.refluxes.push(reflux(W.x - g.neon.camX + 40, -1, 1, W, 0, HEIGHT * 1.75));
      let hit = false;
      for (let i = 0; i < STEPS_PER_SECOND; i++) { g.tick(IDLE); if (W.size < size || !W.alive) hit = true; }
      expect(hit, `size ${size}`).toBe(size >= 3);
    }
  });

  it('a low shot along the top misses Wavell under the line, and one along the bottom misses him on top', () => {
    for (const side of [1, -1] as const) {
      const g = atBoss(), W = g.wavell;
      if (side > 0) { W.side = -1; W.flip = 1; }
      g.refluxes.push(reflux(W.x - g.neon.camX + 40, -1, side, W, 0, HEIGHT * 0.5));
      run(g, 1);
      expect(W.alive).toBe(true);
      expect(W.size).toBe(0);
    }
  });

  it('as a saw, rolls at Wavell, cuts him on the line, and flattens out before the end of the line', () => {
    const g = atBoss(), B = g.boss!, W = g.wavell;
    use(B, 'saw');
    let hurt = false, lowest = Infinity;
    for (let i = 0; i < 4 * STEPS_PER_SECOND; i++) {
      g.tick(IDLE);
      if (!W.alive) hurt = true;
      if (B.sawing) lowest = Math.min(lowest, B.x - B.sawR - g.endX);
    }
    expect(hurt).toBe(true);
    expect(lowest).toBeGreaterThan(30);
  });

  it('a bubble floated high enough clears the saw', () => {
    const g = atBoss(), B = g.boss!, W = g.wavell;
    use(B, 'saw');
    while (!B.away) g.tick(IDLE);
    run(g, 1 / STEPS_PER_SECOND, { ...IDLE, up: true, upPressed: true });
    run(g, 0.7, { ...IDLE, up: true });
    run(g, 1.2);
    expect(W.alive).toBe(true);
    expect(['reform', 'idle']).toContain(B.state);
    expect(B.x).toBeGreaterThan(W.x);
  });

  it('as a toad, sinks and blisters bubbles up along the line, never right under Wavell', () => {
    const g = atBoss(), B = g.boss!, W = g.wavell;
    use(B, 'toad');
    const seen = new Set<object>();
    for (let i = 0; i < (BOSS.powers.toad.steps[1].hold + 1.5) * STEPS_PER_SECOND; i++) {
      g.tick(IDLE);
      for (const b of g.bubbles) {
        if (seen.has(b)) continue;
        seen.add(b);
        expect(b.side).toBe(1);
        expect(Math.abs(b.x - W.x)).toBeGreaterThanOrEqual(18);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('flattened, he gives way to a harder loop from level 1', () => {
    const g = atBoss(), B = g.boss!;
    standing(B);
    B.hp = 1;
    const score = g.score;
    g.tidals.push({ x: B.front - 30, dir: 1, amp: 30, done: false, gone: false });
    run(g, 2);
    expect(g.boss).toBeNull();
    expect(g.score).toBeGreaterThan(score + DIFF.bossWinPoints);
    run(g, 4);
    expect(g.loop).toBe(1);
    expect(g.level).toBe(1);
    expect(g.ramp).toBe(1 + DIFF.loopBoost);
    expect(g.levelLabel).toBe('LOOP 2 · LEVEL 1');
  });
});
