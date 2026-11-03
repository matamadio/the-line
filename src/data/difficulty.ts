// The numbers that make the game hard: how fast the end of the line crumbles in, how
// often and how fast enemies come, and how all that ramps up level by level. The
// difficulty editor (difficulty.html) changes them while the game runs and saves them
// into difficulty.json; the game reads them live from DIFF.
//
// A ramp is three knobs: its value at level 1 (`x`), what each level adds (`xPer`,
// negative to go down) and the limit it stops at (`xCap`). Read it with at('x', level).

import saved from './difficulty.json';

interface Knob { group: string; label: string; min: number; max: number; step: number; def: number }

const knob = (group: string, label: string, def: number, min: number, max: number, step: number): Knob =>
  ({ group, label, def, min, max, step });

export const DIFF_KNOBS = {
  endSpeed: knob('End of the line', 'Crumble speed at level 1 (u/s)', 78, 0, 200, 1),
  endSpeedPer: knob('End of the line', '… added per level', 3, 0, 30, 0.5),
  endSpeedCap: knob('End of the line', '… at most', 96, 0, 300, 1),
  endLead: knob('End of the line', 'Most lead he can build up (u)', 240, 40, 600, 5),
  endGrace: knob('End of the line', 'Pause after (re)spawning (s)', 1.6, 0, 6, 0.1),

  snaSpeed: knob('Snawave', 'Speed at level 1 (u/s)', 100, 20, 250, 1),
  snaSpeedPer: knob('Snawave', '… added per level', 0, 0, 30, 0.5),
  snaSpeedCap: knob('Snawave', '… at most', 250, 20, 400, 1),
  snaEvery: knob('Snawave', 'One every (s) at level 1', 4.25, 0.5, 15, 0.05),
  snaEveryPer: knob('Snawave', '… change per level', -0.35, -2, 2, 0.05),
  snaEveryCap: knob('Snawave', '… limit', 1.8, 0.3, 15, 0.05),
  snaFirst: knob('Snawave', 'First one after (s)', 1.75, 0, 15, 0.05),
  snaIdle: knob('Snawave', 'Clock rate when not walking on', 0.4, 0, 1, 0.05),

  wormSpeed: knob('Worm', 'Speed at level 1 (u/s)', 70, 10, 200, 1),
  wormSpeedPer: knob('Worm', '… added per level', 0, 0, 30, 0.5),
  wormSpeedCap: knob('Worm', '… at most', 200, 10, 400, 1),
  wormEvery: knob('Worm', 'One every (s) at level 1', 6.6, 0.5, 20, 0.05),
  wormEveryPer: knob('Worm', '… change per level', -0.4, -2, 2, 0.05),
  wormEveryCap: knob('Worm', '… limit', 2.6, 0.3, 20, 0.05),
  wormFrom: knob('Worm', 'First after (s of play)', 10, 0, 60, 0.5),
  wormUnder: knob('Worm', 'Clock rate while he is under', 1.6, 0.2, 4, 0.05),

  bubbleEvery: knob('Bubble Burst', 'One every (s) at level 1', 5.15, 0.5, 20, 0.05),
  bubbleEveryPer: knob('Bubble Burst', '… change per level', -0.35, -2, 2, 0.05),
  bubbleEveryCap: knob('Bubble Burst', '… limit', 2.4, 0.3, 20, 0.05),
  bubbleGrow: knob('Bubble Burst', 'Time to burst (s) at level 1', 1.74, 0.3, 5, 0.02),
  bubbleGrowPer: knob('Bubble Burst', '… change per level', -0.06, -1, 1, 0.01),
  bubbleGrowCap: knob('Bubble Burst', '… limit', 1.1, 0.2, 5, 0.02),
  bubbleFrom: knob('Bubble Burst', 'First after (s of play)', 6, 0, 60, 0.5),
  bubbleOwnSide: knob('Bubble Burst', 'Chance it is on his side', 0.65, 0, 1, 0.05),

  backChance: knob('Backwave', 'Chance per roll at level 1', 0.35, 0, 1, 0.01),
  backChancePer: knob('Backwave', '… added per level', 0.05, -0.5, 0.5, 0.01),
  backChanceCap: knob('Backwave', '… at most', 1, 0, 1, 0.01),
  backCheck: knob('Backwave', 'Rolled every (s)', 4, 0.5, 20, 0.25),
  backFrom: knob('Backwave', 'First after (s of play)', 22, 0, 120, 1),

  refluxChance: knob('Reflux', 'Chance per roll at level 1', 0.29, 0, 1, 0.01),
  refluxChancePer: knob('Reflux', '… added per level', 0.04, -0.5, 0.5, 0.01),
  refluxChanceCap: knob('Reflux', '… at most', 1, 0, 1, 0.01),
  refluxCheck: knob('Reflux', 'Rolled every (s)', 3, 0.5, 20, 0.25),
  refluxFrom: knob('Reflux', 'First after (s of play)', 5, 0, 120, 1),
  refluxSpeed: knob('Reflux', 'Speed (u/s)', 175, 40, 500, 5),

  pullRange: knob('Fighting', 'Pull reach (u)', 120, 30, 300, 5),
  knock: knob('Fighting', 'Wrong attack: knockback', 650, 0, 2000, 10),
  maxSize: knob('Fighting', 'Most sizes a creature can grow', 3, 0, 8, 1),

  sparkleMax: knob('Sparkles', 'Most at once', 6, 0, 20, 1),
  sparkleGold: knob('Sparkles', 'Chance of a gold one', 0.12, 0, 1, 0.01),
  chainTime: knob('Sparkles', 'Chain window (s)', 2.2, 0.3, 6, 0.1),

  lives: knob('Progress', 'Lives at the start', 3, 1, 20, 1),
  levelScore: knob('Progress', 'Points per level', 100, 10, 1000, 5),
  lifeEvery: knob('Progress', 'Extra life every N levels (0: never)', 3, 0, 20, 1),
  startLevel: knob('Progress', 'Start at level', 1, 1, 30, 1),
};

export type DiffKey = keyof typeof DIFF_KNOBS;

/** What difficulty.json says, falling back on the defaults above for anything it leaves out. */
export function savedValues(file: Partial<Record<string, number>> = saved): Record<DiffKey, number> {
  return Object.fromEntries(Object.entries(DIFF_KNOBS).map(([k, v]) => [k, typeof file[k] === 'number' ? file[k] : v.def])) as Record<DiffKey, number>;
}

/** The live values. */
export const DIFF = savedValues();

/** The ramps: every key that has a Per and a Cap. */
export type RampKey = { [K in DiffKey]: `${K}Per` extends DiffKey ? (`${K}Cap` extends DiffKey ? K : never) : never }[DiffKey];
export const RAMPS = (Object.keys(DIFF_KNOBS) as DiffKey[]).filter((k) => `${k}Per` in DIFF_KNOBS && `${k}Cap` in DIFF_KNOBS) as RampKey[];

/** A ramp's value at a level: it moves by Per every level and stops at Cap. */
export function at(k: RampKey, level: number) {
  const v = DIFF[k] + DIFF[`${k}Per` as DiffKey] * (level - 1), cap = DIFF[`${k}Cap` as DiffKey];
  return DIFF[`${k}Per` as DiffKey] < 0 ? Math.max(cap, v) : Math.min(cap, v);
}

// Saving difficulty.json from the editor updates a running game instead of reloading it.
if (import.meta.hot) import.meta.hot.accept('./difficulty.json', (m) => { if (m) Object.assign(DIFF, savedValues(m.default)); });
