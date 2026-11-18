// Draws the game world: the backdrop, the line with its creatures spliced in, and
// everything flying around it. Only reads the game's state; the HUD is in hud.ts.

import { COLORS, type Neon, rand, smoothPath } from '../core/neon';
import { TUNE } from '../data/tune';
import { wildHue } from './actors/rage';
import { DIFF } from '../data/difficulty';
import { BUBBLE_GREEN } from './actors/bubble';
import type { Sinepede, Skirts } from './actors/sinepede';
import type { Game } from './game';
import { drawHud } from './hud';
import { END_WORD_SCALE, endWordX } from './endWord';
import { strokeWord } from './lettering';
import { BACK_LINES, TALL_LINES, backWave, depthScale } from './menu';


/** A word on the line behind on screen, as flat points riding it: base(x) is the line's y at x px. */
function endWordPoints(word: string, viewW: number, t: number, base: (x: number) => number, u: number): number[] {
  const { pts } = strokeWord(word), c = endWordX(viewW, t, word) * u, k = END_WORD_SCALE * u, out: number[] = [];
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
  g.orca?.drawFeatures(n, g.line);
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
  drawRage(g);
  drawSparkles(g);
  drawWhiplashes(g);
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
    // Upright, the sky goes on above and below the play area, and so do the stars.
    const y = n.above + n.below > 0 ? s.y * (n.h + n.above + n.below) - n.above : s.y * n.lineY * 0.95;
    c.fillRect(x, y, s.s, s.s);
  }
  c.globalAlpha = 1;
  // Two faint lines far away, scrolling slower: depth without clutter. The menu has lines of its own.
  // Upright, two more, further still, in the sky above and below the play area.
  if (n.above > 0 || n.below > 0) for (const line of TALL_LINES) {
    const u = n.unit, p = new Path2D();
    for (let x = -10; x <= n.w + 10; x += 6) {
      const y = n.lineY - line.off * u + backWave(line, x / u + n.camX, n.camX, g.time) * u;
      if (x === -10) p.moveTo(x, y); else p.lineTo(x, y);
    }
    n.glow(p, COLORS.line, u * 0.45, line.alpha);
  }
  n.fade = g.quiet || g.menu.backdropShows ? 1 : 0;
  BACK_LINES.forEach((line, i) => {
    const u = n.unit, base = (x: number) => n.lineY - line.off * u + backWave(line, x / u + n.camX, n.camX, g.time) * u;
    // The nearest one writes the level as it starts, and THE LINE CONTINUES after the boss, going by from right to left.
    const word = i === 0 && g.endWord >= 0 ? endWordPoints(g.lineWord, n.viewW, g.endWord, base, u) : null;
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
    n.blur = line.blur;
    n.glow(p, COLORS.line, u * 0.5, line.alpha);
    n.blur = 0;
  });
  n.fade = 1;
}

/**
 * The line, with Wavell and every creature spliced into the same stroke: the
 * characters are knots and waves of the line itself.
 */
/** A stroke in Rage's colours: in pieces, each its own colour, every colour jumping about all the time. */
function drawWild(n: Neon, pts: number[], t: number, width: number, intensity: number, flicker = true) {
  const pieces = 5, per = Math.ceil(pts.length / 2 / pieces);
  for (let p = 0; p < pieces; p++) {
    const part = pts.slice(p * per * 2, Math.min(pts.length, ((p + 1) * per + 1) * 2));
    if (part.length < 4) continue;
    const light = flicker ? 62 + 10 * Math.sin(t * 19 + p) : 76;
    n.glow(smoothPath(part), wildHue(t, p, light), width, intensity + 0.5 * Math.sin(t * 17 + p * 1.3));
  }
}

function drawLine(g: Game): Map<Sinepede, Skirts> {
  const n = g.neon, L = g.line;
  const right = n.camX + n.viewW + 10 + n.depthPad;
  // A creature burning at the end of the line is its end: nothing runs under it.
  const left = Math.max(g.endX + 7, n.camX - 10 - n.depthPad, ...g.crumbles.map((c) => c.right));
  const path = new Path2D();
  interface Knot { pts: number[]; x0: number; x1: number; flash: number; solo?: boolean; wild?: boolean }
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
  // The Killerwave is the line too, risen up into an orca.
  if (g.orca) {
    const pts = g.orca.outline(L);
    if (pts.length >= 4) knots.push({ pts, x0: pts[0], x1: pts[pts.length - 2], flash: 0 });
  }
  // The menu's word is written by the line itself.
  const word = g.menu.wordOnRealLine();
  const wordKnot: Knot | null = word ? { pts: word, x0: word[0], x1: word[word.length - 2], flash: 0 } : null;
  if (wordKnot) knots.push(wordKnot);
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
  // A long word (FLATTEN) runs flat a long way in front of its letters, back into him: the
  // stroke can't splice in two knots that overlap, and the plain line would show under the
  // word. That flat stretch is only the line, so it starts where he ends instead.
  if (wordKnot && w) {
    const wx1 = Math.max(w[0], w[w.length - 2]) + 1.5;
    let cut = 0;
    while (cut + 4 < wordKnot.pts.length && wordKnot.pts[cut] < wx1 && Math.abs(wordKnot.pts[cut + 1] - L.sample(wordKnot.pts[cut])) < 0.5) cut += 2;
    if (cut > 0) { wordKnot.pts = wordKnot.pts.slice(cut); wordKnot.x0 = wordKnot.pts[0]; }
  }
  // While he crumbles, what is left of him no longer joins the line.
  if (w) knots.push({ pts: w, x0: Math.min(w[0], w[w.length - 2]), x1: Math.max(w[0], w[w.length - 2]), flash: 0, solo: g.wavell.burning || g.wavell.state === 'ride', wild: g.wavell.rageT >= 0 && g.wavell.alive });
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
      // In Rage's colours he is drawn on his own; the line jumps from toe to toe.
      if (k.wild) path.moveTo(k.pts[k.pts.length - 2], k.pts[k.pts.length - 1]);
      else smoothPath(k.pts, path, false);
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
  for (const k of solo) if (!k.wild) n.glow(smoothPath(k.pts), COLORS.line, width, 1 + k.flash);
  for (const k of [...splice, ...solo]) if (k.wild) drawWild(n, k.pts, g.time, width, 1.3, false);
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

/** A sparkle twinkles in over this long (s), and shrinks away over the last SPARKLE_OUT of its life. */
export const SPARKLE_IN = 0.35;
export const SPARKLE_OUT = 0.4;
export const sparkleColor = (gold: boolean) => (gold ? '#fff0a8' : '#ffe680');

function drawSparkles(g: Game) {
  const n = g.neon;
  for (const s of g.sparkles) {
    const age = s.max - s.life, color = sparkleColor(s.gold);
    // Blinking in its last second, until it starts to shrink away.
    if (s.life < 1 && s.life > SPARKLE_OUT && Math.floor(s.life * 10) % 2 === 0) continue;
    // Twinkling in: it spins open from nothing, a little too big at first, with a ring of light
    // going out from it. Going: it spins shut, flaring as it shrinks.
    const k = Math.min(1, age / SPARKLE_IN), out = Math.min(1, s.life / SPARKLE_OUT);
    const grow = k < 1 ? 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2) : 1;
    const shrink = out * out * (3 - 2 * out);
    const spin = (1 - k) * Math.PI * 0.9 - (1 - out) * Math.PI * 1.2;
    const tw = 0.7 + 0.3 * Math.sin(g.time * 9 + s.p);
    const r = (s.gold ? 5 : 3.4) * tw * grow * shrink;
    if (r <= 0.05) continue;
    const cs = Math.cos(spin), sn = Math.sin(spin);
    const P = (lx: number, ly: number): [number, number] => [s.x + lx * cs - ly * sn, s.y + lx * sn + ly * cs];
    const p = new Path2D();
    const ray = (ax: number, ay: number) => { p.moveTo(...P(-ax, -ay)); p.lineTo(...P(ax, ay)); };
    // A four-pointed twinkle.
    const q = r * 0.4;
    ray(r, 0); ray(0, r); ray(q, q); ray(q, -q);
    n.glow(p, color, s.gold ? 0.8 : 0.6, (s.gold ? 1.4 : 1) * (1 + 0.8 * (1 - out)));
    if (k < 1) {
      const ring = new Path2D();
      ring.arc(s.x, s.y, (s.gold ? 5 : 3.4) * (0.6 + 2.4 * k), 0, Math.PI * 2);
      n.glow(ring, color, 0.4, 1 - k);
    }
  }
}

function drawWhiplashes(g: Game) {
  const n = g.neon, L = g.line;
  for (const b of g.whiplashes) {
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

/** The Rage knot, hot pink and never still, blinking out at the end; and the crests of its waves. */
function drawRage(g: Game) {
  const n = g.neon, L = g.line, k = g.knot;
  if (k && !(k.waiting && k.life < 2 && Math.floor(k.life * 8) % 2 === 0)) {
    drawWild(n, k.points(L), k.t, 0.6, k.waiting ? 1.2 : 1.8, k.waiting);
  }
  for (const r of g.rageWaves) {
    if (r.delay > 0) continue;
    const crest: number[] = [];
    for (let x = r.x - 24; x <= r.x + 24; x += 2) crest.push(x, L.sample(x));
    n.glow(smoothPath(crest), '#ffd0e0', 1.3, 1.1);
  }
}

/** The boss's tidal waves: orange coming in, white once sent back at him. Their splash is in fx (see updateTidals). */
function drawTidals(g: Game) {
  const n = g.neon, L = g.line;
  for (const t of g.tidals) {
    if (t.done && t.dir < 0) continue;
    const crest: number[] = [];
    const span = TUNE.tidalCrest;
    for (let x = Math.max(t.x - span, g.endX); x <= t.x + span; x += 2) crest.push(x, L.sample(x));
    const color = t.dir < 0 ? COLORS.danger : '#ffffff';
    if (crest.length >= 4) n.glow(smoothPath(crest), color, 1.3, 1);
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
