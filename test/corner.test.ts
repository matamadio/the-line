// The buttons at the top right, reached with a joypad or the arrow keys from the start screen.

import { describe, expect, it } from 'vitest';
import { cornerMove } from '../src/game/hud';

describe('the top-right buttons by d-pad', () => {
  it('right from the line reaches the speaker, and left walks back to the line', () => {
    expect(cornerMove(null, 'right', true)).toBe('audio');
    expect(cornerMove('audio', 'left', true)).toBe('nostalgia');
    expect(cornerMove('nostalgia', 'left', true)).toBe(null);
    expect(cornerMove('nostalgia', 'right', true)).toBe('audio');
  });

  it('up, down and left on the line stay with the line', () => {
    for (const d of ['left', 'up', 'down'] as const) expect(cornerMove(null, d, true)).toBe(null);
  });

  it('fullscreen is under the speaker, where the screen can go fullscreen', () => {
    expect(cornerMove('audio', 'down', true)).toBe('fullscreen');
    expect(cornerMove('audio', 'down', false)).toBe('audio');
    expect(cornerMove('fullscreen', 'up', true)).toBe('audio');
    expect(cornerMove('fullscreen', 'left', true)).toBe('nostalgia');
    expect(cornerMove('fullscreen', 'down', true)).toBe('fullscreen');
  });
});
