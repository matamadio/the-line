// Canvas 2D renderer for neon-style vector strokes.
//
// World units are the original game's pixels: the view always shows at least
// 320x200 of them and scales them to the screen's real pixel density, so strokes
// stay sharp on any phone. World y = 0 is the line's rest height; negative y is up.

export const COLORS = {
  line: '#ffd21f',
  wavell: '#ffe34d',
  enemy: '#ffc61a',
  eye: '#ff3b30',
  white: '#ffffff',
  danger: '#ff7a1a',
  hud: '#ffe34d',
};

export type Pts = ArrayLike<number>;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Straight segments through flat [x0, y0, x1, y1, ...] points. */
export function polyPath(p: Pts, closed = false, path = new Path2D()): Path2D {
  path.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) path.lineTo(p[i], p[i + 1]);
  if (closed) path.closePath();
  return path;
}

/** A smooth curve through the midpoints of flat points, passing through both ends. */
export function smoothPath(p: Pts, path = new Path2D(), move = true): Path2D {
  const n = p.length / 2;
  if (move) path.moveTo(p[0], p[1]); else path.lineTo(p[0], p[1]);
  if (n < 3) { for (let i = 1; i < n; i++) path.lineTo(p[i * 2], p[i * 2 + 1]); return path; }
  for (let i = 1; i < n - 1; i++) {
    const x = p[i * 2], y = p[i * 2 + 1];
    path.quadraticCurveTo(x, y, (x + p[i * 2 + 2]) / 2, (y + p[i * 2 + 3]) / 2);
  }
  path.lineTo(p[n * 2 - 2], p[n * 2 - 1]);
  return path;
}

export class Neon {
  readonly ctx: CanvasRenderingContext2D;
  /** CSS pixels per world unit. */
  unit = 1;
  dpr = 1;
  w = 0;
  h = 0;
  /** World x at the left edge of the screen. */
  camX = 0;
  /** Screen y (CSS px) of world y = 0. */
  lineY = 0;
  shake = 0;
  /** Extra magnification on top of the fit-to-screen scale (the animation lab zooms in). */
  zoom = 1;
  private sx = 0;
  private sy = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resize();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    // A tab opened in the background can report a 0x0 window.
    this.w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    this.h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    // Landscape shows at least 320x200 like the original; portrait zooms in to 240
    // wide so the figures stay readable.
    const portrait = this.h > this.w;
    this.unit = Math.min(this.w / (portrait ? 240 : 320), this.h / 200) * this.zoom;
    this.lineY = this.h * (portrait ? 0.45 : 0.62);
  }

  get viewW() { return this.w / this.unit; }
  /** Where Wavell stays on screen, as a fraction of the width: more look-ahead in portrait. */
  get focus() { return this.h > this.w ? 0.3 : 0.42; }
  get viewTop() { return -this.lineY / this.unit; }
  get viewBottom() { return (this.h - this.lineY) / this.unit; }

  toScreen(x: number, y: number): [number, number] {
    return [(x - this.camX) * this.unit + this.sx, this.lineY + y * this.unit + this.sy];
  }

  begin(dt: number) {
    if ((this.canvas.clientWidth || window.innerWidth) !== this.w || (this.canvas.clientHeight || window.innerHeight) !== this.h) this.resize();
    this.shake = Math.max(0, this.shake - dt * 12);
    const s = this.shake * this.unit;
    this.sx = (Math.random() - 0.5) * s;
    this.sy = (Math.random() - 0.5) * s;
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    const g = c.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#05030f');
    g.addColorStop(this.lineY / this.h, '#0b0920');
    g.addColorStop(1, '#020107');
    c.fillStyle = g;
    c.fillRect(0, 0, this.w, this.h);
    // A soft haze along the line.
    const hz = c.createLinearGradient(0, this.lineY - 40 * this.unit, 0, this.lineY + 25 * this.unit);
    hz.addColorStop(0, 'rgba(255,190,40,0)');
    hz.addColorStop(0.62, 'rgba(255,190,40,0.07)');
    hz.addColorStop(1, 'rgba(255,190,40,0)');
    c.fillStyle = hz;
    c.fillRect(0, this.lineY - 40 * this.unit, this.w, 65 * this.unit);
  }

  world() {
    const k = this.dpr * this.unit;
    this.ctx.setTransform(k, 0, 0, k, this.dpr * (-this.camX * this.unit + this.sx), this.dpr * (this.lineY + this.sy));
  }

  screen() { this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }

  /** Stroke a path as a glowing tube: wide faint halo, tight glow, solid core, hot centre. */
  glow(path: Path2D, color: string, width = 0.8, intensity = 1) {
    const c = this.ctx;
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = color;
    c.globalAlpha = 0.06 * intensity;
    c.lineWidth = width * 8;
    c.stroke(path);
    c.globalAlpha = 0.18 * intensity;
    c.lineWidth = width * 3;
    c.stroke(path);
    c.globalAlpha = Math.min(1, intensity);
    c.lineWidth = width;
    c.stroke(path);
    c.globalAlpha = 0.55 * Math.min(1, intensity);
    c.strokeStyle = '#fff';
    c.lineWidth = width * 0.35;
    c.stroke(path);
    c.globalAlpha = 1;
  }

  /** Neon text in screen space (CSS px). */
  text(s: string, x: number, y: number, size: number, color = COLORS.hud, align: CanvasTextAlign = 'center', alpha = 1) {
    const c = this.ctx;
    this.screen();
    c.globalCompositeOperation = 'lighter';
    c.font = `${size}px Audiowide, "Arial Black", sans-serif`;
    c.textAlign = align;
    c.textBaseline = 'middle';
    c.shadowColor = color;
    c.shadowBlur = size * 0.6;
    c.globalAlpha = alpha;
    c.fillStyle = color;
    c.fillText(s, x, y);
    c.shadowBlur = 0;
    c.globalAlpha = 0.6 * alpha;
    c.fillStyle = '#fff';
    c.fillText(s, x, y);
    c.globalAlpha = 1;
  }
}
