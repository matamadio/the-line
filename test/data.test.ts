// The editors write these files, so the checks here catch a bad save or a bad merge
// before it reaches a player.

import { describe, expect, it } from 'vitest';
import { ANIM, JOINTS } from '../src/data/anim';
import { DIFF, DIFF_KNOBS, RAMPS, at } from '../src/data/difficulty';
import saved from '../src/data/difficulty.json';
import { KNOBS } from '../src/data/tune';

describe('difficulty.json', () => {
  it('holds only known knobs, each within its slider range', () => {
    for (const [key, value] of Object.entries(saved)) {
      const knob = DIFF_KNOBS[key as keyof typeof DIFF_KNOBS];
      expect(knob, `unknown knob ${key}`).toBeDefined();
      expect(value, key).toBeGreaterThanOrEqual(knob.min);
      expect(value, key).toBeLessThanOrEqual(knob.max);
    }
  });
});

describe('ramps', () => {
  it('start at the level 1 value', () => {
    for (const r of RAMPS) {
      const cap = DIFF[`${r}Cap` as keyof typeof DIFF];
      expect(at(r, 1), r).toBe(DIFF[`${r}Per` as keyof typeof DIFF] < 0 ? Math.max(cap, DIFF[r]) : Math.min(cap, DIFF[r]));
    }
  });

  it('never go past their limit', () => {
    for (const r of RAMPS) {
      const going = DIFF[`${r}Per` as keyof typeof DIFF], cap = DIFF[`${r}Cap` as keyof typeof DIFF];
      const far = at(r, 500);
      if (going < 0) expect(far, r).toBeGreaterThanOrEqual(cap);
      else expect(far, r).toBeLessThanOrEqual(cap);
    }
  });
});

describe('tune.ts', () => {
  it('has defaults inside the slider ranges', () => {
    for (const [key, k] of Object.entries(KNOBS)) {
      expect(k.def, key).toBeGreaterThanOrEqual(k.min);
      expect(k.def, key).toBeLessThanOrEqual(k.max);
    }
  });
});

describe('anim.json', () => {
  it('has every joint in every pose', () => {
    for (const [name, pose] of Object.entries(ANIM.poses)) {
      for (const j of JOINTS) expect(pose[j], `${name}.${j}`).toHaveLength(2);
      expect(typeof pose.tilt, name).toBe('number');
    }
  });

  it('has clips with keys in time order and known poses', () => {
    for (const [name, clip] of Object.entries(ANIM.clips)) {
      const times = clip.keys.map((k) => k.t);
      expect(times, name).toEqual([...times].sort((a, b) => a - b));
      for (const k of clip.keys) {
        if (typeof k.pose !== 'string' || k.pose.startsWith('@')) continue;
        expect(ANIM.poses[k.pose], `${name} uses pose ${k.pose}`).toBeDefined();
      }
    }
  });

  it('has motions with keys in time order and marks inside them', () => {
    for (const [name, motion] of Object.entries(ANIM.motions)) {
      const times = motion.keys.map((k) => k.t);
      expect(times, name).toEqual([...times].sort((a, b) => a - b));
      for (const [mark, t] of Object.entries(motion.marks ?? {})) {
        expect(t, `${name} mark ${mark}`).toBeLessThanOrEqual(times[times.length - 1]);
      }
    }
  });
});
