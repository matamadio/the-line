// A headless game: the real simulation with a stand-in for the canvas, so tests can
// play thousands of steps without a browser.

import type { Input } from '../src/core/input';
import type { Neon } from '../src/core/neon';
import { Game } from '../src/game/game';

export const IDLE = { left: false, right: false, up: false, down: false, upPressed: false, downPressed: false, dragPressed: false, pullPressed: false };

/** Mulberry32: the same seed always gives the same numbers. */
export function seeded(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What the simulation reads of the view: a 320x200 landscape screen. */
function fakeNeon() {
  return { w: 320, h: 200, unit: 1, zoom: 1, camX: 0, lineY: 124, shake: 0, viewW: 320, focus: 0.42, viewTop: -124, viewBottom: 76 } as unknown as Neon;
}

function fakeInput() {
  return { onKey: new Map(), uiTap: null, touchUsed: false, poll() {}, anyPressed: false, ...IDLE } as unknown as Input;
}

export function headlessGame() {
  return new Game(fakeNeon(), fakeInput());
}
