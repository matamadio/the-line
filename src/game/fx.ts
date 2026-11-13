// Sparks drawn as short glowing streaks, drops of water drawn as teardrops, and floating score text.

import { Neon, rand } from '../core/neon';

interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; grav: number; drag: number }
/** A drop of water thrown up: a round head with a tail drawn out behind it, the faster the longer. */
interface Drop { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; color: string; grav: number; stretch: number; floor: number }
interface Popup { x: number; y: number; text: string; life: number }

export class Fx {
  private sparks: Spark[] = [];
  private popups: Popup[] = [];
  private drops: Drop[] = [];

  spark(x: number, y: number, vx: number, vy: number, life: number, color: string, grav = 0, drag = 1.5) {
    if (this.sparks.length < 1500) this.sparks.push({ x, y, vx, vy, life, max: life, color, grav, drag });
  }

  /**
   * A piece of something coming apart: it drifts off at a steady speed, in any direction
   * between these two angles, and fades where it is.
   */
  disperse(x: number, y: number, color: string, from = 0, to = Math.PI * 2) {
    const a = rand(from, to), s = rand(15, 35);
    this.spark(x, y, Math.cos(a) * s, Math.sin(a) * s, 1.1, color, 0, 0);
  }

  burst(x: number, y: number, n: number, speed: number, color: string, grav = 0, life = 0.6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      this.spark(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.5 + Math.random() * 0.5), color, grav);
    }
  }

  /** Turn a figure (flat world points) into sparks. */
  shatter(points: number[], color: string, spread: number, grav: number, vy0 = 0) {
    for (let i = 0; i < points.length; i += 2) {
      const a = Math.random() * Math.PI * 2, s = spread * Math.random();
      this.spark(points[i], points[i + 1], Math.cos(a) * s, Math.sin(a) * s + vy0, 0.7 + Math.random() * 0.7, color, grav);
    }
  }

  /** A drop of water of radius r, thrown up and falling back, gone when it lands on floor (a y). stretch: how long its tail can draw out, in radii (a jet is long). */
  drop(x: number, y: number, vx: number, vy: number, r: number, life: number, color: string, grav = 220, stretch = 5, floor = Infinity) {
    if (this.drops.length < 500) this.drops.push({ x, y, vx, vy, r, life, max: life, color, grav, stretch, floor });
  }

  /**
   * A wave crashing down on a stretch of line, x0 to x1 (ground: the line's y at x): tall
   * jets of water shoot up all along it, fanning out from the middle, with a spray of round
   * drops among them, and they all fall back. size: how big, 1 for a wave 50 u high.
   */
  splash(x0: number, x1: number, ground: (x: number) => number, color: string, size = 1) {
    const mid = (x0 + x1) / 2, half = Math.max(1, (x1 - x0) / 2);
    for (let i = 0; i < 18; i++) {
      const x = rand(x0, x1), out = (x - mid) / half;
      this.drop(x, ground(x) - rand(1, 6) * size, out * rand(30, 90) * size, -rand(150, 260) * size, rand(1.2, 2.2) * size, rand(1, 1.6), color, 240, 12, ground(x));
    }
    for (let i = 0; i < 90; i++) {
      const x = rand(x0 - 8, x1 + 8), out = (x - mid) / half;
      this.drop(x, ground(x) - rand(2, 16) * size, out * rand(20, 110) * size + rand(-20, 20), -rand(60, 230) * size, rand(0.5, 1.6) * size, rand(0.9, 2), color, 210, 5, ground(x));
    }
  }

  popup(x: number, y: number, text: string) { this.popups.push({ x, y, text, life: 1 }); }

  clear() { this.sparks.length = 0; this.drops.length = 0; }

  update(dt: number) {
    for (const s of this.sparks) {
      s.vy += s.grav * dt;
      s.vx *= 1 - dt * s.drag;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    for (const d of this.drops) {
      d.vy += d.grav * dt;
      d.vx *= 1 - dt * 0.6;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life -= dt;
      // Back down on the line it was thrown up from: it is gone into it.
      if (d.vy > 0 && d.y > d.floor) d.life = 0;
    }
    this.drops = this.drops.filter((d) => d.life > 0);
    for (const p of this.popups) { p.y -= 22 * dt; p.life -= dt; }
    this.popups = this.popups.filter((p) => p.life > 0);
  }

  draw(neon: Neon) {
    const groups = new Map<string, Path2D[]>();
    for (const s of this.sparks) {
      const fade = Math.ceil((s.life / s.max) * 3);
      const key = s.color + '|' + fade;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = [new Path2D()]));
      g[0].moveTo(s.x, s.y);
      g[0].lineTo(s.x - s.vx * 0.025, s.y - s.vy * 0.025 + 0.01);
    }
    for (const [key, [path]] of groups) {
      const [color, fade] = key.split('|');
      neon.glow(path, color, 0.6, Number(fade) / 3);
    }
    // Each drop: its tail points back the way it came, its head round in front.
    const wet = new Map<string, Path2D>();
    for (const d of this.drops) {
      const fade = Math.ceil(Math.min(1, (d.life / d.max) * 1.6) * 3), key = d.color + '|' + fade;
      let path = wet.get(key);
      if (!path) wet.set(key, (path = new Path2D()));
      const speed = Math.hypot(d.vx, d.vy), a = Math.atan2(d.vy, d.vx), tail = Math.min(d.r * d.stretch, d.r + speed * 0.03);
      const tx = d.x - Math.cos(a) * tail, ty = d.y - Math.sin(a) * tail;
      path.moveTo(tx, ty);
      path.arc(d.x, d.y, d.r, a - Math.PI / 2, a + Math.PI / 2);
      path.lineTo(tx, ty);
    }
    for (const [key, path] of wet) {
      const [color, fade] = key.split('|');
      neon.glow(path, color, 0.6, Number(fade) / 3);
    }
    for (const p of this.popups) {
      const [sx, sy] = neon.toScreen(p.x, p.y);
      neon.text(p.text, sx, sy, Math.max(14, neon.unit * 9), '#ffe34d', 'center', Math.min(1, p.life * 2));
      neon.world();
    }
  }
}
