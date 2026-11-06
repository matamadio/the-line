// Draws the game world: the backdrop, the line with its creatures spliced in, and
// everything flying around it. Only reads the game's state; the HUD is in hud.ts.

import { COLORS, rand, smoothPath } from '../core/neon';
import { DIFF } from '../data/difficulty';
import { BUBBLE_GREEN } from './actors/bubble';
import type { Sinepede, Skirts } from './actors/sinepede';
import type { Game } from './game';
import { drawHud } from './hud';

export function drawGame(g: Game, dt: number) {
  const n = g.neon, c = n.ctx;
  n.begin(dt);
  drawBackdrop(g);
  n.world();
  const skirts = drawLine(g);
  for (const c of g.crumbles) c.draw(n, g.line);
  for (const s of g.sinepedes) s.drawFeatures(n, g.line, skirts.get(s));
  for (const u of g.urchins) u.drawFeatures(n, g.line);
  for (const w of g.worms) w.drawFeatures(n, g.line);
  for (const b of g.bubbles) b.drawFeatures(n, g.line);
  // A grown creature shows how many right waves it still takes, as dots off its tip.
  const pips = (x: number, y: number, count: number) => {
    const path = new Path2D();
    for (let i = 0; i < count; i++) {
      path.moveTo(x + (i - (count - 1) / 2) * 3.4 + 1.1, y);
      path.arc(x + (i - (count - 1) / 2) * 3.4, y, 1.1, 0, Math.PI * 2);
    }
    n.glow(path, COLORS.enemy, 0.6, 1.2);
  };
  for (const u of g.urchins) if (u.standing && u.size > 0) pips(u.x, g.line.sample(u.x) - u.tip - 5, u.size + 1);
  for (const e of g.worms) if (e.harmful && e.size > 0) pips(e.centre, g.line.sample(e.centre) + 9 * e.sc * e.squash + 5, e.size + 1);
  drawDrops(g);
  drawSparkles(g);
  drawBackwaves(g);
  drawRefluxes(g);
  g.wavell.drawFeatures(n, g.line);
  g.fx.draw(n);
  n.screen();
  c.globalCompositeOperation = 'source-over';
  drawHud(g);
}

function drawBackdrop(g: Game) {
  const n = g.neon, c = n.ctx;
  n.screen();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = '#fff4c0';
  for (const s of g.stars) {
    const x = (((s.x * n.w - n.camX * n.unit * s.z) % n.w) + n.w) % n.w;
    c.globalAlpha = (0.25 + 0.25 * Math.sin(g.time * 2 + s.p)) * s.z * 3;
    c.fillRect(x, s.y * n.lineY * 0.95, s.s, s.s);
  }
  c.globalAlpha = 1;
  // Two faint lines far away, scrolling slower: depth without clutter.
  for (const [off, par, amp, alpha] of [[70, 0.25, 7, 0.16], [42, 0.5, 4, 0.22]]) {
    const p = new Path2D();
    for (let x = -10; x <= n.w + 10; x += 6) {
      const wx = x / n.unit + n.camX * par;
      const y = n.lineY - off * n.unit + Math.sin(wx / 37 + g.time * 0.7) * amp * n.unit * Math.sin(wx / 113 + g.time * 0.3);
      if (x === -10) p.moveTo(x, y); else p.lineTo(x, y);
    }
    n.glow(p, COLORS.line, n.unit * 0.5, alpha);
  }
}

/**
 * The line, with Wavell and every creature spliced into the same stroke: the
 * characters are knots and waves of the line itself.
 */
function drawLine(g: Game): Map<Sinepede, Skirts> {
  const n = g.neon, L = g.line;
  const right = n.camX + n.viewW + 10;
  // A creature burning at the end of the line is its end: nothing runs under it.
  const left = Math.max(g.endX + 7, n.camX - 10, ...g.crumbles.map((c) => c.right));
  const path = new Path2D();
  interface Knot { pts: number[]; x0: number; x1: number; flash: number; solo?: boolean }
  const knots: Knot[] = [];
  for (const u of g.urchins) {
    const pts = u.outline(L);
    knots.push({ pts, x0: pts[0], x1: pts[pts.length - 2], flash: 0 });
  }
  for (const wm of g.worms) {
    const pts = wm.outline(L);
    knots.push({ pts, x0: pts[0], x1: pts[pts.length - 2], flash: wm.intensity - 1 });
  }
  for (const b of g.bubbles) {
    if (b.state !== 'grow') continue;
    const pts = b.outline(L);
    knots.push({ pts, x0: pts[0], x1: pts[pts.length - 2], flash: 0 });
  }
  // The bulge of a pull stops short of the next creature ahead.
  const f = g.wavell.facing;
  let room = Infinity;
  const ahead = (x0: number, x1: number) => {
    const d = f > 0 ? x0 - g.wavell.x : g.wavell.x - x1;
    if (d > 0) room = Math.min(room, d - 2);
  };
  for (const k of knots) ahead(k.x0, k.x1);
  for (const s of g.sinepedes) ahead(s.x, s.back);
  const w = g.wavell.stroke(L, room);
  // While he crumbles, what is left of him no longer joins the line.
  if (w) knots.push({ pts: w, x0: Math.min(w[0], w[w.length - 2]), x1: Math.max(w[0], w[w.length - 2]), flash: 0, solo: g.wavell.burning });
  // A Sinepede's shoulders share out the room on each side of it, so they never run into what is next to them.
  const skirts = new Map<Sinepede, Skirts>();
  const others = [...knots.map((k): [number, number] => [k.x0, k.x1]), ...g.sinepedes.map((s): [number, number] => [s.x, s.back])];
  for (const s of g.sinepedes) {
    let l = Infinity, r = Infinity;
    for (const [x0, x1] of others) {
      if (x0 === s.x && x1 === s.back) continue;
      if (x1 <= s.x) l = Math.min(l, s.x - x1);
      else if (x0 >= s.back) r = Math.min(r, x0 - s.back);
      else if (x0 + x1 < s.x + s.back) l = 0;
      else r = 0;
    }
    const sk: Skirts = [l / 2 - 1, r / 2 - 1];
    skirts.set(s, sk);
    const pts = s.outline(L, sk);
    knots.push({ pts, x0: pts[0], x1: pts[pts.length - 2], flash: s.intensity - 1 });
  }
  // Overlapping knots (a Worm biting Wavell) can't share the stroke: they are drawn on their own.
  const splice: Knot[] = [], solo: Knot[] = [];
  let lastEnd = -Infinity;
  for (const k of knots.sort((a, b) => a.x0 - b.x0)) {
    if ((k.solo ? k.x1 < n.camX - 10 : k.x1 < left) || k.x0 > right) continue;
    if (!k.solo && k.x0 > left && k.x0 > lastEnd + 1) { splice.push(k); lastEnd = k.x1; } else solo.push(k);
  }
  path.moveTo(left, L.sample(left));
  let i = Math.ceil((left - L.base) / L.spacing), next = 0;
  while (i < L.count) {
    const x = L.xAt(i), k = splice[next];
    if (k && x >= k.x0) {
      smoothPath(k.pts, path, false);
      i = Math.max(i, Math.ceil((k.x1 - L.base) / L.spacing));
      next++;
      continue;
    }
    if (x > right) break;
    path.lineTo(x, L.y[i]);
    i++;
  }
  n.glow(path, COLORS.line, 0.9, 1 + (DIFF.beatOn ? g.beat.flash * 1.6 : 0));
  for (const k of solo) n.glow(smoothPath(k.pts), COLORS.line, 0.9, 1 + k.flash);
  for (const k of splice) if (k.flash > 0.05) n.glow(smoothPath(k.pts), '#ffffff', 0.8, k.flash);
  // The frayed end of the line (not while he burns: then he is its end).
  const W = g.wavell;
  if (g.endX > n.camX - 20 && !(W.state === 'dead' && W.death === 'fall') && !g.crumbles.length) {
    const fray = new Path2D();
    for (let j = 0; j < 9; j++) {
      if (Math.random() < 0.15 + j * 0.06) continue;
      const x0 = g.endX + j * 1.8 - 9 + Math.random() * 0.6;
      fray.moveTo(x0, L.sample(x0) + rand(-0.6, 0.6));
      fray.lineTo(x0 + 0.9, L.sample(x0) + rand(-0.6, 0.6));
    }
    n.glow(fray, COLORS.line, 0.8, 0.9);
  }
  return skirts;
}

function drawDrops(g: Game) {
  if (!g.drops.length) return;
  const p = new Path2D();
  for (const d of g.drops) { p.moveTo(d.x, d.y); p.lineTo(d.x - d.vx * 0.02, d.y - d.vy * 0.02); }
  g.neon.glow(p, BUBBLE_GREEN, 1.1, 1);
}

function drawSparkles(g: Game) {
  const n = g.neon;
  for (const s of g.sparkles) {
    // Blinking out in its last second.
    if (s.life < 1 && Math.floor(s.life * 10) % 2 === 0) continue;
    const tw = 0.7 + 0.3 * Math.sin(g.time * 9 + s.p);
    const r = (s.gold ? 5 : 3.4) * tw * Math.min(1, (s.max - s.life) * 4);
    const p = new Path2D();
    // A four-pointed twinkle.
    p.moveTo(s.x - r, s.y); p.lineTo(s.x + r, s.y);
    p.moveTo(s.x, s.y - r); p.lineTo(s.x, s.y + r);
    const q = r * 0.4;
    p.moveTo(s.x - q, s.y - q); p.lineTo(s.x + q, s.y + q);
    p.moveTo(s.x - q, s.y + q); p.lineTo(s.x + q, s.y - q);
    n.glow(p, s.gold ? '#fff0a8' : '#ffe680', s.gold ? 0.8 : 0.6, s.gold ? 1.4 : 1);
  }
}

function drawBackwaves(g: Game) {
  const n = g.neon, L = g.line;
  for (const b of g.backwaves) {
    if (b.warn > 0) {
      if (Math.floor(b.warn * 8) % 2) continue;
      const x = Math.max(n.camX + 8, g.endX + 8), chev = new Path2D();
      for (const o of [0, 5, 10]) {
        chev.moveTo(x + o - 2, -6);
        chev.lineTo(x + o + 2, -1);
        chev.lineTo(x + o - 2, 4);
      }
      n.glow(chev, COLORS.danger, 0.8);
      continue;
    }
    if (b.done && b.dir > 0) continue;
    // Paint the crest orange while it is dangerous, white once bounced back.
    const crest: number[] = [];
    for (let x = Math.max(b.x - 16, g.endX); x <= b.x + 16; x += 2) crest.push(x, L.sample(x));
    n.glow(smoothPath(crest), b.dir > 0 ? COLORS.danger : '#ffffff', 1.1, 0.9);
  }
}

function drawRefluxes(g: Game) {
  const n = g.neon, L = g.line;
  for (const r of g.refluxes) {
    if (r.warn > 0) {
      if (Math.floor(r.warn * 8) % 2) continue;
      const x = n.camX + (r.dir > 0 ? 6 : n.viewW - 6), d = r.dir;
      const chev = new Path2D();
      for (const o of [0, 4]) {
        chev.moveTo(x - d * (2 - o), r.y - 3);
        chev.lineTo(x + d * (1 + o), r.y);
        chev.lineTo(x - d * (2 - o), r.y + 3);
      }
      n.glow(chev, COLORS.danger, 0.8);
      continue;
    }
    const x = n.camX + r.sx;
    const pts: number[] = [];
    // Its trail keeps the same distance from the line too.
    for (let k = 0; k <= 14; k++) {
      const tx = x - r.dir * k * 3;
      pts.push(tx, L.sample(tx) - r.side * r.dist + Math.sin(g.time * 30 + k * 0.9) * k * 0.22);
    }
    n.glow(smoothPath(pts), COLORS.danger, 0.8, 0.9);
    const core = new Path2D();
    core.moveTo(x - r.dir * 6, r.y);
    core.lineTo(x + r.dir * 1.5, r.y);
    n.glow(core, '#fff1b0', 1.6, 1.4);
  }
}
