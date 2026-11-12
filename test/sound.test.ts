// The sounds' tuning, without a browser: only what can be worked out from the numbers.

import { describe, expect, it } from 'vitest';
import { humPitch } from '../src/core/sfx';

describe("the Sinepede's hum", () => {
  it('is 220 Hz for one segment, and 110 Hz more for each one after', () => {
    expect([1, 2, 3, 4, 5, 8].map(humPitch)).toEqual([220, 330, 440, 550, 660, 990]);
  });

  it('never goes below one segment', () => {
    expect(humPitch(0)).toBe(220);
  });
});
