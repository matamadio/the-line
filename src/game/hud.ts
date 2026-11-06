// Everything drawn over the world in screen space: score, lives, the lead gauge,
// title and game over screens, the on-screen buttons and the touch controls.

import { canFullscreen, canInstall, isFullscreen } from '../core/app';
import { COLORS, Neon, clamp } from '../core/neon';
import { sfx } from '../core/sfx';
import { DIFF } from '../data/difficulty';
import type { Game } from './game';
import { MORPH_TIME, drawFlatlined, drawMorph, drawTitle } from './title';

/** The HUD's base size: a share of the play area, so it lays out the same on every screen. */
const hudSize = (n: Neon) => n.h * 0.045;

/** The hints the start screen takes turns showing. */
const TITLE_HINTS = [
  'THE LINE IS CONSUMING: RUN FOR YOUR LIFE',
  'USE PULL OR WIPE',
  'OPPOSITE WAVES CANCEL EACH OTHER',
  'SAME-SIDE WAVES SUM UP AND DEFLECT',
  'SPARKLES GROW IN YOU',
  'BUBBLE IS FAST BUT NOT SAFE',
  'THE END OF THE LINE GETS CLOSER AND CLOSER',
  'BIGGER SIZE MEANS FASTER WALK',
  'RUN!',
];
/** Seconds each hint stays, and how long it takes to fade in and out. */
const HINT_TIME = 5, HINT_FADE = 0.3;

/** The start screen's box of links for developers, down to the left. */
const DEV_LINKS = [
  { label: 'gameplay settings', url: 'difficulty.html' },
  { label: 'animation editor', url: 'lab.html' },
];

/** The dev menu's box on screen, and the height of its heading and of each link. */
function devBox(n: Neon) {
  const s = hudSize(n), row = s, w = s * 6.8, h = row * (DEV_LINKS.length + 1) + s * 0.3, pad = s * 0.8;
  return { s, row, x: pad, y: n.h - pad - h, w, h };
}

/** Is this point in the dev menu's box? */
export function inDevMenu(n: Neon, x: number, y: number) {
  const b = devBox(n);
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

/** The page of the dev menu's link at this point, if any. */
export function devLinkAt(n: Neon, x: number, y: number): string | null {
  if (!inDevMenu(n, x, y)) return null;
  const b = devBox(n);
  return DEV_LINKS[Math.floor((y - b.y - b.row * 1.15) / b.row)]?.url ?? null;
}

function drawDevMenu(g: Game) {
  const n = g.neon, b = devBox(n), c = n.ctx, tx = b.x + b.s * 0.45;
  n.screen();
  const box = new Path2D();
  box.rect(b.x, b.y, b.w, b.h);
  n.glow(box, '#c9a640', 1, 0.35);
  n.text('DEV', tx, b.y + b.row * 0.65, b.s * 0.42, '#c9a640', 'left', 0.75);
  const hover = devLinkAt(n, g.input.mouseX - n.ox, g.input.mouseY - n.oy);
  DEV_LINKS.forEach((l, i) => n.text(l.label, tx, b.y + b.row * (1.65 + i), b.s * 0.5, hover === l.url ? COLORS.hud : '#c9a640', 'left', hover === l.url ? 1 : 0.8));
  c.canvas.style.cursor = hover ? 'pointer' : '';
}

/**
 * The mute button on screen: [x, y, radius]. Up by the score rather than at the bottom,
 * where the right thumb swipes.
 */
export function muteButton(n: Neon): [number, number, number] {
  const s = hudSize(n);
  return [n.w - s * 1.4, s * 3.3, s * 0.9];
}

/** The fullscreen button on screen, beside the mute button. */
export function fullscreenButton(n: Neon): [number, number, number] {
  const s = hudSize(n);
  return [n.w - s * 3.6, s * 3.3, s * 0.9];
}

function drawFullscreen(n: Neon) {
  const [x, y, r] = fullscreenButton(n), p = new Path2D(), a = r * 0.6, b = r * 0.25;
  // Four corners, pointing out to go fullscreen and in to come back.
  const out = isFullscreen() ? -1 : 1;
  for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const cx = x + i * (out > 0 ? a : b), cy = y + j * (out > 0 ? a : b), d = (a - b) * out;
    p.moveTo(cx - i * d, cy);
    p.lineTo(cx, cy);
    p.lineTo(cx, cy - j * d);
  }
  n.glow(p, '#c9a640', 1.4, 0.7);
}

/** The install button's box on screen, down to the right of the start screen. */
function installBox(n: Neon) {
  const s = hudSize(n), w = s * 5.6, h = s * 1.3, pad = s * 0.8;
  return { s, x: n.w - pad - w, y: n.h - pad - h, w, h };
}

export function inInstallButton(n: Neon, x: number, y: number) {
  const b = installBox(n);
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

function drawInstall(g: Game) {
  const n = g.neon, b = installBox(n);
  const hover = inInstallButton(n, g.input.mouseX - n.ox, g.input.mouseY - n.oy);
  const box = new Path2D();
  box.rect(b.x, b.y, b.w, b.h);
  n.glow(box, '#c9a640', 1, hover ? 0.7 : 0.35);
  n.screen();
  n.text('install app', b.x + b.w / 2, b.y + b.h / 2, b.s * 0.5, hover ? COLORS.hud : '#c9a640', 'center', hover ? 1 : 0.8);
  if (hover) n.ctx.canvas.style.cursor = 'pointer';
  if (g.time < g.installNote) n.text('Share menu, then Add to Home Screen', b.x + b.w, b.y - b.s * 0.6, b.s * 0.5, COLORS.hud, 'right');
}

/** A chevron at (x, y), pointing the way (dx, dy) says. */
function chevron(n: Neon, x: number, y: number, dx: number, dy: number, size: number, color: string, alpha: number) {
  const p = new Path2D();
  p.moveTo(x - dx * size * 0.5 - dy * size, y - dy * size * 0.5 - dx * size);
  p.lineTo(x + dx * size * 0.5, y + dy * size * 0.5);
  p.lineTo(x - dx * size * 0.5 + dy * size, y - dy * size * 0.5 + dx * size);
  n.glow(p, color, 1.5, alpha);
}

/** The thumbs' controls. They may use the empty space around the play area. */
function drawTouch(g: Game) {
  const n = g.neon, inp = g.input;
  n.overlay();
  const r = Math.min(n.fullW, n.fullH) * 0.11, gap = r * 1.2, size = r * 0.26;
  // Left thumb: a stick that walks, floats and goes through the line.
  const st = inp.stick;
  const ox = st ? st.ox : r * 1.6, oy = st ? st.oy : n.fullH - r * 1.6;
  const base = new Path2D();
  base.arc(ox, oy, r, 0, Math.PI * 2);
  n.glow(base, '#c9a640', 1.5, st ? 0.6 : 0.3);
  const kx = st ? clamp(st.x - ox, -r, r) + ox : ox, ky = st ? clamp(st.y - oy, -r, r) + oy : oy;
  const knob = new Path2D();
  knob.arc(kx, ky, r * 0.38, 0, Math.PI * 2);
  n.glow(knob, COLORS.hud, 1.5, st ? 0.9 : 0.35);
  for (const d of [-1, 1]) chevron(n, ox, oy + d * gap, 0, d, size, '#c9a640', 0.3 + (Math.sign(inp.stickFlash) === d ? Math.abs(inp.stickFlash) * 0.7 : 0));
  inp.stickFlash *= 0.9;
  // Right thumb: the swipes. They follow the thumb.
  const sw = inp.swipe;
  const ax = sw ? sw.ox : n.fullW - r * 1.8, ay = sw ? sw.oy : n.fullH - r * 1.7;
  const dot = new Path2D();
  dot.arc(ax, ay, r * 0.3, 0, Math.PI * 2);
  n.glow(dot, COLORS.hud, 1.5, sw ? 0.7 : 0.3);
  for (const d of [-1, 1]) {
    chevron(n, ax, ay + d * gap, 0, d, size, COLORS.hud, 0.3 + inp.dragFlash * 0.7);
    chevron(n, ax + d * gap, ay, d, 0, size, '#9fe8ff', 0.3 + inp.pullFlash * 0.7);
  }
  inp.dragFlash *= 0.9;
  inp.pullFlash *= 0.9;
}

/** The edge of the play area, and on a phone held upright, a word about turning it. */
function drawSurround(g: Game) {
  const n = g.neon;
  n.overlay();
  if (n.ox > 0 || n.oy > 0) {
    const p = new Path2D();
    p.rect(n.ox, n.oy, n.w, n.h);
    n.glow(p, '#5a4a20', 0.8, 0.5);
  }
  if (n.fullH > n.fullW) n.text('turn the phone for a bigger view', n.w / 2, -n.oy / 2, Math.max(13, n.unit * 8), '#c9a640', 'center', 0.8);
}

/** The four beats of the bar, as dots ending at x, with the current one lit. */
function drawBar(g: Game, x: number, y: number, s: number) {
  for (let i = 0; i < 4; i++) {
    const p = new Path2D(), r = s * 0.13, cx = x - (3 - i) * s * 0.6 - r;
    p.arc(cx, y, r, 0, Math.PI * 2);
    g.neon.glow(p, COLORS.hud, 1.2, i === g.beat.beatOfBar ? 1.4 : 0.25);
  }
}

/** How much line is left behind Wavell before the break: the time you have. */
function drawLead(g: Game, x: number, y: number, s: number) {
  const n = g.neon, W = g.wavell;
  const lead = clamp((W.x - g.endX) / DIFF.endLead, 0, 1);
  const w = s * 6.5;
  const color = lead > 0.5 ? COLORS.hud : lead > 0.25 ? COLORS.danger : '#ff3b30';
  if (lead < 0.25 && Math.floor(g.time * 6) % 2 === 0 && g.mode === 'play') return;
  const back = new Path2D();
  back.moveTo(x, y); back.lineTo(x + w, y);
  n.glow(back, '#5a4a20', 1.2, 0.6);
  const bar = new Path2D();
  bar.moveTo(x + w * (1 - lead), y); bar.lineTo(x + w, y);
  n.glow(bar, color, 2, 1);
  // A little frayed end at the left of the bar.
  const fr = new Path2D();
  const fx = x + w * (1 - lead);
  for (const o of [-3, -6]) { fr.moveTo(fx + o, y - 1); fr.lineTo(fx + o + 1.5, y + 1); }
  n.glow(fr, color, 1.2, 0.8);
}

/**
 * The size counter: a circle for each size he can reach. A whole one, with a face, is a
 * hit he can take; the next one draws itself round, a slice for each sparkle caught.
 */
function drawSizes(g: Game, x: number, y: number) {
  const n = g.neon, W = g.wavell, top = -Math.PI / 2;
  for (let i = 0; i < DIFF.growMax; i++) {
    const cx = x + i * 11, whole = i < W.size;
    const ring = new Path2D();
    ring.arc(cx, y, 4, 0, Math.PI * 2);
    n.glow(ring, COLORS.wavell, 0.4, whole ? 0 : 0.22);
    if (whole) {
      const p = new Path2D();
      p.arc(cx, y, 4, 0, Math.PI * 2);
      p.moveTo(cx - 2.2, y - 1.4); p.lineTo(cx - 0.8, y - 0.8);
      p.moveTo(cx + 2.2, y - 1.4); p.lineTo(cx + 0.8, y - 0.8);
      n.glow(p, COLORS.wavell, 0.6);
    } else if (i === W.size && W.sparks > 0) {
      const p = new Path2D();
      p.arc(cx, y, 4, top, top + Math.PI * 2 * W.sparks / DIFF.sparksPerSize);
      n.glow(p, COLORS.wavell, 0.6);
    }
  }
}

export function drawHud(g: Game) {
  const n = g.neon, c = n.ctx, inp = g.input;
  const s = hudSize(n), pad = s * 0.9;
  const cx = n.w / 2, hudFade = g.titleDust?.hudFade ?? 1;
  if (g.mode === 'title' && g.morphT < MORPH_TIME) drawMorph(n, g.morphT, g.time);
  else if (g.mode === 'title') {
    drawTitle(n, g.time);
    const blink = 0.55 + 0.45 * Math.sin(g.time * 4);
    n.text(inp.touchUsed || matchMedia('(pointer: coarse)').matches ? 'tap to start' : 'press any key', cx, n.lineY + s * 3.2, s, COLORS.hud, 'center', blink);
    const help = matchMedia('(pointer: coarse)').matches
      ? ['left thumb: walk  ·  down: through the line  ·  up: float / back up', 'right thumb: swipe ↔ to pull  ·  swipe ↕ to wipe']
      : ['← → walk   ↓ through the line   ↑ float / back up', 'Z wipe   X pull   P pause   Esc menu   M mute   F fullscreen'];
    help.forEach((line, i) => n.text(line, cx, n.lineY + s * (5 + i * 1.1), s * 0.55, '#c9a640'));
    const inHint = g.time % HINT_TIME;
    const hintAlpha = clamp(Math.min(inHint, HINT_TIME - inHint) / HINT_FADE, 0, 1);
    n.text(TITLE_HINTS[Math.floor(g.time / HINT_TIME) % TITLE_HINTS.length], cx, n.lineY + s * (5 + help.length * 1.1), s * 0.55, '#c9a640', 'center', hintAlpha);
    drawDevMenu(g);
    if (canInstall()) drawInstall(g);
  } else {
    c.canvas.style.cursor = '';
    g.titleDust?.draw(n);
    n.fade = hudFade;
    n.text(String(g.score).padStart(6, '0'), n.w - pad, pad, s, COLORS.hud, 'right');
    n.text('LEVEL ' + g.level + (DIFF.beatOn ? `  ·  ${Math.round(g.beat.bpm)} BPM` : ''), cx, pad, s * 0.7, '#ffb21a');
    if (DIFF.beatOn) drawBar(g, n.w - pad, pad + s * 1.1, s);
    n.world();
    drawSizes(g, n.camX + (pad / n.unit) + 4, n.viewTop + pad / n.unit + 1);
    n.screen();
    if (g.mode !== 'over') drawLead(g, pad, pad + s * 1.4, s);
    if (g.banner > 0) n.text('LEVEL ' + g.level, cx, n.lineY - n.unit * 70, s * 2.4, COLORS.hud, 'center', Math.min(1, g.banner));
    if (g.hintT > 0 && g.mode === 'play') n.text(g.hint, cx, pad + s * 2.4, s * 0.62, '#ffd77a', 'center', Math.min(1, g.hintT));
    if (g.paused) {
      n.text('PAUSED', cx, n.lineY - n.unit * 75, s * 2.4, COLORS.hud);
      n.text('P to carry on   Esc for the menu', cx, n.lineY - n.unit * 50, s * 0.7, '#c9a640');
    }
    if (g.mode === 'over') {
      drawFlatlined(n, g.time);
      n.text(`score ${g.score}    best ${g.best}`, cx, n.lineY - n.unit * 50, s);
      if (g.overT > 0.8) n.text(inp.touchUsed ? 'tap to continue' : 'press any key', cx, n.lineY + s * 3, s * 0.8, COLORS.hud, 'center', 0.55 + 0.45 * Math.sin(g.time * 4));
    }
  }
  n.fade = 1;
  // The buttons, the same in every mode.
  n.screen();
  const [bx, by, br] = muteButton(n);
  const m = new Path2D();
  m.moveTo(bx - br * 0.5, by - br * 0.2); m.lineTo(bx - br * 0.2, by - br * 0.2); m.lineTo(bx + br * 0.15, by - br * 0.5);
  m.lineTo(bx + br * 0.15, by + br * 0.5); m.lineTo(bx - br * 0.2, by + br * 0.2); m.lineTo(bx - br * 0.5, by + br * 0.2); m.closePath();
  if (sfx.muted) { m.moveTo(bx + br * 0.35, by - br * 0.25); m.lineTo(bx + br * 0.75, by + br * 0.25); m.moveTo(bx + br * 0.75, by - br * 0.25); m.lineTo(bx + br * 0.35, by + br * 0.25); }
  else { m.moveTo(bx + br * 0.4, by - br * 0.3); m.quadraticCurveTo(bx + br * 0.65, by, bx + br * 0.4, by + br * 0.3); }
  n.glow(m, '#c9a640', 1.4, 0.7);

  if (canFullscreen()) drawFullscreen(n);
  drawSurround(g);
  n.fade = hudFade;
  if (g.mode === 'play' && (inp.touchUsed || matchMedia('(pointer: coarse)').matches)) drawTouch(g);
  n.fade = 1;
  c.globalCompositeOperation = 'source-over';
}
