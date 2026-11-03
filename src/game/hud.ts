// Everything drawn over the world in screen space: score, lives, the lead gauge,
// title and game over screens, the mute button and the touch controls.

import { COLORS, Neon, clamp } from '../core/neon';
import { sfx } from '../core/sfx';
import { DIFF } from '../data/difficulty';
import type { Game } from './game';

/** The mute button on screen: [x, y, radius]. */
export function muteButton(n: Neon): [number, number, number] {
  const s = Math.max(16, n.unit * 9);
  return [n.w - s * 1.4, n.h - s * 1.4, s * 0.9];
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

export function drawHud(g: Game) {
  const n = g.neon, c = n.ctx, inp = g.input;
  const s = Math.max(16, n.unit * 9), pad = s * 0.9;
  const cx = n.w / 2;
  if (g.mode === 'title') {
    const big = Math.min(n.w / 6.5, n.unit * 40);
    n.text('THE LINE', cx, n.lineY - big * 2.3, big);
    const blink = 0.55 + 0.45 * Math.sin(g.time * 4);
    n.text(inp.touchUsed || matchMedia('(pointer: coarse)').matches ? 'tap to start' : 'press any key', cx, n.lineY + s * 3.2, s, COLORS.hud, 'center', blink);
    const help = matchMedia('(pointer: coarse)').matches
      ? ['left thumb: walk  ·  right thumb: tap to wipe, swipe sideways to pull', 'swipe down: through the line  ·  swipe up: float / back up',
        'pull in what is close on your side, wipe what is on the other']
      : ['← → walk   ↓ through the line   ↑ float / back up', 'Z wipe   X pull   M mute',
        'pull in what is close on your side, wipe what is on the other'];
    help.forEach((line, i) => n.text(line, cx, n.lineY + s * (5 + i * 1.1), s * 0.55, '#c9a640'));
  } else {
    n.text(String(g.score).padStart(6, '0'), n.w - pad, pad, s, COLORS.hud, 'right');
    n.text('LEVEL ' + g.level, cx, pad, s * 0.7, '#ffb21a');
    n.world();
    for (let i = 0; i < g.lives; i++) {
      const [wx, wy] = [n.camX + (pad / n.unit) + 4 + i * 11, n.viewTop + pad / n.unit + 1];
      const p = new Path2D();
      p.arc(wx, wy, 4, 0, Math.PI * 2);
      p.moveTo(wx - 2.2, wy - 1.4); p.lineTo(wx - 0.8, wy - 0.8);
      p.moveTo(wx + 2.2, wy - 1.4); p.lineTo(wx + 0.8, wy - 0.8);
      n.glow(p, COLORS.wavell, 0.6);
    }
    n.screen();
    drawLead(g, pad, pad + s * 1.4, s);
    if (g.banner > 0) n.text('LEVEL ' + g.level, cx, n.lineY - n.unit * 70, s * 2.4, COLORS.hud, 'center', Math.min(1, g.banner));
    if (g.hintT > 0 && g.mode === 'play') n.text(g.hint, cx, pad + s * 1.3, s * 0.62, '#ffd77a', 'center', Math.min(1, g.hintT));
    if (g.mode === 'over') {
      n.text('GAME OVER', cx, n.lineY - n.unit * 75, s * 2.6, '#ff5a3a');
      n.text(`score ${g.score}    best ${g.best}`, cx, n.lineY - n.unit * 50, s);
      if (g.overT > 0.8) n.text(inp.touchUsed ? 'tap to play again' : 'press any key', cx, n.lineY + s * 3, s * 0.8, COLORS.hud, 'center', 0.55 + 0.45 * Math.sin(g.time * 4));
    }
  }
  // Mute toggle.
  const [bx, by, br] = muteButton(n);
  const m = new Path2D();
  m.moveTo(bx - br * 0.5, by - br * 0.2); m.lineTo(bx - br * 0.2, by - br * 0.2); m.lineTo(bx + br * 0.15, by - br * 0.5);
  m.lineTo(bx + br * 0.15, by + br * 0.5); m.lineTo(bx - br * 0.2, by + br * 0.2); m.lineTo(bx - br * 0.5, by + br * 0.2); m.closePath();
  if (sfx.muted) { m.moveTo(bx + br * 0.35, by - br * 0.25); m.lineTo(bx + br * 0.75, by + br * 0.25); m.moveTo(bx + br * 0.75, by - br * 0.25); m.lineTo(bx + br * 0.35, by + br * 0.25); }
  else { m.moveTo(bx + br * 0.4, by - br * 0.3); m.quadraticCurveTo(bx + br * 0.65, by, bx + br * 0.4, by + br * 0.3); }
  n.glow(m, '#c9a640', 1.4, 0.7);

  // Touch controls.
  if (g.mode === 'play' && (inp.touchUsed || matchMedia('(pointer: coarse)').matches)) {
    const r = Math.min(n.w, n.h) * 0.11;
    const st = inp.stick;
    const ox = st ? st.ox : r * 1.6, oy = st ? st.oy : n.h - r * 1.6;
    const base = new Path2D();
    base.arc(ox, oy, r, 0, Math.PI * 2);
    n.glow(base, '#c9a640', 1.5, st ? 0.6 : 0.3);
    const kx = st ? clamp(st.x - ox, -r, r) + ox : ox, ky = st ? clamp(st.y - oy, -r, r) + oy : oy;
    const knob = new Path2D();
    knob.arc(kx, ky, r * 0.38, 0, Math.PI * 2);
    n.glow(knob, COLORS.hud, 1.5, st ? 0.9 : 0.35);
    inp.dragFlash = Math.max(0, inp.dragFlash - 0.06);
    // The action zone: tap to wipe, swipe sideways to pull, swipe up or down. It follows the thumb.
    const sw = inp.swipe;
    const dx = sw ? sw.ox : n.w - r * 1.8, dy = sw ? sw.oy : n.h - r * 1.7;
    const btn = new Path2D();
    btn.arc(dx, dy, r * 0.8, 0, Math.PI * 2);
    btn.moveTo(dx - r * 0.45, dy + r * 0.2);
    btn.quadraticCurveTo(dx - r * 0.1, dy + r * 0.2, dx, dy - r * 0.25);
    btn.quadraticCurveTo(dx + r * 0.1, dy + r * 0.2, dx + r * 0.45, dy + r * 0.2);
    n.glow(btn, COLORS.hud, 1.5, 0.35 + inp.dragFlash * 0.65);
    inp.swipeFlash *= 0.9;
    for (const d of [-1, 1]) {
      const ch = new Path2D(), y = dy + d * r * 1.15;
      ch.moveTo(dx - r * 0.3, y - d * r * 0.15);
      ch.lineTo(dx, y + d * r * 0.15);
      ch.lineTo(dx + r * 0.3, y - d * r * 0.15);
      n.glow(ch, COLORS.hud, 1.5, 0.3 + (Math.sign(inp.swipeFlash) === d ? Math.abs(inp.swipeFlash) * 0.7 : 0));
      // Sideways chevrons for the pull.
      const sc = new Path2D(), x = dx + d * r * 1.15;
      sc.moveTo(x - d * r * 0.15, dy - r * 0.3);
      sc.lineTo(x + d * r * 0.15, dy);
      sc.lineTo(x - d * r * 0.15, dy + r * 0.3);
      n.glow(sc, '#9fe8ff', 1.5, 0.3 + inp.pullFlash * 0.7);
    }
    inp.pullFlash *= 0.9;
  }
  c.globalCompositeOperation = 'source-over';
}
