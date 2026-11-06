// Canvas 2D renderer for neon-style vector strokes.
//
// World units are the original game's pixels. Every screen shows the same play area,
// VIEW_W x VIEW_H of them, scaled to the screen's real pixel density so strokes stay
// sharp on any phone. Whatever the area doesn't fill is left empty around it, which is
// where a phone's thumbs go. World y = 0 is the line's rest height; negative y is up.

import { GLYPH_H, pixelText, pixelTextWidth } from './pixelfont';

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

/** The play area in world units: the same on every platform, so nobody sees further ahead. */
export const VIEW_H = 200;
export const VIEW_W = (VIEW_H * 16) / 9;

/** The largest play area that fits a W x H canvas, centred, in CSS pixels. */
export function fitArea(W: number, H: number) {
  const w = Math.min(W, (H * VIEW_W) / VIEW_H), h = (w * VIEW_H) / VIEW_W;
  return { w, h, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2) };
}

/** Nostalgia mode: how many pixels the play area is wide, how many shades each colour channel has, and how much text size makes each step of the pixel font (px). */
const RETRO_W = 320, RETRO_SHADES = 32, RETRO_TEXT_STEP = 7;
const RETRO_LUT = Uint8ClampedArray.from({ length: 256 }, (_, v) => {
  const step = 255 / (RETRO_SHADES - 1);
  return Math.round(v / step) * step;
});

export class Neon {
  readonly ctx: CanvasRenderingContext2D;
  /** Nostalgia mode: everything is drawn at a low resolution, with few colours, and blown up. Call resize() after changing it. */
  retro = false;
  /** How much of what glow() and text() draw shows, from 0 to 1: for fading a whole group in. */
  fade = 1;
  /** CSS pixels per world unit. */
  unit = 1;
  dpr = 1;
  /** The play area's size and where it sits on the canvas, in CSS pixels. */
  w = 0;
  h = 0;
  ox = 0;
  oy = 0;
  /** The whole canvas, in CSS pixels. */
  fullW = 0;
  fullH = 0;
  /** World x at the left edge of the screen. */
  camX = 0;
  /** Screen y (CSS px) of world y = 0. */
  lineY = 0;
  shake = 0;
  /** Extra magnification on top of the fit-to-screen scale (the animation lab zooms in). */
  zoom = 1;
  private sx = 0;
  private sy = 0;
  private clipped = false;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resize();
  }

  resize() {
    // A tab opened in the background can report a 0x0 window.
    this.fullW = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    this.fullH = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const a = fitArea(this.fullW, this.fullH);
    this.dpr = this.retro ? RETRO_W / a.w : Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.fullW * this.dpr);
    this.canvas.height = Math.round(this.fullH * this.dpr);
    this.canvas.style.imageRendering = this.retro ? 'pixelated' : '';
    this.clipped = false; // Resizing a canvas resets its state.
    this.w = a.w; this.h = a.h; this.ox = a.x; this.oy = a.y;
    this.unit = (this.h / VIEW_H) * this.zoom;
    this.lineY = this.h * 0.62;
  }

  get viewW() { return this.w / this.unit; }
  /** Where Wavell stays on screen, as a fraction of the width. */
  get focus() { return 0.42; }
  get viewTop() { return -this.lineY / this.unit; }
  get viewBottom() { return (this.h - this.lineY) / this.unit; }

  /** Screen position inside the play area, the coordinates screen() draws in. */
  toScreen(x: number, y: number): [number, number] {
    return [(x - this.camX) * this.unit + this.sx, this.lineY + y * this.unit + this.sy];
  }

  begin(dt: number) {
    if ((this.canvas.clientWidth || window.innerWidth) !== this.fullW || (this.canvas.clientHeight || window.innerHeight) !== this.fullH) this.resize();
    this.shake = Math.max(0, this.shake - dt * 12);
    const s = this.shake * this.unit;
    this.sx = (Math.random() - 0.5) * s;
    this.sy = (Math.random() - 0.5) * s;
    const c = this.ctx;
    this.overlay();
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = '#020107';
    c.fillRect(0, 0, this.fullW, this.fullH);
    // Nothing the world draws may show outside the play area.
    c.save();
    this.clipped = true;
    this.screen();
    c.beginPath();
    c.rect(0, 0, this.w, this.h);
    c.clip();
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
    this.ctx.setTransform(k, 0, 0, k, this.dpr * (this.ox - this.camX * this.unit + this.sx), this.dpr * (this.oy + this.lineY + this.sy));
  }

  /** Text in nostalgia mode: the pixel font on whole pixels, with no glow to smear it. */
  private retroText(s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign, alpha: number) {
    const scale = Math.max(1, Math.floor((size * this.dpr) / RETRO_TEXT_STEP));
    const w = pixelTextWidth(s) * scale, sx = (x + this.ox) * this.dpr, sy = (y + this.oy) * this.dpr;
    const left = Math.round(align === 'center' ? sx - w / 2 : align === 'right' ? sx - w : sx);
    const path = new Path2D();
    pixelText(path, s, left, Math.round(sy - (GLYPH_H * scale) / 2), scale);
    this.fillPixels(path, color, alpha);
  }

  /** Nostalgia mode: the whole pixel at a point given in the coordinates screen() draws in. */
  toPixel(x: number, y: number): [number, number] {
    return [Math.round((x + this.ox) * this.dpr), Math.round((y + this.oy) * this.dpr)];
  }

  /** Nostalgia mode: fills a path made of whole pixels, with no glow. */
  fillPixels(path: Path2D, color: string, alpha = 1) {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = alpha * this.fade;
    c.fillStyle = color;
    c.fill(path);
    c.globalAlpha = 1;
    this.screen();
  }

  /** Nostalgia mode: a picture whose rows of '#' are pixels, with its top left corner on this whole pixel. */
  sprite(rows: readonly string[], px: number, py: number, color: string, alpha = 1) {
    const path = new Path2D();
    rows.forEach((row, r) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') path.rect(px + i, py + r, 1, 1); });
    this.fillPixels(path, color, alpha);
  }

  /** Nostalgia mode: a one pixel outline of a box given in the coordinates screen() draws in. */
  pixelFrame(x: number, y: number, w: number, h: number, color: string, alpha = 1) {
    const [x0, y0] = this.toPixel(x, y), [x1, y1] = this.toPixel(x + w, y + h), path = new Path2D();
    path.rect(x0, y0, x1 - x0 + 1, 1);
    path.rect(x0, y1, x1 - x0 + 1, 1);
    path.rect(x0, y0 + 1, 1, y1 - y0 - 1);
    path.rect(x1, y0 + 1, 1, y1 - y0 - 1);
    this.fillPixels(path, color, alpha);
  }

  /** Call when the frame is drawn: nostalgia mode brings it down to its few colours. */
  finish() {
    if (!this.retro) return;
    const { width, height } = this.canvas, image = this.ctx.getImageData(0, 0, width, height), d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = RETRO_LUT[d[i]];
      d[i + 1] = RETRO_LUT[d[i + 1]];
      d[i + 2] = RETRO_LUT[d[i + 2]];
    }
    this.ctx.putImageData(image, 0, 0);
  }

  /** Draw in CSS pixels from the play area's top left corner. */
  screen() { this.ctx.setTransform(this.dpr, 0, 0, this.dpr, this.dpr * this.ox, this.dpr * this.oy); }

  /** Draw in CSS pixels from the canvas's top left corner, free to leave the play area. */
  overlay() {
    if (this.clipped) { this.ctx.restore(); this.clipped = false; }
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** Stroke a path as a glowing tube: wide faint halo, tight glow, solid core, hot centre. */
  glow(path: Path2D, color: string, width = 0.8, intensity = 1) {
    const c = this.ctx, fade = this.fade;
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = color;
    c.globalAlpha = 0.06 * intensity * fade;
    c.lineWidth = width * 8;
    c.stroke(path);
    c.globalAlpha = 0.18 * intensity * fade;
    c.lineWidth = width * 3;
    c.stroke(path);
    c.globalAlpha = Math.min(1, intensity) * fade;
    c.lineWidth = width;
    c.stroke(path);
    c.globalAlpha = 0.55 * Math.min(1, intensity) * fade;
    c.strokeStyle = '#fff';
    c.lineWidth = width * 0.35;
    c.stroke(path);
    c.globalAlpha = 1;
  }

  /** Neon text in screen space (CSS px). */
  text(s: string, x: number, y: number, size: number, color = COLORS.hud, align: CanvasTextAlign = 'center', alpha = 1) {
    const c = this.ctx;
    if (this.retro) { this.retroText(s, x, y, size, color, align, alpha); return; }
    this.screen();
    c.globalCompositeOperation = 'lighter';
    c.font = `${size}px Audiowide, "Arial Black", sans-serif`;
    c.textAlign = align;
    c.textBaseline = 'middle';
    c.shadowColor = color;
    c.shadowBlur = size * 0.6;
    c.globalAlpha = alpha * this.fade;
    c.fillStyle = color;
    c.fillText(s, x, y);
    c.shadowBlur = 0;
    c.globalAlpha = 0.6 * alpha * this.fade;
    c.fillStyle = '#fff';
    c.fillText(s, x, y);
    c.globalAlpha = 1;
  }
}
