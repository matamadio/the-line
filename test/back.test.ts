// What Back does in a game: the LG remote's Back, and B in the Android TV app.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { headlessGame } from './helpers';

// Only the rules here, not the drawing.
vi.mock('../src/game/render', () => ({ drawGame: () => {} }));
// And no audio: every sound is a no-op.
vi.mock('../src/core/sfx', () => ({
  sfx: new Proxy({}, { get: (_, k) => k === 'muted' || k === 'ready' ? true : k === 'has' ? () => false : () => () => {} }),
}));

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('Path2D', class { moveTo() {} lineTo() {} quadraticCurveTo() {} arc() {} closePath() {} rect() {} });
});

const back = (g: ReturnType<typeof headlessGame>) => { g.input.onKey.get('BrowserBack')!(); g.frame(1 / 60); };

describe('Back in a game', () => {
  it('on a TV remote pauses first, and leaves from the pause', () => {
    const g = headlessGame();
    g.start();
    back(g);
    expect(g.paused).toBe(true);
    back(g);
    expect(g.mode).not.toBe('play');
  });

  it('with the joypad app (B) only leaves from the pause, as Start pauses', () => {
    const g = headlessGame();
    (g.input as { padOnly: boolean }).padOnly = true;
    g.start();
    back(g);
    expect(g.paused).toBe(false);
    expect(g.mode).toBe('play');
    g.setPaused(true);
    back(g);
    expect(g.mode).not.toBe('play');
  });
});
