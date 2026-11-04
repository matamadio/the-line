// The title: THE LINE written in one unbroken stroke, which comes in from one edge
// of the screen and leaves by the other. It is the line again, so it wiggles slowly.

import { COLORS, Neon, clamp, smooth } from '../core/neon';

/** How far the letters reach, without the two ends that run off the screen. Capitals are about 100 high, baseline y = 0, negative y up. */
const LEFT = 15, RIGHT = 672;
/** On screen: the most it can fill of the width, its size per world unit, and the baseline above the line. */
const MAX_WIDTH = 0.88, SCALE = 0.36, BASELINE = 78;
const LINE_WIDTH = 2.6;
/** How far along the stroke each point is averaged with its neighbours: more rounds every turn off further. */
const ROUNDING = 6;
/** Widens the letters without having to move every waypoint. */
const STRETCH = 1.15;
/** The wiggle, in stroke units: how far the letters move and how much more the two ends do. */
const WIGGLE = 2.6, END_WIGGLE = 9;
/** The glow: how bright the haze behind the word is, and how far the bloom spreads, in stroke widths. */
const HAZE = 0.09, BLOOM = 7;

/** A cursive E: in along its middle bar, round the top bowl, a pinch at the waist, round the bottom bowl and out. */
const cursiveE = (x: number): number[] => [
  x + 8, -46, x + 34, -50, x + 56, -62, x + 66, -84, x + 50, -104, x + 24, -102, x + 12, -84, x + 24, -64, x + 34, -54,
  x + 18, -50, x + 2, -36, x, -16, x + 20, 0, x + 50, 0, x + 76, -8,
];

/** Waypoints the stroke passes through, in writing order. */
const WAYPOINTS: number[] = [
  // In from the left and up into the T's bar.
  -70, -64, -35, -64, -8, -70, 16, -88,
  // T: the bar, a curl back at its tip, and the stem down.
  40, -102, 74, -98, 108, -100, 124, -90, 108, -80, 88, -86, 78, -60, 72, -22, 80, -3, 96, 0, 112, -8,
  // H: up and over into the first stem, an arc back up to the bar, then the second stem.
  130, -44, 152, -88, 150, -106, 132, -102, 124, -80, 122, -50, 120, -14, 128, -1, 138, -18, 152, -42, 174, -50, 196, -50, 214, -62,
  226, -90, 222, -106, 204, -102, 196, -80, 194, -48, 194, -14, 206, 0, 228, -2, 248, -24,
  // E.
  ...cursiveE(254),
  // L: up the loop, down the stem crossing itself, and a long foot along the baseline.
  344, -8, 362, -44, 380, -86, 376, -106, 358, -102, 350, -70, 344, -30, 332, -4, 322, 6, 342, 8, 380, 5, 412, -2,
  // I: up and over, and down.
  430, -44, 446, -88, 442, -106, 424, -100, 418, -60, 416, -16, 426, -1, 444, -2, 460, -14,
  // N: up, down the diagonal, up the second stem, and an arch over into the E's bar.
  472, -60, 482, -92, 492, -100, 502, -82, 518, -38, 530, -10, 540, -8, 546, -44, 552, -84, 564, -104, 578, -94, 584, -68, 590, -50,
  // E, then away to the right.
  ...cursiveE(592),
  692, -22, 712, -50, 736, -66, 768, -68, 814, -68,
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

const STROKE = rounded(spline(WAYPOINTS.map((v, i) => (i % 2 ? v : v * STRETCH)), 8), 3, ROUNDING);

/** Draws the title in screen space. */
export function drawTitle(n: Neon, time: number) {
  const k = Math.min((n.w * MAX_WIDTH) / ((RIGHT - LEFT) * STRETCH), n.unit * SCALE);
  const ox = n.w / 2 - ((LEFT + RIGHT) / 2) * STRETCH * k, oy = n.lineY - n.unit * BASELINE;
  const path = new Path2D();
  // The whole picture moves as one sheet of water, so where the stroke crosses itself stays crossed.
  const put = (x: number, y: number, first = false) => {
    const off = smooth(Math.max(LEFT * STRETCH - x, x - RIGHT * STRETCH) / 90) * END_WIGGLE * Math.sin(x / 70 + time * 0.8);
    const wx = x + WIGGLE * Math.sin(y / 38 + x / 90 + time * 0.7);
    const wy = y + off + WIGGLE * (Math.sin(x / 55 - time * 0.9) + 0.5 * Math.sin(x / 23 + y / 40 + time * 0.6));
    if (first) path.moveTo(ox + wx * k, oy + wy * k); else path.lineTo(ox + wx * k, oy + wy * k);
  };
  const edgeL = (-30 - ox) / k, edgeR = (n.w + 30 - ox) / k;
  const x0 = STROKE[0], y0 = STROKE[1], xN = STROKE[STROKE.length - 2], yN = STROKE[STROKE.length - 1];
  for (let x = Math.min(edgeL, x0), i = 0; x < x0; x += 12, i++) put(x, y0, i === 0);
  for (let i = 0; i < STROKE.length; i += 2) put(STROKE[i], STROKE[i + 1], i === 0 && edgeL >= x0);
  for (let x = xN + 12; x < edgeR; x += 12) put(x, yN);
  // The glow: a haze behind the whole word, and a soft bloom that follows the stroke.
  const c = n.ctx, cx = n.w / 2, cy = oy - 50 * k, rx = ((RIGHT - LEFT) * STRETCH * k) / 2 + 60 * k;
  const width = clamp(LINE_WIDTH * k, 1.5, 7);
  c.globalCompositeOperation = 'lighter';
  c.save();
  c.translate(cx, cy);
  c.scale(1, (95 * k) / rx);
  const haze = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  haze.addColorStop(0, `rgba(255,205,60,${HAZE})`);
  haze.addColorStop(0.7, `rgba(255,205,60,${HAZE * 0.6})`);
  haze.addColorStop(1, 'rgba(255,205,60,0)');
  c.fillStyle = haze;
  c.fillRect(-rx, -rx, rx * 2, rx * 2);
  c.restore();
  c.shadowColor = COLORS.hud;
  c.shadowBlur = width * BLOOM * n.dpr;
  c.strokeStyle = COLORS.hud;
  c.lineCap = c.lineJoin = 'round';
  c.lineWidth = width;
  c.globalAlpha = 0.55;
  c.stroke(path);
  c.shadowBlur = 0;
  c.globalAlpha = 1;
  n.glow(path, COLORS.hud, width);
}
