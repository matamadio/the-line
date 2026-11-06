// The big words: THE LINE and FLATLINED, each written in one unbroken stroke, which
// comes in from one edge of the screen and leaves by the other. It is the line again,
// so it wiggles slowly.

import { Neon, clamp, lerp, polyPath, rand, smooth } from '../core/neon';
import { Fx } from './fx';

/** On screen: the most it can fill of the width, its size per world unit, and the title's baseline above the line. */
const MAX_WIDTH = 0.88, SCALE = 0.36, BASELINE = 78.4;
const LINE_WIDTH = 2.6;
/** How finely the stroke is cut up, and how far along it each point is averaged with its neighbours. */
const STEP = 1.5, ROUNDING = 3;
/** The wiggle, in stroke units: how far the letters move and how much more the two ends do. */
const WIGGLE = 2.6, END_WIGGLE = 9;
/** The glow: how bright the haze behind the word is, and how far the bloom spreads, in stroke widths. */
const HAZE = 0.09, BLOOM = 7;
/** How far past the edges of the screen the stroke runs (px). */
const EDGE = 30;
/** Going from FLATLINED to THE LINE (s): pulled flat, lying flat, rising; and how much of it each end of the stroke lags. */
const MORPH_MELT = 0.8, MORPH_FLAT = 0.2, MORPH_FORM = 1.2, MORPH_SWEEP = 0.5, MORPH_POINTS = 900;
export const MORPH_TIME = MORPH_MELT + MORPH_FLAT + MORPH_FORM;
/** The title coming apart as a game starts: how long the break takes to run along it (s), and how many sparks it leaves. */
const DUST_TIME = 0.6, DUST_POINTS = 900;
/** How long those sparks last (s) and how fast they drift (units/s): the end of the line's, but quicker. */
const DUST_LIFE = [0.3, 0.7] as const, DUST_SPEED = [20, 55] as const;

/** Flat points walked in reverse, leaving out the one it turns back at. */
const backAlong = (p: number[]): number[] => {
  const out: number[] = [];
  for (let i = p.length - 4; i >= 0; i -= 2) out.push(p[i], p[i + 1]);
  return out;
};

/** The first E, from the join above its bowl to the loose end of its top bowl. One line can't leave a loose end except by coming back over itself. */
const LOOSE_E: number[] = [
  177.7, -29.3, 182.5, -39.2, 189.2, -45.9, 199.9, -52.1, 209.1, -54, 218.4, -52.6, 222.1, -47.7, 218.7, -42.2, 209.1, -41.4, 199.7, -43.5, 189.5, -48.5, 184.1, -58, 183.3, -68.6, 186.9, -77.4, 195.2, -85, 206.9, -89, 222, -89.6, 231.3, -85.4, 233.8, -80.7, 232.6, -75.4, 228.8, -72.2,
];

/**
 * Waypoints the stroke passes through, in writing order, traced from a drawing of the
 * title. Baseline y = 0, negative y up; x = 0 and the far end of the letters are
 * equally far from the middle of the screen.
 */
const THE_LINE: number[] = [
  // In from the left.
  -210.5, -59.3, -159.9, -59.1, -114.3, -59.7, -87.2, -60.9, -65.2, -63.7, -41.1, -69.8, -16.9, -79.6, -0.7, -82.8, 18.7, -80.7,
  // T: the loop of its bar, the stem, and up the H's first stem.
  35.4, -79.6, 49.8, -76, 64.2, -76.2, 74.6, -80.2, 75.8, -86.7, 69.3, -91.4, 57.2, -91.7, 45.8, -87.6, 38.5, -81.7, 33.6, -73.4, 29.9, -54.3, 29, -32.4, 32.1, -11.6, 40.4, -1.4, 48.4, -1.6, 59.9, -8.9, 76.3, -29.4, 87.7, -49.8, 95, -66.2, 99.1, -81, 100.5, -88.3, 96.9, -91.9, 94, -86.8, 95.3, -68.9,
  // H: down, a loop at the foot, the bar, up the second stem and down.
  97, -46.9, 98.5, -27.4, 97.7, -8.9, 91.8, -0.2, 84.9, -2.9, 83.3, -13.1, 88, -25, 98.4, -34.7, 110.5, -39.9, 130.4, -46.2, 146.1, -54.3, 157.3, -62.9, 161.4, -78.1, 157.5, -87.5, 153.2, -88.2, 147.2, -81.6, 144.2, -66.6, 143.4, -37.5, 146.3, -13.1, 151.7, -2.7, 160.3, -1.5, 166.7, -6.1, 175.1, -18.1,
  // E: into the small loop, round the top bowl to its loose end, and straight back.
  ...LOOSE_E, ...backAlong(LOOSE_E),
  // E: the bowl, and on up to the L.
  178.7, -15.9, 183.7, -7.2, 194.3, -0.7, 206.9, 1.2, 223.5, -1.4, 239.8, -9.9, 252.8, -23.5, 265, -34.3, 281.9, -40.7, 295.9, -45.6,
  // L: up the loop, down the stem, foot loop, foot.
  310.3, -54.3, 321.4, -63.9, 327, -78.1, 323.4, -89, 316.2, -90.2, 310.8, -83, 309.5, -68.7, 311.3, -44.9, 312.4, -23.1, 310, -10.3, 303.8, -2.5, 293.7, 0.4, 285.2, -2.4, 281.8, -9.4, 285.7, -17.2, 296, -20.2, 310.3, -19.5, 326.3, -10.9, 344.3, -3.6, 358.8, -0.9,
  // I: up, over and down.
  370.4, -3.5, 383.9, -17.2, 387, -27.5, 392.1, -39.8, 396.2, -61.5, 396.1, -80.9, 392.2, -89.2, 386.9, -90.4, 381.4, -84.6, 379.3, -68.7, 381.9, -44.7, 386.3, -25.3, 392.3, -11, 400.1, -2.9, 410.2, -1.2,
  // N.
  420.4, -11.2, 422.7, -27.5, 420.8, -52.1, 417.6, -70.9, 419.6, -84.3, 424.6, -86.8, 433.1, -80.9, 445.2, -61.3, 455.9, -39.1, 467.9, -17.1, 479, -3.8, 488.6, -2.1, 492, -13.2, 489.9, -32.2, 485, -56.1, 484.5, -73.8, 489.1, -83.3, 494.7, -84.9,
  // E: along the top, its top loop, the small loop, the bowl.
  505.2, -81.9, 520.1, -76, 537, -71.2, 553.9, -70.5, 566.3, -73.8, 568.8, -83.3, 561.3, -88.8, 549, -90, 535.2, -86.7, 525.5, -80.7, 519.4, -70.7, 519.4, -59.5, 525.2, -48.5, 539.7, -42.2, 554, -41.9, 558, -47, 553.5, -52.9, 542, -53.8, 529.5, -50.6, 518.4, -39.5, 512.9, -25.2, 515.9, -11.4, 527.5, -1.8, 546.9, 0.8, 565.6, -3.8, 583.3, -16.3, 593, -22.9,
  // Away to the right.
  607.1, -27.1, 628.8, -29.6, 657.6, -30.3, 693.6, -28.9, 737.1, -26.8, 784.9, -25.3,
];

/** A centripetal Catmull-Rom curve through flat points: it can't overshoot into kinks or stray loops. */
function spline(p: number[], perSegment: number): number[] {
  const out: number[] = [p[0], p[1]];
  const n = p.length / 2;
  const at = (i: number) => Math.max(0, Math.min(n - 1, i)) * 2;
  for (let i = 0; i < n - 1; i++) {
    const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const gap = (u: number, v: number) => Math.max(1e-3, Math.sqrt(Math.hypot(p[v] - p[u], p[v + 1] - p[u + 1])));
    const t1 = a === b ? 1 : gap(a, b), t2 = t1 + gap(b, c), t3 = t2 + (c === d ? 1 : gap(c, d));
    for (let s = 1; s <= perSegment; s++) {
      const t = t1 + ((t2 - t1) * s) / perSegment;
      for (let k = 0; k < 2; k++) {
        const a1 = ((t1 - t) * p[a + k] + t * p[b + k]) / t1;
        const a2 = ((t2 - t) * p[b + k] + (t - t1) * p[c + k]) / (t2 - t1);
        const a3 = ((t3 - t) * p[c + k] + (t - t2) * p[d + k]) / (t3 - t2);
        const b1 = ((t2 - t) * a1 + t * a2) / t2;
        const b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1);
        out.push(((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1));
      }
    }
  }
  return out;
}

/** Evenly spaced points along a flat polyline, then averaged along it so no turn stays tight. The ends stay put. */
function rounded(p: number[], step: number, reach: number): number[] {
  const pts: number[] = [p[0], p[1]];
  let left = step;
  for (let i = 2; i < p.length; i += 2) {
    let x = p[i - 2], y = p[i - 1];
    let d = Math.hypot(p[i] - x, p[i + 1] - y);
    while (d >= left) {
      x += ((p[i] - x) * left) / d; y += ((p[i + 1] - y) * left) / d;
      pts.push(x, y);
      d -= left; left = step;
    }
    left -= d;
  }
  const n = pts.length / 2, r = Math.round(reach / step);
  let cur = pts;
  // Three box blurs in a row are as good as a bell curve.
  for (let pass = 0; pass < 3; pass++) {
    const next = new Array<number>(n * 2);
    for (let i = 0; i < n; i++) {
      // The window narrows towards the ends, so they don't move.
      const w = Math.min(r, i, n - 1 - i);
      let sx = 0, sy = 0;
      for (let j = i - w; j <= i + w; j++) { sx += cur[j * 2]; sy += cur[j * 2 + 1]; }
      next[i * 2] = sx / (w * 2 + 1); next[i * 2 + 1] = sy / (w * 2 + 1);
    }
    cur = next;
  }
  return cur;
}

const FLATLINED: number[] = [
  // In from the left.
  -207, -64, -160, -64, -113, -65, -82, -68, -51, -77, -20, -91, -2, -93, 16, -89,
  // F: under the bar, curl, back over the bar, stem, bottom loop, crossbar.
  31, -84, 47, -80, 61, -80, 70, -84, 72, -92, 64, -98, 51, -100, 37, -98, 27, -91, 22, -82,
  21, -68, 20, -52, 22, -35, 24, -20, 21, -7, 12, -1, 4, -4, 0, -16, 2, -30, 11, -42, 23, -49,
  43, -52, 62, -51, 78, -55,
  // L: up the loop, down the stem, foot loop, foot.
  91, -62, 102, -76, 106, -88, 103, -98, 97, -100, 92, -95, 91, -80, 91, -61, 91, -41, 93, -21, 90, -8, 80, -1, 69, -1, 61, -7, 62, -16, 73, -23, 86, -20,
  99, -15, 115, -8, 130, -2, 145, 0,
  // A: up the left leg, over the point, down the right leg and round into the T's stem.
  157, -3, 165, -14, 168, -31, 171, -55, 176, -78, 183, -92, 190, -98, 196, -95, 202, -78, 207, -55, 213, -34, 223, -16, 234, -3, 250, 0, 261, -9, 265, -27, 264, -55, 265, -76,
  // T: top curl, back along the bar, S-curve down into the A's crossbar.
  271, -90, 282, -98, 297, -101, 305, -94, 302, -84, 287, -80, 271, -85, 254, -91, 234, -95, 222, -96, 216, -90, 219, -80, 227, -71, 230, -60, 224, -51, 211, -45,
  // The crossbar back through the A, loop round, and the long swoop under.
  188, -45, 168, -43, 155, -38, 146, -27, 145, -13, 151, 0, 162, 12, 180, 22, 203, 29, 230, 32, 254, 31, 273, 24, 289, 12, 301, -8, 312, -27, 332, -45,
  // L: up the loop, down the stem, foot loop, foot.
  355, -57, 368, -73, 374, -88, 370, -98, 361, -100, 355, -93, 354, -77, 355, -59, 357, -39, 359, -20, 355, -8, 346, -1, 334, 0, 326, -7, 328, -17, 339, -23, 351, -21,
  365, -17, 387, -8, 409, -2, 426, -4, 437, -16,
  // I: up, over, down.
  445, -35, 449, -59, 451, -82, 448, -95, 440, -100, 432, -95, 430, -78, 431, -59, 435, -39, 441, -22, 449, -6, 461, 0, 472, -7, 478, -27,
  // N.
  477, -51, 471, -73, 471, -88, 478, -95, 486, -90, 496, -71, 512, -39, 523, -12, 531, 0, 537, -4, 541, -27, 539, -51, 535, -73, 534, -88, 539, -95,
  // E: along the top, under, top curl, waist loop, bottom bowl.
  555, -95, 566, -90, 580, -82, 598, -77, 609, -80, 614, -90, 606, -98, 590, -99, 574, -95, 562, -88, 557, -77, 559, -65, 568, -54, 582, -47, 594, -45, 599, -51, 593, -59, 578, -59, 566, -55, 555, -45, 549, -31, 551, -16, 562, -4, 582, 1, 604, -3, 621, -16,
  // D: up to the tip, hairpin back, up round the bowl, foot loop and out.
  631, -32, 637, -51, 638, -68, 636, -79, 634, -66, 634, -49, 631, -34, 624, -52, 621, -73, 625, -88, 639, -97, 659, -98, 678, -88, 691, -68, 693, -45, 688, -23, 676, -11, 662, -3, 648, 0, 638, -4, 633, -13, 641, -20, 653, -22, 668, -17,
  // Away to the right.
  685, -12, 703, -12, 723, -18, 742, -26, 762, -30, 801, -32, 868, -27,
];

/** A word's stroke, how far its letters reach without the two ends that run off the screen, and its baseline above the line. */
const word = (waypoints: number[], left: number, right: number, baseline: number) => ({
  stroke: rounded(spline(waypoints, 8), STEP, ROUNDING),
  left,
  right,
  baseline,
});
type Word = ReturnType<typeof word>;

const TITLE_WORD = word(THE_LINE, 0, 574.4, BASELINE);
/** Lower than the title, to clear the HUD above it. */
const FLATLINED_WORD = word(FLATLINED, 0, 693, 72);

type Rgb = [number, number, number];
/** A word's colour: the stroke, and the haze behind it. */
interface Tint { stroke: Rgb; haze: Rgb }
const TITLE_TINT: Tint = { stroke: [255, 227, 77], haze: [255, 205, 60] };
const FLATLINED_TINT: Tint = { stroke: [255, 90, 58], haze: [255, 90, 58] };
const css = (c: Rgb) => `rgb(${c.map(Math.round).join(',')})`;
const mixTint = (a: Tint, b: Tint, t: number): Tint => ({
  stroke: a.stroke.map((v, i) => lerp(v, b.stroke[i], t)) as Rgb,
  haze: a.haze.map((v, i) => lerp(v, b.haze[i], t)) as Rgb,
});

/** Where a word sits on screen: its size per stroke unit and its origin. */
function place(n: Neon, w: Word) {
  const k = Math.min((n.w * MAX_WIDTH) / (w.right - w.left), n.unit * SCALE);
  return { k, ox: n.w / 2 - ((w.left + w.right) / 2) * k, oy: n.lineY - n.unit * w.baseline };
}

/** A word's whole stroke on screen, from past the left edge to past the right one, wiggling. */
function wordPoints(n: Neon, w: Word, time: number): number[] {
  const { stroke, left, right } = w, { k, ox, oy } = place(n, w), out: number[] = [];
  // The whole picture moves as one sheet of water, so where the stroke crosses itself stays crossed.
  const put = (x: number, y: number) => {
    const off = smooth(Math.max(left - x, x - right) / 90) * END_WIGGLE * Math.sin(x / 70 + time * 0.8);
    const wx = x + WIGGLE * Math.sin(y / 38 + x / 90 + time * 0.7);
    const wy = y + off + WIGGLE * (Math.sin(x / 55 - time * 0.9) + 0.5 * Math.sin(x / 23 + y / 40 + time * 0.6));
    out.push(ox + wx * k, oy + wy * k);
  };
  const edgeL = (-EDGE - ox) / k, edgeR = (n.w + EDGE - ox) / k;
  const x0 = stroke[0], y0 = stroke[1], xN = stroke[stroke.length - 2], yN = stroke[stroke.length - 1];
  for (let x = edgeL; x < x0; x += 12) put(x, y0);
  for (let i = 0; i < stroke.length; i += 2) put(stroke[i], stroke[i + 1]);
  for (let x = xN + 12; x < edgeR; x += 12) put(x, yN);
  return out;
}

/** The haze behind a word. */
function drawHaze(n: Neon, w: Word, tint: Tint, alpha: number) {
  const { k, oy } = place(n, w), c = n.ctx, rgb = tint.haze.map(Math.round).join(',');
  const rx = ((w.right - w.left) * k) / 2 + 60 * k;
  c.globalCompositeOperation = 'lighter';
  c.save();
  c.translate(n.w / 2, oy - 50 * k);
  c.scale(1, (95 * k) / rx);
  const haze = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  haze.addColorStop(0, `rgba(${rgb},${HAZE * alpha})`);
  haze.addColorStop(0.7, `rgba(${rgb},${HAZE * 0.6 * alpha})`);
  haze.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = haze;
  c.fillRect(-rx, -rx, rx * 2, rx * 2);
  c.restore();
}

/** The stroke itself, with a soft bloom that follows it. */
function drawStroke(n: Neon, path: Path2D, tint: Tint, width: number) {
  const c = n.ctx, color = css(tint.stroke);
  c.globalCompositeOperation = 'lighter';
  c.shadowColor = color;
  c.shadowBlur = width * BLOOM * n.dpr;
  c.strokeStyle = color;
  c.lineCap = c.lineJoin = 'round';
  c.lineWidth = width;
  c.globalAlpha = 0.55;
  c.stroke(path);
  c.shadowBlur = 0;
  c.globalAlpha = 1;
  n.glow(path, color, width);
}

const strokeWidth = (k: number) => clamp(LINE_WIDTH * k, 1.5, 7);

function drawWord(n: Neon, w: Word, tint: Tint, time: number) {
  drawHaze(n, w, tint, 1);
  drawStroke(n, polyPath(wordPoints(n, w, time)), tint, strokeWidth(place(n, w).k));
}

/** Draws the title in screen space. */
export function drawTitle(n: Neon, time: number) { drawWord(n, TITLE_WORD, TITLE_TINT, time); }

/** Draws the game over word in screen space. */
export function drawFlatlined(n: Neon, time: number) { drawWord(n, FLATLINED_WORD, FLATLINED_TINT, time); }

/** n points evenly spaced along flat points, by length. */
function resample(p: number[], n: number): number[] {
  const lens = [0];
  for (let i = 2; i < p.length; i += 2) lens.push(lens[lens.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]));
  const total = lens[lens.length - 1], out: number[] = [];
  for (let i = 0, j = 0; i < n; i++) {
    const d = (total * i) / (n - 1);
    while (j < lens.length - 2 && lens[j + 1] < d) j++;
    const f = clamp((d - lens[j]) / (lens[j + 1] - lens[j] || 1), 0, 1);
    out.push(lerp(p[j * 2], p[j * 2 + 2], f), lerp(p[j * 2 + 1], p[j * 2 + 3], f));
  }
  return out;
}

/**
 * Back to the start screen: FLATLINED is pulled flat from left to right, lies still for
 * a moment while its colour turns, and THE LINE rises out of it from left to right.
 * t is the seconds since it began.
 */
export function drawMorph(n: Neon, t: number, time: number) {
  const melting = t < MORPH_MELT + MORPH_FLAT, w = melting ? FLATLINED_WORD : TITLE_WORD;
  const pts = resample(wordPoints(n, w, time), MORPH_POINTS);
  const title = place(n, TITLE_WORD), flatY = title.oy + TITLE_WORD.stroke[1] * title.k;
  const sweep = (progress: number, s: number) => smooth(progress * (1 + MORPH_SWEEP) - MORPH_SWEEP * s);
  const melt = t / MORPH_MELT, form = (t - MORPH_MELT - MORPH_FLAT) / MORPH_FORM;
  for (let i = 0; i < MORPH_POINTS; i++) {
    const s = i / (MORPH_POINTS - 1);
    // How flat this point of the stroke is, from its place in the word to its place on the straight line.
    const f = melting ? sweep(melt, s) : 1 - sweep(form, s);
    pts[i * 2] = lerp(pts[i * 2], lerp(-EDGE, n.w + EDGE, s), f);
    pts[i * 2 + 1] = lerp(pts[i * 2 + 1], flatY, f);
  }
  const tint = mixTint(FLATLINED_TINT, TITLE_TINT, smooth((t - MORPH_MELT * 0.6) / (MORPH_MELT * 0.4 + MORPH_FLAT)));
  drawHaze(n, w, tint, melting ? 1 - smooth(melt) : smooth(form));
  drawStroke(n, polyPath(pts), tint, strokeWidth(lerp(place(n, FLATLINED_WORD).k, title.k, smooth(t / MORPH_TIME))));
}

/**
 * The title coming apart as a game starts: a break runs along the stroke from left to
 * right, as at the end of the line in the game but far faster, and what it has passed
 * drifts off as yellow sparks. It stays put on screen while the view moves off.
 */
export class TitleDust {
  private readonly fx = new Fx();
  private t = 0;
  /** The stroke this frame, and how many of its points have gone. */
  private pts: number[] = [];
  private shed = 0;

  get done() { return this.t >= DUST_TIME + DUST_LIFE[1]; }
  /** From 0 to 1, how far the break has run. */
  private get progress() { return clamp(this.t / DUST_TIME, 0, 1); }
  /** From 0 to 1, how far the game's HUD has faded in: it comes as the title goes. */
  get hudFade() { return smooth(this.progress); }
  /** What is left of the stroke, in flat points. */
  get rest() { return this.pts.slice(this.shed * 2); }

  update(dt: number, n: Neon, time: number) {
    this.t += dt;
    this.pts = resample(wordPoints(n, TITLE_WORD, time), DUST_POINTS);
    const reached = Math.round(this.progress * DUST_POINTS);
    for (; this.shed < reached; this.shed++) {
      const a = rand(0, Math.PI * 2), v = rand(...DUST_SPEED);
      // In world units from the corner of the play area, so that the sparks are the size of the game's.
      this.fx.spark(this.pts[this.shed * 2] / n.unit, this.pts[this.shed * 2 + 1] / n.unit, Math.cos(a) * v, Math.sin(a) * v,
        rand(...DUST_LIFE), Math.random() < 0.2 ? '#fff1b0' : css(TITLE_TINT.stroke), 0, 0);
    }
    this.fx.update(dt);
  }

  draw(n: Neon) {
    const rest = this.rest, width = strokeWidth(place(n, TITLE_WORD).k);
    if (rest.length >= 4) {
      drawHaze(n, TITLE_WORD, TITLE_TINT, 1 - this.progress);
      drawStroke(n, polyPath(rest), TITLE_TINT, width);
      // The stroke runs hot just ahead of the break, and the break itself is white-hot.
      n.glow(polyPath(rest.slice(0, 16)), '#fff1b0', width * 1.3, 0.7 + rand(0, 0.5));
      const core = new Path2D();
      core.arc(rest[0], rest[1], width * 0.9, 0, Math.PI * 2);
      n.glow(core, '#ffffff', width, 1.4);
    }
    n.ctx.scale(n.unit, n.unit);
    this.fx.draw(n);
    n.screen();
  }
}
