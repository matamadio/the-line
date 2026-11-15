// THE FLATTENER, the level 10 boss, played through the real game with scripted keys.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DIFF, levelStart } from '../src/data/difficulty';
import { Flattener, type BossPower } from '../src/game/actors/flattener';
import { END_WORD } from '../src/game/endWord';
import { strokeWord } from '../src/game/lettering';
import { BOSS } from '../src/data/boss';
import { HEIGHT } from '../src/game/actors/wavell';
import { reflux } from '../src/game/game';
import { IDLE, headlessGame, seeded } from './helpers';

vi.mock('../src/core/sfx', () => ({ sfx: { unlock() {}, play() {}, toggleMute() {}, restartMusic() {}, setNostalgia() {}, preview() {}, endPreview() {}, ready: true, cycleStyle() {}, beat() {}, call() {}, cancelled() {}, fed() {}, grew() {}, shrank() {}, hum() {}, rumble() {}, tideRise() { return () => {}; }, tideCrash() {}, crunch() {}, slam() {}, sentBack() {}, bossHit() {}, meow() {}, whirr() {}, croak() {}, orcaCall() {}, has() { return false; }, muted: true } }));

DIFF.beatOn = 0;

const STEPS_PER_SECOND = 120;
const WIPE = { ...IDLE, dragPressed: true };
type G = ReturnType<typeof headlessGame>;
/** The Flattener with his insides open, for tests of his moves. */
type Open = { pts: Float32Array; state: string; shapeName: string; buildTime: number; begin(p: string, r: () => number): void; update(dt: number, onBeat: boolean, active: boolean): void };

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
    for (const p of ['tideAl', 'cat', 'saw', 'toad'] as BossPower[]) {
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

  it('after him, the music keeps every layer, no banner shows, and THE LINE CONTINUES goes by on the line behind', () => {
    const g = atBoss(), B = g.boss!;
    standing(B);
    B.hp = 1;
    g.tidals.push({ x: B.front - 30, dir: 1, amp: 30, done: false, gone: false });
    run(g, 6);
    expect(g.loop).toBe(1);
    expect(g.musicLayers).toBe(5);
    expect(g.banner).toBe(0);
    expect(g.bannerText).not.toBe('FLATTENED!');
    expect(g.endWord).toBeGreaterThan(0);
    run(g, 60);
    expect(g.endWord).toBe(-1);
  });

  it('climbs out with the screen shaking, and no title', () => {
    const g = atBoss();
    expect(g.boss).not.toBeNull();
    expect(g.bannerText).not.toBe('THE FLATTENER');
  });

  it('the cat rolls over to under the line and back without ever going flat', () => {
    const B = new Flattener(0) as unknown as Open;
    for (let i = 0; i < 300; i++) B.update(1 / 120, false, false);
    B.begin('cat', seeded(3));
    let lowest = Infinity, under = false;
    for (let i = 0; i < 120 * 8 && B.state === 'power'; i++) {
      B.update(1 / 120, i % 48 === 0, true);
      let hi = 0;
      for (let j = 1; j < B.pts.length; j += 2) hi = Math.max(hi, Math.abs(B.pts[j]));
      lowest = Math.min(lowest, hi);
      if (B.shapeName === 'catCrouch' && B.pts[41] < 0) under = true;
    }
    expect(under).toBe(true);
    expect(lowest).toBeGreaterThan(5);
  });

  it('Tide-Al builds up through its shapes, with the time left until it crashes', () => {
    const B = new Flattener(0) as unknown as Open;
    for (let i = 0; i < 300; i++) B.update(1 / 120, false, false);
    B.begin('tideAl', Math.random);
    const steps = BOSS.powers.tideAl.steps, slam = steps.findIndex((s) => s.fire === 'slam');
    const total = steps.slice(0, slam + 1).reduce((a, s) => a + s.morph + s.hold, 0);
    expect(B.buildTime).toBeCloseTo(total, 5);
    const seen: string[] = [];
    for (let i = 0; i < 120 * 4 && B.state === 'power'; i++) {
      if (seen[seen.length - 1] !== B.shapeName) seen.push(B.shapeName);
      B.update(1 / 120, i % 96 === 0, true);
    }
    expect(seen.slice(0, 4)).toEqual(['wave', 'lean', 'crash', 'splash']);
  });

  it('the cat charges its shot only once it has reached its pose', () => {
    const B = new Flattener(0) as unknown as Open & { step: { fire: string; morph: number } | null; t: number; chargingShot: boolean; shotCharge: number };
    for (let i = 0; i < 300; i++) B.update(1 / 120, false, false);
    B.begin('cat', Math.random);
    let checked = 0;
    for (let i = 1; i < 120 * 6 && B.state === 'power'; i++) {
      B.update(1 / 120, i % 96 === 0, true);
      const s = B.step;
      if (s?.fire !== 'shoot') continue;
      if (B.t < s.morph) expect(B.chargingShot).toBe(false);
      else { expect(B.chargingShot).toBe(true); checked++; }
      expect(B.shotCharge).toBeGreaterThanOrEqual(0);
      expect(B.shotCharge).toBeLessThanOrEqual(1);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('Tide-Al leans over on a beat and crashes down as its steps say', () => {
    const B = new Flattener(0) as unknown as Open & { events: string[] };
    for (let i = 0; i < 300; i++) B.update(1 / 120, false, false);
    B.events.length = 0;
    B.begin('tideAl', Math.random);
    let leanAt = -1, slamAt = -1;
    for (let i = 1; i < 120 * 6 && slamAt < 0; i++) {
      B.update(1 / 120, i % 96 === 0, true);
      if (leanAt < 0 && B.shapeName === 'lean') leanAt = i;
      if (B.events.includes('slam')) slamAt = i;
      B.events.length = 0;
    }
    expect(leanAt % 96).toBe(0);
    const steps = BOSS.powers.tideAl.steps, from = steps.findIndex((s) => s.shape === 'lean');
    const slam = steps.findIndex((s) => s.fire === 'slam');
    if (steps.slice(from + 1, slam + 1).some((s) => s.beat)) expect((slamAt - leanAt) % 96).toBe(0);
    else {
      const ticks = steps.slice(from, slam + 1).reduce((a, s) => a + s.morph + s.hold, 0) * 120;
      expect(Math.abs(slamAt - leanAt - ticks)).toBeLessThanOrEqual(4);
    }
  });

  it('after him, the next loop picks another time signature at random, from the next bar', () => {
    const picked = new Set<string>();
    for (let k = 0; k < 8; k++) {
      const g = atBoss(), B = g.boss!, was = g.beat.meter.id;
      standing(B);
      B.hp = 1;
      g.tidals.push({ x: B.front - 30, dir: 1, amp: 30, done: false, gone: false });
      run(g, 6);
      expect(g.loop).toBe(1);
      const next = (g.beat as unknown as { nextMeter: { id: string } | null }).nextMeter;
      expect(next).not.toBeNull();
      expect(next!.id).not.toBe(was);
      picked.add(next!.id);
    }
    expect(picked.size).toBeGreaterThan(1);
  });

  it('THE LINE CONTINUES can be written in one stroke', () => {
    expect(strokeWord(END_WORD).width).toBeGreaterThan(1000);
  });

  it('never uses a power twice in a row, and sends the front wave after 2, 3, then 4 others as he shrinks', () => {
    const hurts = (p: string) => BOSS.powers[p].steps.some((s) => s.fire === 'slam');
    for (let seed = 1; seed <= 12; seed++) {
      const rand = seeded(seed);
      for (const hp of [3, 2, 1]) {
        const B = new Flattener(0) as unknown as { hp: number; waveGap: number; choose(r: () => number): string; begin(p: string, r: () => number): void };
        B.hp = hp;
        const picks: string[] = [];
        for (let i = 0; i < 30; i++) { const p = B.choose(rand); picks.push(p); B.begin(p, rand); }
        for (let i = 1; i < picks.length; i++) expect(picks[i]).not.toBe(picks[i - 1]);
        const waves = picks.map((p, i) => (hurts(p) ? i : -1)).filter((i) => i >= 0);
        expect(waves[0]).toBe(0);
        for (let i = 1; i < waves.length; i++) expect(waves[i] - waves[i - 1] - 1).toBe(B.waveGap);
        expect(B.waveGap).toBe(5 - hp);
      }
    }
  });
});
