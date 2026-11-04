// The beat prototype. Its one promise to the rest of the game: when it is off, nothing
// changes, and when it is on, the beat falls on exact simulation steps.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sfx } from '../src/core/sfx';
import { DIFF, at } from '../src/data/difficulty';
import { BASE_BPM, BeatClock } from '../src/game/beat';
import { IDLE, headlessGame, seeded } from './helpers';

vi.mock('../src/core/sfx', () => ({ sfx: { unlock() {}, play() {}, toggleMute() {}, setMusicAllowed() {}, beat: vi.fn(), muted: true } }));

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

  it('is off by default', () => {
    expect(DIFF.beatOn).toBe(0);
    play(500);
    expect(sfx.beat).not.toHaveBeenCalled();
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
