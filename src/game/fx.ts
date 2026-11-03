// Sparks drawn as short glowing streaks, tumbling bits of broken line, and
// floating score text.

import { Neon } from '../core/neon';
import { TUNE } from '../data/tune';

interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; grav: number }
interface Popup { x: number; y: number; text: string; life: number }
/** A short piece of stroke: centre, half-length, angle, spin. */
interface Bit { x: number; y: number; h: number; a: number; va: number; vx: number; vy: number; life: number; max: number; color: string }

export class Fx {
  private sparks: Spark[] = [];
  private popups: Popup[] = [];
  private bits: Bit[] = [];

  spark(x: number, y: number, vx: number, vy: number, life: number, color: string, grav = 0) {
    if (this.sparks.length < 1500) this.sparks.push({ x, y, vx, vy, life, max: life, color, grav });
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

  /** Break the segment (x0, y0)-(x1, y1) off as a falling, spinning piece of line. */
  debris(x0: number, y0: number, x1: number, y1: number, color: string, kick = 1) {
    if (this.bits.length > 600) return;
    const life = 0.7 + Math.random() * 0.6;
    this.bits.push({
      x: (x0 + x1) / 2, y: (y0 + y1) / 2, h: Math.hypot(x1 - x0, y1 - y0) / 2, a: Math.atan2(y1 - y0, x1 - x0),
      va: (Math.random() - 0.5) * 14, vx: (Math.random() - 0.5) * 30 * kick, vy: -Math.random() * 25 * kick,
      life, max: life, color,
    });
  }

  clear() { this.sparks.length = 0; this.bits.length = 0; }

  update(dt: number) {
    for (const s of this.sparks) {
      s.vy += s.grav * dt;
      s.vx *= 1 - dt * 1.5;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    for (const b of this.bits) {
      // Each piece hangs where it broke off for a moment, then drops.
      if (b.max - b.life > TUNE.debrisHang) b.vy += TUNE.debrisGravity * dt;
      b.vx *= 1 - dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.a += b.va * dt;
      b.life -= dt;
    }
    this.bits = this.bits.filter((b) => b.life > 0);
    for (const p of this.popups) { p.y -= 22 * dt; p.life -= dt; }
    this.popups = this.popups.filter((p) => p.life > 0);
  }

  draw(neon: Neon) {
    const groups = new Map<string, Path2D[]>();
    // Bits cool from white-hot to the line's colour as they fall.
    for (const b of this.bits) {
      const k = b.life / b.max, fade = Math.ceil(k * 3);
      const key = (k > 0.9 ? '#ffffff' : b.color) + '|' + fade;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = [new Path2D()]));
      const dx = Math.cos(b.a) * b.h, dy = Math.sin(b.a) * b.h;
      g[0].moveTo(b.x - dx, b.y - dy);
      g[0].lineTo(b.x + dx, b.y + dy);
    }
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
