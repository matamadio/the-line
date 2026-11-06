// The lab's scenes: a setup plus a script of key presses. To look at a new situation
// slowly, add an entry here; it shows up in the lab's list. Free play stays last.

import { DIFF } from '../../data/difficulty';
import { BubbleBurst } from '../../game/actors/bubble';
import { Sinepede } from '../../game/actors/sinepede';
import { Urchin } from '../../game/actors/urchin';
import { Worm } from '../../game/actors/worm';
import { backwave, reflux, type Game } from '../../game/game';

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
  { name: 'Killed: sinks into the line', dur: 2.2, setup: (g) => { ready(g); g.wavell.hurt('zap'); } },
  { name: 'Killed under the line: sinks into it', dur: 2.2, setup: (g) => { ready(g, true); g.wavell.hurt('zap'); } },
  { name: 'Walk', dur: 2.5, keys: [['right', 0.1, 2.2]], setup: (g) => ready(g) },
  { name: 'Wipe', dur: 1.6, keys: [['dragPressed', 0.2]], setup: (g) => ready(g) },
  { name: 'Pull', dur: 1.6, keys: [['pullPressed', 0.2]], setup: (g) => ready(g) },
  { name: 'Flip under and back', dur: 2.2, keys: [['downPressed', 0.2], ['upPressed', 1.2]], setup: (g) => ready(g) },
  { name: 'Float and land', dur: 3, keys: [['upPressed', 0.2], ['up', 0.4, 0.9], ['down', 1.6, 2.8]], setup: (g) => ready(g) },
  { name: 'Float and land under the line', dur: 3, keys: [['downPressed', 0.2], ['down', 0.4, 0.9], ['up', 1.6, 2.8]], setup: (g) => ready(g, true) },
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
    name: 'Sinepede: runs into him on his side', dur: 2.5,
    setup: (g) => { ready(g); g.sinepedes.push(new Sinepede(ahead(g, 70), 100, 1, 1)); },
  },
  {
    name: 'Disturchin: wait it out', dur: 2.6,
    setup: (g) => { ready(g); g.urchins.push(new Urchin(ahead(g, 50), 0.9, 1)); },
  },
  {
    name: 'Disturchin: pulled flat', dur: 2.2, keys: [['pullPressed', 0.5]],
    setup: (g) => { ready(g); g.urchins.push(new Urchin(ahead(g, 60), 0.9, 1)); },
  },
  {
    name: 'Disturchin: wiped twice (wrong attack), then pulled', dur: 4.5,
    keys: [['dragPressed', 0.2], ['dragPressed', 1], ['pullPressed', 1.8], ['pullPressed', 2.6], ['pullPressed', 3.4]],
    setup: (g) => { ready(g); g.urchins.push(new Urchin(ahead(g, 60), 1.4, 3)); },
  },
  {
    name: 'Disturchin: spiked from under the line', dur: 2.6, keys: [['right', 0.3, 1.2]],
    setup: (g) => { ready(g, true); g.urchins.push(new Urchin(ahead(g, 60), 0.9, 1)); },
  },
  {
    name: 'Disturchin: spiked', dur: 2.6, keys: [['right', 0.3, 1.2]],
    setup: (g) => { ready(g); g.urchins.push(new Urchin(ahead(g, 60), 0.9, 1)); },
  },
  {
    name: 'Worm: pulled flat', dur: 2, keys: [['pullPressed', 0.35]],
    setup: (g) => { ready(g); const w = new Worm(ahead(g, 110)); w.state = 'move'; g.worms.push(w); },
  },
  {
    name: 'Worm: wiped (wrong attack), grows and is pushed back', dur: 2.4, keys: [['dragPressed', 0.35]],
    setup: (g) => { ready(g); const w = new Worm(ahead(g, 110)); w.state = 'move'; g.worms.push(w); },
  },
  {
    name: 'Sinepede: runs into him from the other side', dur: 2.5,
    setup: (g) => { ready(g, true); g.sinepedes.push(new Sinepede(ahead(g, 100), 100, 1, 1)); },
  },
  {
    name: 'Sinepede: the other side, costs him a size', dur: 2.5,
    setup: (g) => { ready(g, true); g.wavell.size = 1; g.sinepedes.push(new Sinepede(ahead(g, 100), 100, 2, 1)); },
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
    name: 'Growing: the sparkles that make up a size', dur: 3.5, keys: [['right', 0.1, 3.2]],
    setup: (g) => {
      ready(g);
      g.wavell.sparks = DIFF.sparksPerSize - 2;
      for (const d of [60, 160]) g.sparkles.push({ x: ahead(g, d), y: g.line.sample(ahead(g, d)) - 15, vx: 0, vy: 0, life: 7, max: 7, gold: false, p: 0 });
    },
  },
  {
    name: 'Growing: hit at full size, loses one size', dur: 3,
    setup: (g) => { ready(g); g.wavell.size = DIFF.growMax; g.urchins.push(new Urchin(ahead(g, 2), 1, 1)); },
  },
  {
    name: 'Growing: a full-size wipe', dur: 1.6, keys: [['dragPressed', 0.3]],
    setup: (g) => { ready(g); g.wavell.size = DIFF.growMax; g.wavell.scale = 1 + DIFF.growMax * DIFF.growScale; },
  },
  {
    name: 'Growing: a full-size bubble, until it pops', dur: 6.5, keys: [['upPressed', 0.3], ['up', 0.5, 1]],
    setup: (g) => { ready(g); g.wavell.size = DIFF.growMax; g.wavell.scale = 1 + DIFF.growMax * DIFF.growScale; },
  },
  {
    name: 'Backwave: hit', dur: 2.2,
    setup: (g) => { ready(g); g.backwaves.push(backwave(g.neon.camX - 10, 0.4)); },
  },
  {
    name: 'Backwave: pulled out (facing it)', dur: 2.4, keys: [['left', 0.1, 0.25], ['pullPressed', 0.6]],
    setup: (g) => { ready(g); g.backwaves.push(backwave(g.neon.camX - 10, 0.4)); },
  },
  {
    name: 'Backwave: wiped back, carrying the end of the line', dur: 3.2, end: true, keys: [['left', 0.1, 0.25], ['dragPressed', 0.4]],
    setup: (g) => { ready(g); g.endX = g.wavell.x - 130; g.backwaves.push(backwave(g.neon.camX - 10, 0.4)); },
  },
  {
    name: 'Backwave: wiped back', dur: 3, keys: [['left', 0.1, 0.25], ['dragPressed', 0.6]],
    setup: (g) => { ready(g); g.backwaves.push(backwave(g.neon.camX - 10, 0.4)); },
  },
  {
    name: 'Burn at the end of the line', dur: 2.2, end: true,
    setup: (g) => { ready(g); g.endX = g.wavell.x - 6; },
  },
  {
    name: 'End of the line: a Sinepede comes apart', dur: 2.5, end: true,
    setup: (g) => { ready(g); g.endX = g.wavell.x - 78; g.wavell.safe = 1; const s = new Sinepede(g.endX + 4, 100, 2, 1); for (const seg of s.segs) seg.g = 1; g.sinepedes.push(s); },
  },
  {
    name: 'End of the line: a Disturchin comes apart', dur: 3.2, end: true,
    setup: (g) => { ready(g); g.endX = g.wavell.x - 75; g.urchins.push(new Urchin(g.endX + 20, 0.1, 5)); },
  },
  {
    name: 'End of the line: a Worm comes apart', dur: 2.5, end: true,
    setup: (g) => { ready(g); g.endX = g.wavell.x - 75; const w = new Worm(g.endX + 12); w.state = 'move'; g.worms.push(w); },
  },
  {
    name: 'Reflux: on his side, hits him', dur: 2.5,
    setup: (g) => { ready(g); g.wavell.size = 1; g.refluxes.push(reflux(g.neon.viewW + 12, -1, 1, g.wavell)); },
  },
  {
    name: 'Reflux: on the other side, passes him', dur: 2.5,
    setup: (g) => { ready(g); g.refluxes.push(reflux(-12, 1, -1, g.wavell)); },
  },
  { name: 'Free play (your keys are recorded)', dur: 0, setup: (g) => ready(g) },
];
export const FREE = SCENES.length - 1;
