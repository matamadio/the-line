// The beat prototype. Its one promise to the rest of the game: when it is off, nothing
// changes, and when it is on, the beat falls on exact simulation steps.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sfx } from '../src/core/sfx';
import { DIFF, at } from '../src/data/difficulty';
import { LAYERS, METERS, groupStarts, meterById } from '../src/core/music';
import { BASE_BPM, BeatClock } from '../src/game/beat';
import { HERALD_STEPS } from '../src/game/game';
import { IDLE, headlessGame, seeded } from './helpers';

vi.mock('../src/core/sfx', () => ({ sfx: { unlock() {}, play() {}, toggleMute() {}, restartMusic: vi.fn(), setNostalgia() {}, preview() {}, endPreview() {}, ready: true, cycleStyle() {}, beat: vi.fn(), call() {}, cancelled() {}, fed() {}, grew() {}, shrank() {}, hum: vi.fn(), rumble() {}, crunch() {}, slam() {}, sentBack() {}, bossHit() {}, meow() {}, whirr() {}, croak() {}, muted: true } }));

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

  /** A start screen with its music going: he has risen, and a couple of beats have played. */
  const titleWithMusic = () => {
    DIFF.beatOn = 1;
    Math.random = seeded(5);
    const g = headlessGame();
    for (let i = 0; i < 600 && g.wavell.state === 'appear'; i++) g.tick(IDLE);
    for (let i = 0; i < 250; i++) g.tick(IDLE);
    return g;
  };
  const layersPlayed = () => vi.mocked(sfx.beat).mock.calls.map((c) => c[3]);

  it('plays all five layers on the start screen, only once he has risen', () => {
    DIFF.beatOn = 1;
    Math.random = seeded(5);
    const g = headlessGame();
    g.tick(IDLE);
    expect(g.wavell.state).toBe('appear');
    expect(sfx.beat).not.toHaveBeenCalled();
    vi.mocked(sfx.beat).mockClear();
    const t = titleWithMusic();
    expect(t.mode).toBe('title');
    expect(layersPlayed().length).toBeGreaterThan(1);
    expect(new Set(layersPlayed())).toEqual(new Set([LAYERS]));
  });

  it('carries the start screen music on into a game, thinning to level 1', () => {
    const g = titleWithMusic();
    const restarts = vi.mocked(sfx.restartMusic).mock.calls.length;
    const beatBefore = g.beat.beatOfBar;
    vi.mocked(sfx.beat).mockClear();
    g.start();
    for (let i = 0; i < 96 * 8; i++) g.tick(IDLE);
    // No restart: the same beat goes on, one beat every 96 steps, at level 1's one layer.
    expect(vi.mocked(sfx.restartMusic).mock.calls.length).toBe(restarts);
    expect(layersPlayed()).toEqual(Array(8).fill(1));
    expect(vi.mocked(sfx.beat).mock.calls[0][1]).toBe((beatBefore + 1) % g.beat.beats);
  });

  it('never plays the start screen music on top of a game started from the menu', () => {
    // START is picked while the menu steps, inside the start screen's own update.
    const g = titleWithMusic();
    const step = g.menu.step.bind(g.menu);
    let picked = false;
    g.menu.step = (dt: number) => { step(dt); if (!picked) { picked = true; g.startFromMenu(); } };
    vi.mocked(sfx.beat).mockClear();
    for (let i = 0; i < 96 * 8; i++) g.tick(IDLE);
    expect(g.mode).toBe('play');
    expect(layersPlayed()).toEqual(Array(8).fill(1));
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

  it.each([1, 6])('at level %i, a Sinepede is heard two beats before it comes in, on a beat it may take', (level) => {
    DIFF.beatOn = 1;
    Math.random = seeded(5 + level);
    const g = headlessGame();
    g.start();
    const hum = vi.mocked(sfx.hum);
    let calledAt = -1, checked = 0;
    for (let i = 0; i < 40000 && checked < 3; i++) {
      g.level = level;
      g.lives = 9;
      g.wavell.safe = 9;
      const before = g.sinepedes.length;
      g.tick({ ...IDLE, right: true });
      if (g.herald && calledAt < 0) {
        calledAt = i;
        expect(i % 96).toBe(0);
        // Heard from the start, at its pitch: its number of segments.
        hum.mockClear();
        (g as unknown as { hum(): void }).hum();
        expect(hum).toHaveBeenLastCalledWith(g.herald.count, expect.any(Number));
      }
      if (calledAt >= 0 && i === calledAt + HERALD_STEPS / 2) {
        // Halfway there, it is already heard.
        hum.mockClear();
        (g as unknown as { hum(): void }).hum();
        expect(hum.mock.lastCall![1]).toBeGreaterThan(0);
      }
      if (g.sinepedes.length > before) {
        expect(i - calledAt).toBe(HERALD_STEPS);
        expect(g.beat.cueAt(Math.floor(i / 96) % 4, level)).toBe(true);
        calledAt = -1;
        checked++;
      }
    }
    expect(checked).toBe(3);
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

describe('the music building up', () => {
  it('gives every style five layers, each of them its own part', async () => {
    const { STYLES } = await import('../src/core/styles');
    const { LAYERS, METERS, groupStarts } = await import('../src/core/music');
    for (const style of STYLES) {
      expect(style.layers).toHaveLength(LAYERS);
      expect(new Set(style.layers.map((l) => l.name)).size).toBe(LAYERS);
      // Every layer makes sound within 16 bars, in every time signature: none is silent.
      for (const layer of style.layers) for (const meter of METERS) {
        let notes = 0;
        const count = () => { notes++; };
        const synth = { kick: count, snare: count, hat: count, block: count, tone: count, keys: count, pad: count, pluck: count, strum: count, flute: count, fiddle: count, bass: count, taiko: count, acid: count, theremin: count };
        const starts = groupStarts(meter);
        for (let bar = 0; bar < 16; bar++) for (let beat = 0; beat < meter.beats; beat++) {
          layer.play(synth as never, { at: 0, len: 0.8, beat, bar, meter, layers: LAYERS, group: starts.includes(beat), groupEnd: starts.includes(beat + 1) || beat === meter.beats - 1, t: (k) => k * 0.2 });
        }
        expect(notes, `${style.id} / ${layer.name} / ${meter.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('adds one layer per level, all five from level 5', () => {
    const g = headlessGame();
    const layers = [1, 2, 3, 4, 5, 6, 10].map((level) => { g.level = level; return g.musicLayers; });
    expect(layers).toEqual([1, 2, 3, 4, 5, 5, 5]);
  });
});
