// The lab's scenes: a setup plus a script of key presses. To look at a new situation
// slowly, add an entry here; it shows up in the lab's list. Free play stays last.

import { BubbleBurst } from '../../game/actors/bubble';
import { Sinepede } from '../../game/actors/sinepede';
import { Urchin } from '../../game/actors/urchin';
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
    name: 'Sinepede: crest pulled flat', dur: 2, keys: [['pullPressed', 0.35]],
    setup: (g) => { ready(g); g.sinepedes.push(new Sinepede(ahead(g, 110), 100, 1, 1)); },
  },
  {
    name: 'Sinepede: crest wiped (wrong attack)', dur: 2, keys: [['dragPressed', 0.35]],
    setup: (g) => { ready(g); g.sinepedes.push(new Sinepede(ahead(g, 110), 100, 1, 1)); },
  },
  {
    name: 'Sinepede: five segments, in rhythm', dur: 4.5,
    keys: [['pullPressed', 0.3], ['dragPressed', 1], ['pullPressed', 1.7], ['dragPressed', 2.4], ['pullPressed', 3.1]],
    setup: (g) => { ready(g); g.sinepedes.push(new Sinepede(ahead(g, 60), 18, 5, 1)); },
  },
  {
    name: 'Sinepede: touches him', dur: 2,
    setup: (g) => { ready(g); g.sinepedes.push(new Sinepede(ahead(g, 70), 100, 1, 1)); },
  },
  {
    name: 'Sea Urchin: wait it out', dur: 2.6,
    setup: (g) => { ready(g); g.urchins.push(new Urchin(ahead(g, 50), 0.9, 1)); },
  },
  {
    name: 'Sea Urchin: pulled flat', dur: 2.2, keys: [['pullPressed', 0.5]],
    setup: (g) => { ready(g); g.urchins.push(new Urchin(ahead(g, 60), 0.9, 1)); },
  },
  {
    name: 'Sea Urchin: wiped twice (wrong attack), then pulled', dur: 4.5,
    keys: [['dragPressed', 0.2], ['dragPressed', 1], ['pullPressed', 1.8], ['pullPressed', 2.6], ['pullPressed', 3.4]],
    setup: (g) => { ready(g); g.urchins.push(new Urchin(ahead(g, 60), 1.4, 3)); },
  },
  {
    name: 'Sea Urchin: spiked from under the line', dur: 2.6, keys: [['right', 0.3, 1.2]],
    setup: (g) => { ready(g, true); g.urchins.push(new Urchin(ahead(g, 60), 0.9, 1)); },
  },
  {
    name: 'Sea Urchin: spiked', dur: 2.6, keys: [['right', 0.3, 1.2]],
    setup: (g) => { ready(g); g.urchins.push(new Urchin(ahead(g, 60), 0.9, 1)); },
  },
  {
    name: 'Worm: wiped flat from on top', dur: 2, keys: [['dragPressed', 0.35]],
    setup: (g) => { ready(g); const w = new Worm(ahead(g, 110)); w.state = 'move'; g.worms.push(w); },
  },
  {
    name: 'Cancel: under a crest', dur: 2,
    setup: (g) => { ready(g, true); g.sinepedes.push(new Sinepede(ahead(g, 100), 100, 1, 1)); },
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
    name: 'Bubble Burst: floats off, bursts over him', dur: 3.6,
    setup: (g) => { ready(g); g.bubbles.push(new BubbleBurst(ahead(g, 30), 1, 1.2, 1.6)); },
  },
  {
    name: 'Bubble Burst: floats off, pops his bubble', dur: 3.6, keys: [['upPressed', 0.3], ['up', 0.5, 1]],
    setup: (g) => { ready(g); g.bubbles.push(new BubbleBurst(ahead(g, 30), 1, 1.2, 1.6)); },
  },
  {
    name: 'Bubble Burst: wiped twice (wrong attack), bursts sooner', dur: 2.6, keys: [['dragPressed', 0.2], ['dragPressed', 0.9]],
    setup: (g) => { ready(g); g.bubbles.push(new BubbleBurst(ahead(g, 70), 1, 3)); },
  },
  {
    name: 'Worm: bites him underneath (dizzy)', dur: 3.5,
    setup: (g) => { ready(g, true); const w = new Worm(ahead(g, 90)); w.state = 'move'; g.worms.push(w); },
  },
  {
    name: 'Growing: catches two bonuses', dur: 3.5, keys: [['right', 0.1, 3.2]],
    setup: (g) => { ready(g); for (const d of [60, 160]) g.growths.push({ x: ahead(g, d), y: 0, side: 1, life: 7, p: 0 }); },
  },
  {
    name: 'Growing: hit at full size, loses one size', dur: 3,
    setup: (g) => { ready(g); g.wavell.size = 2; g.sinepedes.push(new Sinepede(ahead(g, 80), 100, 1, 1)); },
  },
  {
    name: 'Growing: a full-size wipe', dur: 1.6, keys: [['dragPressed', 0.3]],
    setup: (g) => { ready(g); g.wavell.size = 2; g.wavell.scale = 1 + 2 * 0.2; },
  },
  {
    name: 'Growing: a full-size bubble, until it pops', dur: 6.5, keys: [['upPressed', 0.3], ['up', 0.5, 1]],
    setup: (g) => { ready(g); g.wavell.size = 2; g.wavell.scale = 1 + 2 * 0.2; },
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
