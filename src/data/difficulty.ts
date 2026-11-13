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
  endSpeedPer: knob('End of the line', '… added per level', 4, 0, 30, 0.5),
  endSpeedCap: knob('End of the line', '… at most', 96, 0, 300, 1),
  endLead: knob('End of the line', 'Most lead he can build up (u)', 240, 40, 600, 5),
  endGrace: knob('End of the line', 'Pause after (re)spawning (s)', 1.6, 0, 6, 0.1),

  soloUntil: knob('One at a time', 'One threat at a time up to level', 3, 0, 30, 1),
  soloGap: knob('One at a time', 'Clear line between threats (s)', 1, 0, 6, 0.1),

  sineSpeed: knob('Sinepede', 'Speed at level 1 (u/s)', 100, 20, 250, 1),
  sineSpeedPer: knob('Sinepede', '… added per level', 0, 0, 30, 0.5),
  sineSpeedCap: knob('Sinepede', '… at most', 250, 20, 400, 1),
  sineEvery: knob('Sinepede', 'One every (s) at level 1', 4.25, 0.5, 15, 0.05),
  sineEveryPer: knob('Sinepede', '… change per level', -0.35, -2, 2, 0.05),
  sineEveryCap: knob('Sinepede', '… limit', 1.8, 0.3, 15, 0.05),
  sineFirst: knob('Sinepede', 'First one after (s)', 1.75, 0, 15, 0.05),
  sineIdle: knob('Sinepede', 'Clock rate when not walking on', 0.4, 0, 1, 0.05),
  sineSegs: knob('Sinepede', 'Segments at level 1', 1, 1, 8, 1),
  sineSegsPer: knob('Sinepede', '… added per level (rounded down)', 0.5, 0, 3, 0.25),
  sineSegsCap: knob('Sinepede', '… at most', 6, 1, 12, 1),
  sineSetBack: knob('Sinepede', 'Right attack: what is left of it is set back (knockback)', 150, 0, 1000, 10),
  sineMaxSegs: knob('Sinepede', 'Most it can grow to with wrong attacks', 8, 1, 16, 1),

  urchinEvery: knob('Disturchin', 'One every (s) at level 1', 7, 1, 30, 0.25),
  urchinEveryPer: knob('Disturchin', '… change per level', -0.4, -3, 3, 0.05),
  urchinEveryCap: knob('Disturchin', '… limit', 3.5, 0.5, 30, 0.25),
  urchinWarn: knob('Disturchin', 'Warning: the line vibrates (s) at level 1', 0.9, 0.1, 3, 0.05),
  urchinWarnPer: knob('Disturchin', '… change per level', -0.03, -0.5, 0.5, 0.01),
  urchinWarnCap: knob('Disturchin', '… limit', 0.5, 0.1, 3, 0.05),
  urchinHold: knob('Disturchin', 'Spikes stay out (s)', 1, 0.1, 4, 0.05),
  urchinFrom: knob('Disturchin', 'First after (s of play)', 14, 0, 120, 1),
  urchinKnock: knob('Disturchin', 'Wiped: knockback', 250, 0, 1000, 10),
  urchinRenew: knob('Disturchin', 'Wiped: spikes stay out this much longer (s)', 0.5, 0, 3, 0.05),

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
  bubbleFlyLevel: knob('Bubble Burst', 'Some float off the line from level', 6, 1, 30, 1),
  bubbleFlyChance: knob('Bubble Burst', 'Chance one floats off', 0.5, 0, 1, 0.05),
  bubbleFlyTime: knob('Bubble Burst', 'Time in the air before it bursts (s)', 1.6, 0.3, 5, 0.05),

  backChance: knob('Backwave', 'Chance per roll at level 1', 0.35, 0, 1, 0.01),
  backChancePer: knob('Backwave', '… added per level', 0.05, -0.5, 0.5, 0.01),
  backChanceCap: knob('Backwave', '… at most', 1, 0, 1, 0.01),
  backCheck: knob('Backwave', 'Rolled every (s)', 4, 0.5, 20, 0.25),
  backFrom: knob('Backwave', 'First after (s of play)', 22, 0, 120, 1),
  backAmp: knob('Backwave', 'Height (u)', 22, 4, 60, 1),
  backSpeed: knob('Backwave', 'Speed (u/s)', 220, 60, 500, 5),
  backGrow: knob('Backwave', 'Grows on its way (share of its height per s)', 0.15, 0, 1, 0.01),
  backEarn: knob('Backwave', 'Wiped back: the end of the line stops for (s)', 2, 0, 10, 0.25),

  refluxChance: knob('Reflux', 'Chance per roll at level 1', 0.29, 0, 1, 0.01),
  refluxChancePer: knob('Reflux', '… added per level', 0.04, -0.5, 0.5, 0.01),
  refluxChanceCap: knob('Reflux', '… at most', 1, 0, 1, 0.01),
  refluxCheck: knob('Reflux', 'Rolled every (s)', 3, 0.5, 20, 0.25),
  refluxFrom: knob('Reflux', 'First after (s of play)', 5, 0, 120, 1),
  refluxSpeed: knob('Reflux', 'Speed (u/s)', 175, 40, 500, 5),

  knock: knob('Fighting', 'Wrong attack, or a Sinepede touching him: its knockback', 650, 0, 2000, 10),
  bounce: knob('Fighting', 'A Sinepede touching him: his knockback', 300, 0, 1000, 10),
  maxSize: knob('Fighting', 'Most sizes a creature can grow', 3, 0, 8, 1),

  sparksPerSize: knob('Growing', 'Sparkles for each size', 10, 1, 50, 1),
  growGlow: knob('Growing', 'His aura after growing (s)', 1.5, 0, 5, 0.1),
  growMax: knob('Growing', 'Most times he can grow', 3, 0, 6, 1),
  growScale: knob('Growing', 'Bigger per size', 0.2, 0, 1, 0.01),
  growWalk: knob('Growing', 'Faster walking per size', 0.08, 0, 0.5, 0.01),
  growBubble: knob('Growing', 'Longer in the bubble per size', 0.35, 0, 2, 0.05),
  growSafe: knob('Growing', 'Safe after losing a size (s)', 1.2, 0, 5, 0.1),
  sizePoints: knob('Growing', 'Points multiplier added per size', 0.5, 0, 3, 0.25),

  sparkleKill: knob('Sparkles', 'Left by each enemy killed', 2, 0, 10, 1),
  sparkleEvery: knob('Sparkles', 'One on its own every (s, roughly)', 3, 0.5, 20, 0.1),
  sparkleMax: knob('Sparkles', 'Most at once, of those on their own', 6, 0, 20, 1),
  sparkleGold: knob('Sparkles', 'Chance of a gold one', 0.12, 0, 1, 0.01),
  chainTime: knob('Sparkles', 'Chain window (s)', 2.2, 0.3, 6, 0.1),

  bossEnd: knob('Boss', 'Crumble speed during the fight (u/s)', 60, 0, 200, 1),
  bossHits: knob('Boss', 'Hits to flatten him (his sizes)', 3, 1, 8, 1),
  bossAhead: knob('Boss', 'How far ahead of Wavell he stands (u, at most the edge of the view)', 150, 60, 200, 1),
  bossSpeed: knob('Boss', 'His walk to the right (u/s)', 60, 0, 200, 1),
  bossRun: knob('Boss', 'Fastest he gets away when closed in on (u/s)', 170, 20, 400, 5),
  bossRest: knob('Boss', 'Rest between powers in phase 1 (s)', 2.4, 0.2, 8, 0.05),
  bossRestStep: knob('Boss', '… shorter each phase (s)', 0.45, 0, 2, 0.05),
  bossDouble: knob('Boss', 'Last phase: chance of a power straight after another', 0.3, 0, 1, 0.05),
  bossWaveAmp: knob('Boss', 'Tidal wave height (u)', 30, 4, 80, 1),
  bossWaveSpeed: knob('Boss', 'Tidal wave speed (u/s)', 120, 30, 400, 5),
  bossWaveBack: knob('Boss', 'Tidal wave sent back: speed (u/s)', 260, 60, 600, 5),
  bossSawSpeed: knob('Boss', 'Saw rolling speed (u/s)', 150, 30, 500, 5),
  bossSparkles: knob('Boss', 'Most sparkles at once during the fight', 3, 0, 20, 1),
  bossHitPoints: knob('Boss', 'Points for each hit', 50, 0, 1000, 5),
  bossWinPoints: knob('Boss', 'Points for flattening him', 250, 0, 5000, 10),
  loopBoost: knob('Boss', 'After the boss: levels harder per loop', 2, 0, 9, 1),

  lives: knob('Progress', 'Lives at the start', 1, 1, 20, 1),
  levelScore: knob('Progress', 'Points for level 2; each level after costs this much more', 50, 10, 1000, 5),
  lastLevel: knob('Progress', 'Last level (the boss fight)', 10, 1, 30, 1),
  lifeEvery: knob('Progress', 'Extra life every N levels (0: never)', 0, 0, 20, 1),
  startLevel: knob('Progress', 'Start at level', 1, 1, 30, 1),

  beatOn: knob('Beat', 'On (1) or off (0)', 1, 0, 1, 1),
  bpm: knob('Beat', 'Tempo at level 1 (BPM)', 75, 40, 200, 1),
  bpmPer: knob('Beat', '… added per level', 2, 0, 20, 0.5),
  bpmCap: knob('Beat', '… at most', 120, 40, 300, 1),
  cueTwoFrom: knob('Beat', 'Enemies on beats 2 and 4 from level (before: only 4)', 6, 1, 30, 1),
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

/**
 * The score a level starts at. Each level costs levelScore more than the one before:
 * at 50, level 2 starts at 50, level 3 at 150, level 4 at 300, level 10 at 2250.
 */
export function levelStart(level: number) {
  return DIFF.levelScore * (level - 1) * level / 2;
}
