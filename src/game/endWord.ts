// Words written in the title's hand by the nearest of the lines behind the game, going
// by from right to left: LEVEL 2, LEVEL 3 … and THE SILENCER as the levels come, and after
// the boss, THE LINE CONTINUES.

import { strokeWord } from './lettering';

export const END_WORD = 'THE LINE CONTINUES';
/** Its size (u per unit of the stroke: the letters stand about 20 u high) and how fast it goes by (u/s). */
export const END_WORD_SCALE = 0.225, END_WORD_SPEED = 40;

/** What the line writes when a level starts. */
export function levelWord(level: number, last: boolean) { return last ? 'THE SILENCER' : 'LEVEL ' + level; }

const halfWidth = (word: string) => (strokeWord(word).width * END_WORD_SCALE) / 2;

/** Where the word's middle is, in u from the left of the view, t s after it came in at the right. */
export function endWordX(viewW: number, t: number, word = END_WORD) { return viewW + halfWidth(word) - END_WORD_SPEED * t; }

/** It has gone out of view at the left. */
export function endWordGone(viewW: number, t: number, word = END_WORD) { return endWordX(viewW, t, word) < -halfWidth(word); }
