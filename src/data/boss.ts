// THE FLATTENER's shapes and powers, as data. The numbers live in boss.json, which the
// animation lab (lab.html, "Edit boss") edits and saves; the game reads them live from BOSS.
//
// A shape is an outline from root to root on the line, in [across, up] from his centre
// (u, at his smallest size; up is away from the line on the side he is on), with eyes
// ([across, up, radius]), an optional red nose, an optional point a shot comes from, and
// extra strokes (legs, a fang) drawn over him. The blob and the saw are worked out from
// a few numbers, as they never hold still.
//
// A power is a list of steps, played in order. Each step flows into a shape, holds it,
// and can then fire on the beat.

import data from './boss.json';

export type Pt = [number, number];
export type EyeDef = [number, number, number];

export interface PathShape { kind: 'path'; pts: Pt[]; eyes: EyeDef[]; nose?: Pt; emit?: Pt; strokes: Pt[][] }
/** A dome that never holds still. wobble: how much its outline ripples; drift: how far its eyes float. */
export interface BlobShape { kind: 'blob'; radius: number; wobble: number; drift: number; eyes: EyeDef[] }
/** A sawblade through the line. tooth: how far each tooth sticks out. */
export interface SawShape { kind: 'saw'; radius: number; teeth: number; tooth: number; eyes: EyeDef[] }
export type ShapeDef = PathShape | BlobShape | SawShape;

export const SOUNDS = ['none', 'rumble', 'meow', 'whirr', 'croak'] as const;
export const FIRES = ['none', 'slam', 'shoot', 'roll'] as const;
export type StepSound = (typeof SOUNDS)[number];
export type StepFire = (typeof FIRES)[number];

export interface Step {
  shape: string;
  /** 1: on top of the line; -1: hanging under it, the shape mirrored. */
  side: 1 | -1;
  /** Seconds to flow into the shape. */
  morph: number;
  /** Seconds to hold it after that, charging, before it fires. */
  hold: number;
  /** Fire on the next beat after the hold. */
  beat: boolean;
  /** Heard as the step starts. */
  sound: StepSound;
  /** What it does at the end of the hold: crash a front wave, shoot a reflux, or roll at Wavell as a saw. */
  fire: StepFire;
  /** shoot: how far from the line the reflux runs, in Wavell's heights (0.5: at his middle). */
  height: number;
  /** While holding, a bubble blisters up every this many seconds (0: none). */
  bubbles: number;
  /** Heights scaled from the first to the second number over the step: he rears up. */
  grow: [number, number];
  /** Glows with danger while charging. */
  glow: boolean;
  /** Walking into him hurts. */
  touch: boolean;
  /** In a shuffled power: steps in a row with the same group (1 and up) are one move, played in a random order with the others. 0 stays in its place. */
  group: number;
}

export interface PowerDef {
  /** The first phase (1 to 3) he uses it in. */
  from: number;
  /** How often he picks it, against the others. */
  weight: number;
  /** Play its groups of steps in a random order each time. */
  shuffle: boolean;
  steps: Step[];
}

export interface BossData { shapes: Record<string, ShapeDef>; powers: Record<string, PowerDef> }

/** The live data: the lab edits it in place. */
export const BOSS = data as unknown as BossData;

/** A step with every field filled in, for the editor. */
export function newStep(shape = 'blob'): Step {
  return { shape, side: 1, morph: 0.35, hold: 0.5, beat: false, sound: 'none', fire: 'none', height: 0.5, bubbles: 0, grow: [1, 1], glow: false, touch: true, group: 0 };
}

if (import.meta.hot) {
  // Saving from the lab rewrites boss.json: take the new shapes without reloading.
  import.meta.hot.accept('./boss.json', (m) => {
    if (!m) return;
    const next = (m as unknown as { default: BossData }).default;
    for (const k of Object.keys(BOSS.shapes)) if (!(k in next.shapes)) delete BOSS.shapes[k];
    Object.assign(BOSS.shapes, next.shapes);
    for (const k of Object.keys(BOSS.powers)) if (!(k in next.powers)) delete BOSS.powers[k];
    Object.assign(BOSS.powers, next.powers);
  });
}
