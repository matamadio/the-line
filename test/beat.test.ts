// The beat prototype. Its one promise to the rest of the game: when it is off, nothing
// changes, and when it is on, the beat falls on exact simulation steps.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sfx } from '../src/core/sfx';
import { DIFF, at } from '../src/data/difficulty';
import { BASE_BPM, BeatClock } from '../src/game/beat';
import { IDLE, headlessGame, seeded } from './helpers';

vi.mock('../src/core/sfx', () => ({ sfx: { unlock() {}, play() {}, toggleMute() {}, beat: vi.fn(), call() {}, cancelled() {}, fed() {}, grew() {}, shrank() {}, hum() {}, rumble() {}, crunch() {}, muted: true } }));

describe('the beat clock', () => {
  it('has a beat every 96 steps and a bar every four beats', () => {
    const clock = new BeatClock();
    clock.reset(1);
    const hits: [number, string][] = [];
    for (let i = 0; i < 96 * 8; i++) {
      const hit = clock.step(1);
      if (hit) hits.push([i, hit]);
    }
    expect(hits.slice(0, 5)).toEqual([[0, 'bar'], [96, 'beat'], [192, 'beat'], [288, 'beat'], [384, 'bar']]);
    expect(hits).toHaveLength(8);
  });

  it('changes tempo only at the start of a bar', () => {
    const clock = new BeatClock();
    clock.reset(1);
    clock.step(1);
    for (let i = 1; i < 384; i++) {
      clock.step(5);
      expect(clock.bpm).toBe(at('bpm', 1));
    }
    clock.step(5);
    expect(clock.bpm).toBe(at('bpm', 5));
  });

  it('runs the world at normal speed at the base tempo, and faster above it', () => {
    const clock = new BeatClock();
    clock.bpm = BASE_BPM;
    expect(clock.speed).toBe(1);
    clock.bpm = BASE_BPM * 1.5;
    expect(clock.speed).toBe(1.5);
  });
});

describe('the beat in the game', () => {
  const nativeRandom = Math.random;
  const play = (steps: number) => {
    Math.random = seeded(5);
    const g = headlessGame();
    g.start();
    for (let i = 0; i < steps; i++) g.tick(IDLE);
    return g;
  };

  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('Path2D', class { moveTo() {} lineTo() {} quadraticCurveTo() {} arc() {} closePath() {} });
    vi.mocked(sfx.beat).mockClear();
  });
  afterEach(() => {
    DIFF.beatOn = 0;
    Math.random = nativeRandom;
    vi.unstubAllGlobals();
  });

  it('can be turned off', () => {
    DIFF.beatOn = 0;
    play(500);
    expect(sfx.beat).not.toHaveBeenCalled();
  });

  it('rises by 2 BPM per level', () => {
    expect(at('bpm', 2) - at('bpm', 1)).toBe(2);
  });

  it.each([
    [1, [3]], [3, [3]], [5, [3]],
    [6, [1, 3]], [9, [1, 3]], [30, [1, 3]],
  ])('at level %i lets enemies in on beats %j (counted from 0)', (level, beats) => {
    const clock = new BeatClock();
    expect([0, 1, 2, 3].filter((b) => clock.cueAt(b, level))).toEqual(beats);
  });

  it.each([1, 5, 6, 9])('at level %i, enemies and their sounds only come on the beat', (level) => {
    DIFF.beatOn = 1;
    Math.random = seeded(11 + level);
    const g = headlessGame();
    g.start();
    const seen = new Set<object>();
    const beatsSeen = new Set<number>();
    const perBar = new Map<number, number>();
    const kinds = new Set<string>();
    let spawned = 0, sounded = 0;
    for (let i = 0; i < 60000; i++) {
      g.level = level;
      g.lives = 9;
      g.wavell.safe = 9;
      g.tick({ ...IDLE, right: true });
      const onBeat = i % 96 === 0, beat = Math.floor(i / 96) % 4;
      let fresh = 0;
      for (const e of [...g.sinepedes, ...g.urchins, ...g.worms, ...g.bubbles, ...g.backwaves, ...g.refluxes]) {
        if (!seen.has(e)) { seen.add(e); fresh++; kinds.add(e.constructor.name + ('warn' in e && !('reach' in e) ? 'wave' : '')); }
      }
      if (fresh) {
        expect(onBeat).toBe(true);
        expect(fresh).toBe(1);
        expect(g.beat.cueAt(beat, level)).toBe(true);
        spawned++;
        beatsSeen.add(beat);
        const bar = Math.floor(i / 384);
        perBar.set(bar, (perBar.get(bar) ?? 0) + 1);
        expect(perBar.get(bar)).toBeLessThanOrEqual(level >= DIFF.cueTwoFrom ? 2 : 1);
      }
      for (const u of g.urchins) if (u.justOpened) { expect(onBeat).toBe(true); sounded++; }
      // Only touching one in the air sets it off between beats.
      for (const b of g.bubbles) if (b.justDetached || (b.justBurst && Math.abs(b.x - g.wavell.x) > 40)) { expect(onBeat).toBe(true); sounded++; }
    }
    expect(spawned).toBeGreaterThan(5);
    expect(sounded).toBeGreaterThan(0);
    expect(beatsSeen.size).toBeGreaterThan(0);
    // No one kind takes all the beats.
    expect(kinds.size).toBeGreaterThanOrEqual(3);
  });

  it('clicks once per beat when on, accenting each bar', () => {
    DIFF.beatOn = 1;
    play(96 * 4 + 1);
    expect(vi.mocked(sfx.beat).mock.calls.map((c) => c[1])).toEqual([true, false, false, false, true]);
  });

  it('stays exact when on', () => {
    DIFF.beatOn = 1;
    const a = play(5000), b = play(5000);
    expect([a.wavell.x, a.endX, a.line.sample(a.wavell.x + 50)]).toEqual([b.wavell.x, b.endX, b.line.sample(b.wavell.x + 50)]);
  });
});
