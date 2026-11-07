// The beat prototype. Its one promise to the rest of the game: when it is off, nothing
// changes, and when it is on, the beat falls on exact simulation steps.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sfx } from '../src/core/sfx';
import { DIFF, at } from '../src/data/difficulty';
import { METERS, groupStarts, meterById } from '../src/core/music';
import { BASE_BPM, BeatClock } from '../src/game/beat';
import { IDLE, headlessGame, seeded } from './helpers';

vi.mock('../src/core/sfx', () => ({ sfx: { unlock() {}, play() {}, toggleMute() {}, restartMusic() {}, setNostalgia() {}, preview() {}, cycleStyle() {}, beat: vi.fn(), call() {}, cancelled() {}, fed() {}, grew() {}, shrank() {}, hum() {}, rumble() {}, crunch() {}, muted: true } }));

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

  it('counts the bar in the time signature it is given', () => {
    const clock = new BeatClock();
    clock.reset(1, meterById('7/8'));
    const bars: number[] = [];
    for (let i = 0; i < 96 * 15; i++) if (clock.step(1) === 'bar') bars.push(i);
    expect(bars).toEqual([0, 96 * 7, 96 * 14]);
  });

  it('changes time signature only at the start of a bar', () => {
    const clock = new BeatClock();
    clock.reset(1);
    for (let i = 0; i < 96 * 2; i++) clock.step(1);
    clock.setMeter(meterById('3/4'));
    expect(clock.beats).toBe(4);
    const bars: number[] = [];
    for (let i = 96 * 2; i < 96 * 10; i++) if (clock.step(1) === 'bar') bars.push(i);
    // The 4/4 bar finishes, then the bars are three beats long.
    expect(bars).toEqual([96 * 4, 96 * 7]);
    expect(clock.beats).toBe(3);
  });

  it.each([
    ['2/4', [1], [0, 1]], ['3/4', [2], [1, 2]], ['4/4', [3], [1, 3]],
    ['5/4', [4], [2, 4]], ['6/8', [5], [2, 5]], ['7/8', [6], [3, 6]],
  ])('in %s lets enemies in on beats %j, then %j (counted from 0)', (id, early, late) => {
    const clock = new BeatClock();
    clock.reset(1, meterById(id));
    const beats = [...Array(clock.beats).keys()];
    expect(beats.filter((b) => clock.cueAt(b, 1))).toEqual(early);
    expect(beats.filter((b) => clock.cueAt(b, DIFF.cueTwoFrom))).toEqual(late);
  });

  it('groups every time signature into its beats', () => {
    for (const m of METERS) expect(m.groups.reduce((a, b) => a + b)).toBe(m.beats);
    expect(groupStarts(meterById('7/8'))).toEqual([0, 2, 4]);
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

  it('plays the music once per beat when on, saying which beat of the bar', () => {
    DIFF.beatOn = 1;
    play(96 * 4 + 1);
    expect(vi.mocked(sfx.beat).mock.calls.map((c) => c[1])).toEqual([0, 1, 2, 3, 0]);
  });

  it('stays exact when on', () => {
    DIFF.beatOn = 1;
    const a = play(5000), b = play(5000);
    expect([a.wavell.x, a.endX, a.line.sample(a.wavell.x + 50)]).toEqual([b.wavell.x, b.endX, b.line.sample(b.wavell.x + 50)]);
  });
});

describe('the music styles', () => {
  it('keeps every note of a style with a scale on that scale', async () => {
    const { onScale } = await vi.importActual<typeof import('../src/core/sfx')>('../src/core/sfx');
    const { STYLES } = await import('../src/core/styles');
    const lotus = STYLES.find((s) => s.id === 'lotus')!;
    for (let f = 200; f < 2000; f *= 1.013) {
      const n = Math.round(12 * Math.log2(onScale(f, lotus.scale) / 440));
      expect(lotus.scale).toContain(((n % 12) + 12) % 12);
    }
    expect(onScale(440, lotus.scale)).toBeCloseTo(440);
    expect(onScale(555, undefined)).toBe(555);
  });
});
