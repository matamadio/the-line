// Sparks drawn as short glowing streaks, and floating score text.

import { Neon, rand } from '../core/neon';

interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; grav: number; drag: number }
interface Popup { x: number; y: number; text: string; life: number }

export class Fx {
  private sparks: Spark[] = [];
  private popups: Popup[] = [];

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

  popup(x: number, y: number, text: string) { this.popups.push({ x, y, text, life: 1 }); }

  clear() { this.sparks.length = 0; }

  update(dt: number) {
    for (const s of this.sparks) {
      s.vy += s.grav * dt;
      s.vx *= 1 - dt * s.drag;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
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
    for (const p of this.popups) {
      const [sx, sy] = neon.toScreen(p.x, p.y);
      neon.text(p.text, sx, sy, Math.max(14, neon.unit * 9), '#ffe34d', 'center', Math.min(1, p.life * 2));
      neon.world();
    }
  }
}
