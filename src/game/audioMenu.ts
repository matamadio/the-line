// The audio menu: a window over the game, opened from the speaker button up to the right.
// Sound on or off, the music style and the time signature. While it is open the game
// waits, and the music plays on its own so a choice can be heard straight away.

import { audioPrefs, saveAudioPrefs } from '../core/audioPrefs';
import type { Input } from '../core/input';
import { METERS, meterById } from '../core/music';
import { COLORS, type Neon } from '../core/neon';
import { sfx } from '../core/sfx';
import type { Game } from './game';
import { hudSize } from './hud';

type Row = 'sound' | 'style' | 'meter' | 'close';
const ROWS: readonly Row[] = ['sound', 'style', 'meter', 'close'];
const LABELS: Record<Row, string> = { sound: 'SOUND', style: 'MUSIC', meter: 'TIME', close: 'CLOSE' };
const GOLD = '#c9a640';
/** The window's size and the rows' spacing, in HUD sizes. */
const BOX_W = 15, ROW_TOP = 2.5, ROW_H = 1.3, FOOT = 1.6;

const mod = (v: number, m: number) => ((v % m) + m) % m;

export class AudioMenu {
  open = false;
  row = 0;
  private mouseX = -1;
  private mouseY = -1;

  constructor(private readonly g: Game) {}

  show() {
    this.open = true;
    this.row = 0;
    this.mouseX = this.g.input.mouseX;
    this.mouseY = this.g.input.mouseY;
  }

  hide() { this.open = false; }

  private box(n: Neon) {
    const s = hudSize(n), w = s * BOX_W, h = s * (ROW_TOP + ROWS.length * ROW_H + FOOT);
    return { s, x: (n.w - w) / 2, y: (n.h - h) / 2, w, h };
  }

  private rowY(i: number) {
    const b = this.box(this.g.neon);
    return b.y + b.s * (ROW_TOP + i * ROW_H);
  }

  private rowAt(y: number) {
    const b = this.box(this.g.neon), i = Math.round((y - b.y) / b.s / ROW_H - ROW_TOP / ROW_H);
    return i >= 0 && i < ROWS.length ? i : null;
  }

  /** Once a frame while it is open. */
  handle(inp: Input) {
    const n = this.g.neon;
    if (inp.menuUp) this.row = mod(this.row - 1, ROWS.length);
    if (inp.menuDown) this.row = mod(this.row + 1, ROWS.length);
    // The mouse picks a row only when it moves, so it doesn't fight with the keys.
    if (inp.mouseX !== this.mouseX || inp.mouseY !== this.mouseY) {
      this.mouseX = inp.mouseX;
      this.mouseY = inp.mouseY;
      const over = this.rowAt(inp.mouseY - n.oy);
      if (over !== null && this.inBox(inp.mouseX - n.ox, inp.mouseY - n.oy)) this.row = over;
    }
    if (inp.menuLeft) this.change(ROWS[this.row], -1);
    if (inp.menuRight) this.change(ROWS[this.row], 1);
    if (inp.confirm) this.change(ROWS[this.row], 1);
  }

  private inBox(x: number, y: number) {
    const b = this.box(this.g.neon);
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }

  /** A tap anywhere while it is open: a row changes, and outside the window it closes. */
  tapAt(x: number, y: number): () => void {
    if (!this.inBox(x, y)) return () => this.g.closeAudio();
    const i = this.rowAt(y);
    if (i === null) return () => {};
    // The left of the value goes back through the choices, the rest goes on.
    const back = x < this.g.neon.w / 2 + this.box(this.g.neon).s * 1.6;
    return () => { this.row = i; this.change(ROWS[i], back ? -1 : 1); };
  }

  private change(row: Row, d: number) {
    if (row === 'close') { this.g.closeAudio(); return; }
    if (row === 'sound') sfx.toggleMute();
    else if (row === 'style') sfx.cycleStyle(d);
    else {
      const m = METERS[mod(METERS.indexOf(meterById(audioPrefs.meter)) + d, METERS.length)];
      audioPrefs.meter = m.id;
      saveAudioPrefs();
      this.g.beat.setMeter(m);
    }
    if (!sfx.muted) sfx.play('flipUp', 0.35);
  }

  private value(row: Row) {
    if (row === 'sound') return sfx.muted ? 'OFF' : 'ON';
    if (row === 'style') return sfx.style.name;
    if (row === 'meter') return meterById(audioPrefs.meter).id;
    return '';
  }

  draw() {
    const n = this.g.neon, c = n.ctx, b = this.box(n), s = b.s, inp = this.g.input, touch = inp.touchUsed;
    n.screen();
    // The game dims behind the window.
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = 'rgba(2, 1, 7, 0.72)';
    c.fillRect(0, 0, n.w, n.h);
    if (n.retro) n.pixelFrame(b.x, b.y, b.w, b.h, GOLD, 0.8);
    else {
      const frame = new Path2D();
      frame.rect(b.x, b.y, b.w, b.h);
      n.glow(frame, GOLD, 1, 0.5);
    }
    n.text('AUDIO', n.w / 2, b.y + s * 1.2, s * 0.9, COLORS.hud);
    const left = n.w / 2 - s * 0.6, right = n.w / 2 + s * 0.6, size = s * 0.68;
    ROWS.forEach((row, i) => {
      const y = this.rowY(i), on = i === this.row, color = on ? COLORS.hud : GOLD, alpha = on ? 1 : 0.8;
      if (row === 'close') {
        n.text(on ? '> CLOSE <' : 'CLOSE', n.w / 2, y, size, color, 'center', alpha);
        return;
      }
      if (on) n.text('>', b.x + s * 0.9, y, size, COLORS.hud, 'left');
      n.text(LABELS[row], left, y, size, color, 'right', alpha);
      n.text(`< ${this.value(row)} >`, right, y, size, color, 'left', alpha);
    });
    const foot = n.retro ? 'MUSIC BITCRUSHED'
      : touch ? 'tap a choice to change it   tap outside to close'
        : '← → change   Esc close';
    n.text(foot, n.w / 2, b.y + b.h - s * 0.9, s * 0.48, GOLD, 'center', 0.8);
    c.canvas.style.cursor = '';
  }
}
