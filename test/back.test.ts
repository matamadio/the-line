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

/** One frame with these presses, as the input would report them, and then let go. */
const press = (g: ReturnType<typeof headlessGame>, keys: Record<string, boolean>) => {
  Object.assign(g.input, keys);
  g.frame(1 / 60);
  for (const k of Object.keys(keys)) (g.input as unknown as Record<string, boolean>)[k] = false;
};

describe('the top-right buttons from the pause', () => {
  it('→ reaches the speaker and A opens the audio menu, without carrying on', () => {
    const g = headlessGame();
    g.start();
    g.setPaused(true);
    press(g, { menuRight: true });
    expect(g.corner).toBe('audio');
    press(g, { confirm: true, pausePressed: true }); // Enter is the pause key too
    expect(g.audio.open).toBe(true);
    expect(g.paused).toBe(true);
  });

  it('Back leaves the buttons rather than the game, and Start carries on from them', () => {
    const g = headlessGame();
    g.start();
    g.setPaused(true);
    press(g, { menuRight: true });
    back(g);
    expect(g.corner).toBe(null);
    expect(g.mode).toBe('play');
    press(g, { menuRight: true });
    press(g, { pausePressed: true });
    expect(g.paused).toBe(false);
    expect(g.corner).toBe(null);
  });

  it('in a game, → walks: the buttons are only for the pause', () => {
    const g = headlessGame();
    g.start();
    press(g, { menuRight: true });
    expect(g.corner).toBe(null);
  });
});
