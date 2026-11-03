// The lab's scenes: a setup plus a script of key presses. To look at a new situation
// slowly, add an entry here; it shows up in the lab's list. Free play stays last.

import { BubbleBurst } from '../../game/actors/bubble';
import { Snawave } from '../../game/actors/snawave';
import { Worm } from '../../game/actors/worm';
import type { Game } from '../../game/game';

export type Held = 'left' | 'right' | 'up' | 'down';
export type Tap = 'upPressed' | 'downPressed' | 'dragPressed' | 'pullPressed';
/** [key, from, to]: a held key from..to seconds, or a tap at from. */
type Key = [Held, number, number] | [Tap, number];

interface Scene {
  name: string;
  /** Seconds. */
  dur: number;
  keys?: Key[];
  /** Let the end of the line crumble in (otherwise it is held back). */
  end?: boolean;
  setup?(g: Game): void;
}

/** Wavell on the line, ready to go: skips his appearing unless asked. */
const ready = (g: Game, under = false) => {
  const W = g.wavell;
  W.state = 'ground';
  W.t = 0;
  if (under) { W.side = -1; W.flip = 1; }
};
const ahead = (g: Game, d: number) => g.wavell.x + d;

export const SCENES: Scene[] = [
  { name: 'Appear', dur: 1.4 },
  { name: 'Walk', dur: 2.5, keys: [['right', 0.1, 2.2]], setup: (g) => ready(g) },
  { name: 'Wipe', dur: 1.6, keys: [['dragPressed', 0.2]], setup: (g) => ready(g) },
  { name: 'Pull', dur: 1.6, keys: [['pullPressed', 0.2]], setup: (g) => ready(g) },
  { name: 'Flip under and back', dur: 2.2, keys: [['downPressed', 0.2], ['upPressed', 1.2]], setup: (g) => ready(g) },
  { name: 'Float and land', dur: 3, keys: [['upPressed', 0.2], ['up', 0.4, 0.9], ['down', 1.6, 2.8]], setup: (g) => ready(g) },
  {
    name: 'Snawave: pulled flat', dur: 2, keys: [['pullPressed', 0.35]],
    setup: (g) => { ready(g); const s = new Snawave(ahead(g, 110)); s.state = 'move'; g.snawaves.push(s); },
  },
  {
    name: 'Snawave: wiped (wrong attack)', dur: 2, keys: [['dragPressed', 0.35]],
    setup: (g) => { ready(g); const s = new Snawave(ahead(g, 110)); s.state = 'move'; g.snawaves.push(s); },
  },
  {
    name: 'Snawave: bite', dur: 2,
    setup: (g) => { ready(g); const s = new Snawave(ahead(g, 70)); s.state = 'move'; g.snawaves.push(s); },
  },
  {
    name: 'Worm: wiped flat from on top', dur: 2, keys: [['dragPressed', 0.35]],
    setup: (g) => { ready(g); const w = new Worm(ahead(g, 110)); w.state = 'move'; g.worms.push(w); },
  },
  {
    name: 'Cancel: under a Snawave', dur: 2,
    setup: (g) => { ready(g, true); const s = new Snawave(ahead(g, 100)); s.state = 'move'; g.snawaves.push(s); },
  },
  {
    name: 'Cancel: over a Worm', dur: 2.2,
    setup: (g) => { ready(g); const w = new Worm(ahead(g, 90)); w.state = 'move'; g.worms.push(w); },
  },
  {
    name: 'Bubble Burst: dizzy', dur: 3.5, keys: [['right', 1.6, 3.4]],
    setup: (g) => { ready(g); g.bubbles.push(new BubbleBurst(ahead(g, 14), 1, 0.8)); },
  },
  {
    name: 'Backwave: hit', dur: 2.2,
    setup: (g) => { ready(g); g.backwaves.push({ x: g.neon.camX - 10, dir: 1, warn: 0.4, done: false }); },
  },
  {
    name: 'Burn at the end of the line', dur: 2.2, end: true,
    setup: (g) => { ready(g); g.endX = g.wavell.x - 6; },
  },
  { name: 'Free play (your keys are recorded)', dur: 0, setup: (g) => ready(g) },
];
export const FREE = SCENES.length - 1;
