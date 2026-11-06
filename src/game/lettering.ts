// Words written in one unbroken stroke, in the hand of the title: the letters it shares
// with THE LINE and FLATLINED are theirs, the others are drawn to match. A word starts and
// ends flat on the baseline, so it can be spliced into a line: the line itself writes it.

import { rounded, spline } from './title';

/**
 * Each letter's waypoints, in writing order, 90 units high: y = 0 is the baseline and
 * negative y is up. The stroke arrives from the letter before and leaves for the next.
 */
const LETTERS: Record<string, number[]> = {
  A: [0, -3, 8, -14, 11, -31, 14, -55, 19, -78, 26, -90, 33, -94, 39, -91, 45, -76, 50, -55, 56, -34, 66, -16, 76, -7, 82, -14, 76, -29, 58, -38, 34, -40, 14, -36, 3, -25, 5, -11, 19, -2, 44, 1, 70, 0, 92, -3],
  C: [6, -44, 18, -68, 34, -84, 48, -90, 57, -86, 56, -78, 47, -77, 41, -86, 28, -88, 13, -76, 4, -54, 3, -30, 12, -10, 30, -1, 50, -3, 70, -12],
  D: [9, -32, 16, -51, 17, -68, 15, -79, 13, -66, 13, -49, 10, -34, 3, -52, 0, -73, 4, -88, 18, -94, 38, -94, 57, -85, 70, -66, 72, -45, 67, -23, 55, -11, 41, -3, 27, 0, 17, -4, 12, -13, 20, -20, 32, -22, 47, -17, 64, -12],
  E: [0, -82, 15, -76, 32, -71, 49, -70.5, 61, -74, 64, -83, 56, -89, 44, -90, 30, -87, 20, -81, 14, -71, 14, -59.5, 20, -48.5, 35, -42, 49, -42, 53, -47, 48, -53, 37, -54, 24, -51, 13, -39.5, 8, -25, 11, -11, 22, -2, 42, 1, 61, -4, 78, -16],
  I: [0, -3.5, 14, -17, 17, -27.5, 22, -40, 26, -61.5, 26, -81, 22, -89, 17, -90.4, 11, -84.6, 9, -68.7, 12, -44.7, 16, -25, 22, -11, 30, -3, 40, -1.2],
  L: [6, -40, 22, -66, 33, -85, 30, -93, 24, -89, 22, -68, 22, -38, 22, -13, 28, -2, 44, 0, 62, -1, 78, -3],
  N: [3, -11, 5, -27.5, 3, -52, 0, -71, 2, -84, 7, -87, 16, -81, 28, -61, 38, -39, 50, -17, 62, -4, 71, -2, 75, -13, 73, -32, 68, -56, 67, -74, 72, -83, 77, -85],
  O: [0, -2, 26, 0, 48, -8, 60, -38, 52, -74, 31, -92, 11, -78, 2, -44, 9, -11, 28, -1, 52, 0, 76, -3],
  R: [2, -6, 8, -28, 10, -54, 10, -78, 8, -91, 3, -92, 2, -85, 10, -83, 27, -92, 46, -90, 56, -78, 52, -62, 37, -51, 20, -46, 30, -36, 43, -18, 56, -5, 72, -2],
  S: [4, -24, 18, -48, 34, -72, 50, -90, 54, -92, 48, -92, 28, -88, 15, -74, 19, -58, 36, -45, 49, -29, 46, -11, 30, -1, 12, -2, 3, -10, 10, -17, 27, -14, 48, -7, 68, -8],
  T: [0, -80, 12, -88, 30, -92, 50, -92, 68, -89, 73, -83, 66, -79, 48, -81, 38, -82, 35, -62, 33, -34, 35, -13, 43, -2, 60, -1],
};

/** The room between two letters, and the flat stretch at each end of a word. */
const GAP = 10, LEAD = 34;

/** A word's stroke, by its flat points, centred on x = 0, and how wide it is. */
export interface StrokeWord { pts: number[]; width: number }

const cache = new Map<string, StrokeWord>();

export function strokeWord(s: string): StrokeWord {
  const known = cache.get(s);
  if (known) return known;
  const way: number[] = [];
  let at = 0;
  for (const ch of s) {
    const p = LETTERS[ch];
    let right = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      way.push(at + p[i], p[i + 1]);
      right = Math.max(right, p[i]);
    }
    at += right + GAP;
  }
  const end = at - GAP;
  const full = [-LEAD * 2, 0, -LEAD, 0, ...way, end + LEAD, 0, end + LEAD * 2, 0];
  const pts = rounded(spline(full, 8), 1.5, 3);
  const mid = end / 2;
  for (let i = 0; i < pts.length; i += 2) pts[i] -= mid;
  const word = { pts, width: pts[pts.length - 2] - pts[0] };
  cache.set(s, word);
  return word;
}
