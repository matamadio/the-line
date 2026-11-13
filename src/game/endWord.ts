// After the boss: THE LINE CONTINUES, written in the title's hand by the nearest of the
// lines behind the game, going by from right to left.

import { strokeWord } from './lettering';

export const END_WORD = 'THE LINE CONTINUES';
/** Its size (u per unit of the stroke: the letters stand about 20 u high) and how fast it goes by (u/s). */
export const END_WORD_SCALE = 0.225, END_WORD_SPEED = 40;

const halfWidth = () => (strokeWord(END_WORD).width * END_WORD_SCALE) / 2;

/** Where its middle is, in u from the left of the view, t s after it came in at the right. */
export function endWordX(viewW: number, t: number) { return viewW + halfWidth() - END_WORD_SPEED * t; }

/** It has gone out of view at the left. */
export function endWordGone(viewW: number, t: number) { return endWordX(viewW, t) < -halfWidth(); }
