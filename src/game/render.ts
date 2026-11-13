// Draws the game world: the backdrop, the line with its creatures spliced in, and
// everything flying around it. Only reads the game's state; the HUD is in hud.ts.

import { COLORS, rand, smoothPath } from '../core/neon';
import { DIFF } from '../data/difficulty';
import { BUBBLE_GREEN } from './actors/bubble';
import type { Sinepede, Skirts } from './actors/sinepede';
import type { Game } from './game';
import { drawHud } from './hud';
import { END_WORD, END_WORD_SCALE, endWordX } from './endWord';
import { strokeWord } from './lettering';
import { BACK_LINES, backWave, depthScale } from './menu';


/** THE LINE CONTINUES on screen, as flat points riding a line: base(x) is the line's y at x px. */
function endWordPoints(viewW: number, t: number, base: (x: number) => number, u: number): number[] {
  const { pts } = strokeWord(END_WORD), c = endWordX(viewW, t) * u, k = END_WORD_SCALE * u, out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const x = c + pts[i] * k;
    out.push(x, base(x) + pts[i + 1] * k);
  }
  return out;
}

export function drawGame(g: Game, dt: number) {
  const n = g.neon, c = n.ctx;
  n.begin(dt);
  drawBackdrop(g);
  g.menu.drawBehind();
  // On the menu the real line may be on its way to the front, or past it.
  const z = g.mode === 'title' ? g.menu.z : 0;
  n.setDepth(depthScale(z), g.menu.riseAt(z) * n.unit);
  n.fade = g.menu.alphaAt(z);
  n.blur = g.menu.blurAt(z);
  n.world();
  const skirts = drawLine(g);
  for (const c of g.crumbles) c.draw(n, g.line);
  for (const s of g.sinepedes) s.drawFeatures(n, g.line, skirts.get(s));
  for (const u of g.urchins) u.drawFeatures(n, g.line);
  for (const w of g.worms) w.drawFeatures(n, g.line);
  for (const b of g.bubbles) b.drawFeatures(n, g.line);
  g.boss?.drawFeatures(n, g.line, g.wavell.x);
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
  drawTidals(g);
  drawRefluxes(g);
  g.wavell.drawFeatures(n, g.line);
  g.fx.draw(n);
  n.setDepth();
  n.fade = 1;
  n.blur = 0;
  n.screen();
  g.menu.drawFront();
  n.screen();
  c.globalCompositeOperation = 'source-over';
  drawHud(g);
  n.finish();
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
  // Two faint lines far away, scrolling slower: depth without clutter. The menu has lines of its own.
  n.fade = g.quiet || g.menu.backdropShows ? 1 : 0;
  BACK_LINES.forEach((line, i) => {
    const u = n.unit, base = (x: number) => n.lineY - line.off * u + backWave(line, x / u + n.camX, n.camX, g.time) * u;
    // After the boss the nearest one writes THE LINE CONTINUES, going by from right to left.
    const word = i === 0 && g.endWord >= 0 ? endWordPoints(n.viewW, g.endWord, base, u) : null;
    const p = new Path2D();
    p.moveTo(-10, base(-10));
    // The word is written once: past it, the line simply goes on.
    let written = !word;
    for (let x = -10; x <= n.w + 10; x += 6) {
      if (!written && x >= word![0]) {
        written = true;
        smoothPath(word!, p, false);
        x = word![word!.length - 2];
      }
      p.lineTo(x, base(x));
    }
    // The letters are the line itself: the same colour and brightness.
    n.glow(p, COLORS.line, u * 0.5, line.alpha);
  });
  n.fade = 1;
}

/**
 * The line, with Wavell and every creature spliced into the same stroke: the
 * characters are knots and waves of the line itself.
 */
function drawLine(g: Game): Map<Sinepede, Skirts> {
  const n = g.neon, L = g.line;
  const right = n.camX + n.viewW + 10 + n.depthPad;
  // A creature burning at the end of the line is its end: nothing runs under it.
  const left = Math.max(g.endX + 7, n.camX - 10 - n.depthPad, ...g.crumbles.map((c) => c.right));
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
  // The boss is the line itself, bent into his shape.
  if (g.boss && !g.boss.done) {
    const pts = g.boss.outline(L);
    knots.push({ pts, x0: pts[0], x1: pts[pts.length - 2], flash: g.boss.flash });
  }
  // The menu's word is written by the line itself.
  const word = g.menu.wordOnRealLine();
  if (word) knots.push({ pts: word, x0: word[0], x1: word[word.length - 2], flash: 0 });
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
  // Just let go of by Wavell's bubble, the line is broken for a moment.
  const gap = g.wavell.snap;
  let broken = false;
  while (i < L.count) {
    const x = L.xAt(i), k = splice[next];
    if (k && x >= k.x0) {
      smoothPath(k.pts, path, false);
      i = Math.max(i, Math.ceil((k.x1 - L.base) / L.spacing));
      next++;
      continue;
    }
    if (x > right) break;
    if (Math.abs(x - g.wavell.x) < gap) broken = true;
    else if (broken) { path.moveTo(x, L.y[i]); broken = false; }
    else path.lineTo(x, L.y[i]);
    i++;
  }
  const width = g.menu.lineWidthAt(g.mode === 'title' ? g.menu.z : 0);
  n.glow(path, COLORS.line, width, 1 + (DIFF.beatOn ? g.beat.flash * 1.6 : 0));
  for (const k of solo) n.glow(smoothPath(k.pts), COLORS.line, width, 1 + k.flash);
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

/** The boss's tidal waves: orange coming in, white once sent back at him. */
function drawTidals(g: Game) {
  const n = g.neon, L = g.line;
  for (const t of g.tidals) {
    if (t.done && t.dir < 0) continue;
    const crest: number[] = [];
    for (let x = Math.max(t.x - 22, g.endX); x <= t.x + 22; x += 2) crest.push(x, L.sample(x));
    if (crest.length < 4) continue;
    const color = t.dir < 0 ? COLORS.danger : '#ffffff';
    n.glow(smoothPath(crest), color, 1.3, 1);
    // Its lip curls over the way it rolls, with a twist of foam under it.
    const d = t.dir, x = t.x, y = L.sample(x), wob = Math.sin(g.time * 14) * 0.8;
    const lip = new Path2D();
    lip.moveTo(x - d * 4, y + 1);
    lip.quadraticCurveTo(x + d * 4, y - 6, x + d * 10, y - 1 + wob);
    lip.quadraticCurveTo(x + d * 12, y + 4, x + d * 8, y + 6);
    lip.quadraticCurveTo(x + d * 5, y + 7, x + d * 5.5, y + 4.5);
    n.glow(lip, color, 1.1, 1);
    const foam = new Path2D();
    for (let i = 0; i < 4; i++) {
      const fx = x + d * (2 + i * 2.5), fy = y + 3 + Math.sin(g.time * 9 + i * 2) * 1.5;
      foam.moveTo(fx + 0.9, fy);
      foam.arc(fx, fy, 0.9, 0, Math.PI * 2);
    }
    n.glow(foam, '#ffffff', 0.5, 0.8);
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
