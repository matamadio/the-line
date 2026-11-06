// The numbers that shape the animations and the feel, in one place so the animation
// lab (lab.html) can change them while the game runs. The game reads them live; the
// defaults here are what ships. Difficulty (speeds, how often things come) is in
// difficulty.ts.

interface Knob { group: string; label: string; min: number; max: number; step: number; def: number }

const knob = (group: string, label: string, def: number, min: number, max: number, step: number): Knob =>
  ({ group, label, def, min, max, step });

export const KNOBS = {
  walkSpeed: knob('Wavell', 'Walk speed (u/s)', 100, 20, 200, 1),
  appearTime: knob('Wavell', 'Appear time (s)', 1, 0.3, 3, 0.01),
  riseHold: knob('Wavell', 'On load: flat line first (s)', 0.8, 0, 3, 0.05),
  riseTime: knob('Wavell', 'On load: rise time (s)', 3, 0.5, 8, 0.05),
  flipTime: knob('Wavell', 'Flip time (s)', 0.34, 0.08, 1.5, 0.01),
  takeoff: knob('Wavell', 'Float: head fills up, lets go (s)', 0.45, 0.05, 1.5, 0.01),
  landTime: knob('Wavell', 'Landing: head empties, body comes out (s)', 0.4, 0.1, 1.5, 0.01),
  pullBulge: knob('Wavell', 'Pull: bulge length (u)', 40, 8, 120, 1),
  waveAmp: knob('Wavell', 'Wave height', 22, 5, 50, 0.5),
  waveWidth: knob('Wavell', 'Wave width', 9, 3, 30, 0.5),
  dizzyTime: knob('Wavell', 'Dizzy time (s)', 2, 0.3, 5, 0.05),
  dizzyLock: knob('Wavell', 'Dizzy lock (s)', 0.9, 0, 3, 0.05),
  sinkTime: knob('Wavell', 'Killed or quit: sinks into the line (s)', 0.6, 0.2, 1.6, 0.01),

  burnTime: knob('Burn death', 'Burn time (s)', 1.25, 0.3, 4, 0.05),
  burnShock: knob('Burn death', 'Shock before (s)', 0.15, 0, 1, 0.01),
  burnEase: knob('Burn death', 'Burn ease (1 = steady)', 1.1, 0.4, 3, 0.05),

  meltTime: knob('Enemies', 'Melt time (s)', 0.5, 0.1, 2, 0.01),
  meltMorph: knob('Enemies', 'Melt: shape to hump (s)', 0.14, 0.01, 0.8, 0.01),
  meltDrift: knob('Enemies', 'Melt drift (u/s)', 70, 0, 300, 5),
  meltSpread: knob('Enemies', 'Melt spread', 1.4, 0, 4, 0.05),
  meltHeight: knob('Enemies', 'Melt hump height', 0.6, 0.1, 1.5, 0.05),
  crumbleSpeed: knob('Enemies', 'End of the line: burns along it at (u/s)', 120, 20, 600, 5),

  cancelStart: knob('Cancelling', 'Starts at distance', 80, 25, 200, 1),
  cancelSpan: knob('Cancelling', 'Shrinks over distance', 57, 5, 180, 1),
  cancelDepth: knob('Cancelling', 'Shrink at contact (0..1)', 0.8, 0, 1, 0.01),

  lineSpeed: knob('Line', 'Wave speed (u/s)', 300, 60, 800, 5),
};

export type TuneKey = keyof typeof KNOBS;

/** The live values. */
export const TUNE = Object.fromEntries(Object.entries(KNOBS).map(([k, v]) => [k, v.def])) as Record<TuneKey, number>;
