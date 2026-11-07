// Everything drawn over the world in screen space: score, lives, the lead gauge,
// title and game over screens, the on-screen buttons and the touch controls.

import { canFullscreen, canInstall, isFullscreen } from '../core/app';
import { keyLabel } from '../core/controls';
import { COLORS, Neon, clamp } from '../core/neon';
import { sfx } from '../core/sfx';
import { DIFF } from '../data/difficulty';
import type { Game } from './game';
import { MORPH_TIME, drawFlatlined, drawMorph, drawTitle } from './title';

/** The HUD's base size: a share of the play area, so it lays out the same on every screen. */
export const hudSize = (n: Neon) => n.h * 0.045;

/** How far down the buttons sit, and how far from the right the score ends to leave them room, in HUD sizes. */
const BUTTON_Y = 1.1, SCORE_RIGHT = 7.2;

/** Nostalgia mode's pictures of the HUD, drawn pixel by pixel. */
const RETRO = {
  speaker: ['...#.....', '..##..#..', '####...#.', '####...#.', '####...#.', '..##..#..', '...#.....'],
  muted: ['...#.....', '..##.....', '####.#.#.', '####..#..', '####.#.#.', '..##.....', '...#.....'],
  fullscreen: ['###...###', '#.......#', '#.......#', '.........', '.........', '.........', '#.......#', '#.......#', '###...###'],
  windowed: ['..#...#..', '..#...#..', '###...###', '.........', '.........', '.........', '###...###', '..#...#..', '..#...#..'],
  checks: ['###...###', '###...###', '###...###', '...###...', '...###...', '...###...', '###...###', '###...###', '###...###'],
  ring: ['..#####..', '.#.....#.', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '.#.....#.', '..#####..'],
  face: ['..#####..', '.#.....#.', '#.#...#.#', '#..#.#..#', '#.......#', '#.......#', '#.......#', '.#.....#.', '..#####..'],
  beat: ['.#.', '###', '.#.'],
} as const;

/** One of those pictures, centred on a point given in the coordinates screen() draws in. */
export function retroSprite(n: Neon, rows: readonly string[], x: number, y: number, color: string, alpha = 1) {
  const [px, py] = n.toPixel(x, y);
  n.sprite(rows, px - (rows[0].length >> 1), py - (rows.length >> 1), color, alpha);
}

/** Part of the ring of a size being earned: its pixels round from the top, up to this share of the way. */
const ringPart = (share: number) => RETRO.ring.map((row, r) => [...row].map((ch, i) => {
  const turn = Math.atan2(i - 4, 4 - r) / (Math.PI * 2);
  return ch === '#' && (turn < 0 ? turn + 1 : turn) <= share ? '#' : '.';
}).join(''));

/** The hints the start screen takes turns showing. */
export const TITLE_HINTS = [
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
  { label: 'settings', url: 'difficulty.html' },
  { label: 'editor', url: 'lab.html' },
];

/** The dev menu's box on screen, and the height of its heading and of each link. */
function devBox(n: Neon) {
  const s = hudSize(n), row = s, w = s * 5, h = row * (DEV_LINKS.length + 1) + s * 0.3, pad = s * 0.8;
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
  if (n.retro) n.pixelFrame(b.x, b.y, b.w, b.h, '#c9a640', 0.6);
  else n.glow(box, '#c9a640', 1, 0.35);
  n.text('DEV', tx, b.y + b.row * 0.65, b.s * 0.42, '#c9a640', 'left', 0.75);
  const hover = devLinkAt(n, g.input.mouseX - n.ox, g.input.mouseY - n.oy);
  DEV_LINKS.forEach((l, i) => n.text(l.label, tx, b.y + b.row * (1.65 + i), b.s * 0.5, hover === l.url ? COLORS.hud : '#c9a640', 'left', hover === l.url ? 1 : 0.8));
  c.canvas.style.cursor = hover ? 'pointer' : '';
}

/**
 * The audio button on screen: [x, y, radius]. It opens the audio menu. Up by the score
 * rather than at the bottom, where the right thumb swipes.
 */
export function audioButton(n: Neon): [number, number, number] {
  const s = hudSize(n);
  return [n.w - s * 1.4, BUTTON_Y * s, s * 0.9];
}

/** The fullscreen button on screen, beside the audio button. */
export function fullscreenButton(n: Neon): [number, number, number] {
  const s = hudSize(n);
  return [n.w - s * 3.6, BUTTON_Y * s, s * 0.9];
}

/** The nostalgia button on screen, beside the fullscreen button. */
export function nostalgiaButton(n: Neon): [number, number, number] {
  const s = hudSize(n);
  return [n.w - s * 5.8, BUTTON_Y * s, s * 0.9];
}

/** A checkerboard of big pixels: lit up when nostalgia mode is on. */
function drawNostalgia(n: Neon) {
  const [x, y, r] = nostalgiaButton(n), p = new Path2D(), a = r * 0.36;
  if (n.retro) { retroSprite(n, RETRO.checks, x, y, COLORS.hud); return; }
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if ((i + j) % 2 === 0) p.rect(x + (i - 0.5) * a, y + (j - 0.5) * a, a, a);
  n.glow(p, n.retro ? COLORS.hud : '#c9a640', 1.4, n.retro ? 1 : 0.7);
}

function drawFullscreen(n: Neon) {
  const [x, y, r] = fullscreenButton(n), p = new Path2D(), a = r * 0.6, b = r * 0.25;
  if (n.retro) { retroSprite(n, isFullscreen() ? RETRO.windowed : RETRO.fullscreen, x, y, '#c9a640', 0.8); return; }
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
  if (n.retro) n.pixelFrame(b.x, b.y, b.w, b.h, '#c9a640', hover ? 1 : 0.6);
  else n.glow(box, '#c9a640', 1, hover ? 0.7 : 0.35);
  n.screen();
  n.text('install app', b.x + b.w / 2, b.y + b.h / 2, b.s * 0.5, hover ? COLORS.hud : '#c9a640', 'center', hover ? 1 : 0.8);
  if (hover) n.ctx.canvas.style.cursor = 'pointer';
  if (g.time < g.installNote) n.text('Share menu, then Add to Home Screen', b.x + b.w, b.y - b.s * 0.6, b.s * 0.5, COLORS.hud, 'right');
}

/** A chevron at (x, y), pointing the way (dx, dy) says. */
export function chevron(n: Neon, x: number, y: number, dx: number, dy: number, size: number, color: string, alpha: number) {
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
  if ((n.ox > 0 || n.oy > 0) && n.retro) n.pixelFrame(0, 0, n.w, n.h, '#5a4a20', 0.8);
  else if (n.ox > 0 || n.oy > 0) {
    const p = new Path2D();
    p.rect(n.ox, n.oy, n.w, n.h);
    n.glow(p, '#5a4a20', 0.8, 0.5);
  }
  if (n.fullH > n.fullW) n.text('turn the phone for a bigger view', n.w / 2, -n.oy / 2, Math.max(13, n.unit * 8), '#c9a640', 'center', 0.8);
}

/** The beats of the bar, as dots ending at x, with the current one lit. */
function drawBar(g: Game, x: number, y: number, s: number) {
  const beats = g.beat.beats, gap = s * Math.min(0.6, 2.4 / beats);
  for (let i = 0; i < beats; i++) {
    const p = new Path2D(), r = s * 0.13, cx = x - (beats - 1 - i) * gap - r;
    if (g.neon.retro) { retroSprite(g.neon, RETRO.beat, cx, y, COLORS.hud, i === g.beat.beatOfBar ? 1 : 0.3); continue; }
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
  if (n.retro) {
    const [x0, py] = n.toPixel(x, y), [x1] = n.toPixel(x + w, y), lit = Math.round(x1 - (x1 - x0) * lead);
    const empty = new Path2D(), full = new Path2D(), frayed = new Path2D();
    empty.rect(x0, py, x1 - x0, 1);
    full.rect(lit, py - 1, x1 - lit, 3);
    // A little frayed end at the left of the bar.
    frayed.rect(lit - 2, py - 1, 1, 1);
    frayed.rect(lit - 4, py + 1, 1, 1);
    n.fillPixels(empty, '#5a4a20', 0.8);
    n.fillPixels(full, color);
    n.fillPixels(frayed, color, 0.8);
    return;
  }
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
  if (n.retro) {
    const [sx, sy] = n.toScreen(x, y);
    for (let i = 0; i < DIFF.growMax; i++) {
      const cx = sx + i * 11 * n.unit;
      retroSprite(n, i < W.size ? RETRO.face : RETRO.ring, cx, sy, COLORS.wavell, i < W.size ? 1 : 0.3);
      if (i === W.size && W.sparks > 0) retroSprite(n, ringPart(W.sparks / DIFF.sparksPerSize), cx, sy, COLORS.wavell);
    }
    n.world();
    return;
  }
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
    g.menu.drawHud();
    c.canvas.style.cursor = '';
    if (g.menu.page === 'main') {
      const inHint = g.time % HINT_TIME;
      const hintAlpha = clamp(Math.min(inHint, HINT_TIME - inHint) / HINT_FADE, 0, 1);
      n.text(TITLE_HINTS[Math.floor(g.time / HINT_TIME) % TITLE_HINTS.length], cx, n.lineY + s * 3.9, s * 0.55, '#c9a640', 'center', hintAlpha);
      drawDevMenu(g);
      if (canInstall()) drawInstall(g);
    }
  } else {
    c.canvas.style.cursor = '';
    g.titleDust?.draw(n);
    n.fade = hudFade;
    n.text(String(g.score).padStart(6, '0'), n.w - s * SCORE_RIGHT, pad, s, COLORS.hud, 'right');
    n.text('LEVEL ' + g.level + (DIFF.beatOn ? `  ·  ${Math.round(g.beat.bpm)} BPM` : ''), cx, pad, s * 0.7, '#ffb21a');
    if (DIFF.beatOn) drawBar(g, n.w - s * SCORE_RIGHT, pad + s * 1.1, s);
    n.world();
    drawSizes(g, n.camX + (pad / n.unit) + 4, n.viewTop + pad / n.unit + 1);
    n.screen();
    if (g.mode !== 'over') drawLead(g, pad, pad + s * 1.4, s);
    if (g.banner > 0) n.text('LEVEL ' + g.level, cx, n.lineY - n.unit * 70, s * 2.4, COLORS.hud, 'center', Math.min(1, g.banner));
    if (g.hintT > 0 && g.mode === 'play') n.text(g.hint, cx, pad + s * 2.4, s * 0.62, '#ffd77a', 'center', Math.min(1, g.hintT));
    if (g.paused && !g.audio.open) {
      n.text('PAUSED', cx, n.lineY - n.unit * 75, s * 2.4, COLORS.hud);
      n.text(`${keyLabel(inp.binds.keys.pause[0])} to carry on   Esc for the menu`, cx, n.lineY - n.unit * 50, s * 0.7, '#c9a640');
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
  const [bx, by, br] = audioButton(n);
  if (n.retro) retroSprite(n, sfx.muted ? RETRO.muted : RETRO.speaker, bx, by, '#c9a640', 0.8);
  const m = new Path2D();
  m.moveTo(bx - br * 0.5, by - br * 0.2); m.lineTo(bx - br * 0.2, by - br * 0.2); m.lineTo(bx + br * 0.15, by - br * 0.5);
  m.lineTo(bx + br * 0.15, by + br * 0.5); m.lineTo(bx - br * 0.2, by + br * 0.2); m.lineTo(bx - br * 0.5, by + br * 0.2); m.closePath();
  if (sfx.muted) { m.moveTo(bx + br * 0.35, by - br * 0.25); m.lineTo(bx + br * 0.75, by + br * 0.25); m.moveTo(bx + br * 0.75, by - br * 0.25); m.lineTo(bx + br * 0.35, by + br * 0.25); }
  else { m.moveTo(bx + br * 0.4, by - br * 0.3); m.quadraticCurveTo(bx + br * 0.65, by, bx + br * 0.4, by + br * 0.3); }
  if (!n.retro) n.glow(m, '#c9a640', 1.4, 0.7);

  if (canFullscreen()) drawFullscreen(n);
  drawNostalgia(n);
  drawSurround(g);
  n.fade = hudFade;
  if (g.mode === 'play' && !g.audio.open && (inp.touchUsed || matchMedia('(pointer: coarse)').matches)) drawTouch(g);
  n.fade = 1;
  if (g.audio.open) g.audio.draw();
  c.globalCompositeOperation = 'source-over';
}
