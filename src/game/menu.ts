// The start menu: each entry is a line of its own, and the lines stand one behind the
// other, going away towards a horizon. Choosing another one is a move through that depth:
// the next line comes to the front with Wavell rising out of it, while the one he stood
// on comes past the view and off the bottom with him sinking into it. The three entries
// repeat for ever, in either direction.
//
// What stands at the front is always the game's real line and the real Wavell, so a game
// starts right there. The one on its way out is a copy of the two, for the time it takes.

import { ACTIONS, RESERVED_KEYS, actionLabel, bindKey, bindPad, defaultBindings, keyLabel, padLabel, saveBindings, type Action } from '../core/controls';
import type { Captured, Controls, Input } from '../core/input';
import { usesTouch } from '../core/input';
import { COLORS, type Neon, clamp, lerp, smooth, smoothPath } from '../core/neon';
import { sfx } from '../core/sfx';
import { Wavell } from './actors/wavell';
import type { Game } from './game';
import { chevron, hudSize, retroSprite } from './hud';
import { strokeWord } from './lettering';
import { SpringLine } from './line';

export type MenuPage = 'main' | 'control' | 'credits';

/** Where he stands on the menu's lines, as a share of the screen: left of the word, as in the original. */
export const MENU_FOCUS = 0.3;
/** Where the word is written, as a share of the screen, and how big, per unit of its stroke. */
const WORD_CENTRE = 0.57, WORD_SCALE = 0.22;
/** How high the lettering stands, in units of its stroke. */
const WORD_HEIGHT = 94;
export const ENTRIES = ['START', 'CONTROL', 'CREDITS'] as const;
/** Credits */
export const CREDIT_NAMES = ['A game by SkepticOwl', 'Vibecoded with Claude Code', 'Thanks to:', 'Taddelya', 'Cherry Pie', 'Tatosgames', 'Sine Wavington', 'Anna Logue', 'Rick O\'Chet', 'Phil Harmonic', 'Amp Litude', 'Al Gorithm', 'Dee Bugger', 'Justin Case', 'Ty Dwave', 'Mr. Wavell\'s Hairdresser',];

/** How quickly the lines shrink with depth, and how far above the front line they all meet (u). */
const DEPTH = 0.5, HORIZON = 90;
/** The same on the way past the view: quicker, to be gone by the time it has moved one line. */
const DEPTH_NEAR = 0.7;
/** How far back a line can still be seen: the front one and two more, as there are three entries. */
const FAR = 3;
/** The fog: how much of a line's light gets through per line back. The blur: how out of focus it gets per line back, in widths of its stroke. */
const FOG = 0.42, BLUR = 5;
/** Seconds: a move to another line, a page coming or going, the far lines coming or going. */
const MOVE_TIME = 0.75, PAGE_TIME = 0.55, STACK_TIME = 0.3;
/** Seconds for the game's background lines to become the menu again, coming back from a game. It ends with the title's own change. */
const RETURN_TIME = 1;
/** How many moves ahead a player can press. */
const QUEUE = 3;
/**
 * The two faint lines behind the game, nearest first: how far above the line (u), how fast
 * they scroll, how far they wiggle (u) and how bright. The menu's back lines are these two,
 * with a word on them, and become them when a game starts.
 */
export const BACK_LINES = [
  { off: 42, par: 0.5, amp: 4, alpha: 0.22 },
  { off: 70, par: 0.25, amp: 7, alpha: 0.16 },
] as const;
/** How thick those lines are, and the real line (u). */
const BACK_WIDTH = 0.5, LINE_WIDTH = 0.9;

/** How far one of them is from straight at this world x (u). */
export function backWave(line: (typeof BACK_LINES)[number], x: number, camX: number, time: number) {
  const wx = x - camX + camX * line.par;
  return Math.sin(wx / 37 + time * 0.7) * line.amp * Math.sin(wx / 113 + time * 0.3);
}
/** The credits: their size (u), speed (u/s) and the space between two names (u). */
const CREDIT_SIZE = 13, CREDIT_SPEED = 55, CREDIT_GAP = 60;

const NO_INPUT: Controls = { left: false, right: false, up: false, down: false, upPressed: false, downPressed: false, dragPressed: false, pullPressed: false };
const mod = (v: number, m: number) => ((v % m) + m) % m;

/** How big a line is at this depth: 1 at the front, more on its way past the view. */
export const depthScale = (z: number) => 1 / (1 + z * (z < 0 ? DEPTH_NEAR : DEPTH));
/** How far from the front line's place it is on screen, in units. */
const depthRise = (z: number) => HORIZON * (depthScale(z) - 1);
/** A value of the two back lines, for a line at any depth behind the front. */
const backLerp = (z: number, f: (l: (typeof BACK_LINES)[number]) => number) => lerp(f(BACK_LINES[0]), f(BACK_LINES[1]), clamp(z - 1, 0, 1));
const depthAlpha = (z: number) => (z <= 0 ? 1 : FOG ** z * clamp(FAR - z, 0, 1));

type Row = { kind: 'device' } | { kind: 'bind'; action: Action; label: string } | { kind: 'reset' } | { kind: 'back' };
const ROWS: readonly Row[] = [{ kind: 'device' }, ...ACTIONS.map((a): Row => ({ kind: 'bind', ...a })), { kind: 'reset' }, { kind: 'back' }];
/** The rows of the CONTROL page: the first one's height and the space between them, as shares of the screen. */
const ROW_TOP = 0.27, ROW_H = 0.058;

export class Menu {
  page: MenuPage = 'main';
  /** The entry on the front line, or the one it is on its way to being. */
  selected = 0;
  /** How far along a move is, from 0 to 1, and which way: 1 goes into the screen, -1 out of it. */
  move = 1;
  dir: 1 | -1 = 1;
  /** Moves waiting for this one to finish. */
  queue = 0;
  /** The line he is leaving and the Wavell sinking into it, during a move. */
  ghost: { wavell: Wavell; line: SpringLine } | null = null;
  /** From 0 to 1: how much of the far lines and the words show. */
  stack = 0;
  /** From 0 to 1: how far the front line has gone, for the CONTROL page. */
  gone = 0;
  /** How far the names have come, in units. */
  scroll = 0;
  /** The CONTROL page: the row picked, and the action waiting for its new key or button. */
  row = 1;
  capturing: Action | null = null;
  /** For a moment, what went wrong with the last key pressed. */
  note = '';
  private mouseX = -1;
  private mouseY = -1;
  private confirmAsked = false;
  /** Just back from a game: the far lines are the game's background, on their way to being the menu's. */
  private fromGame = false;
  /** How much of the menu showed as the last game started. */
  private startShow = 1;
  /** He is pulling the line in, to pick the entry at the front; the pull has yet to start; it has done its work. */
  pulling = false;
  private pullAsked = false;
  private hauled = false;
  /** Where START stands on the line once a game has begun: the view moves off, and the word stays on the line, ahead of him. */
  private startX = 0;
  /** Each name's width, for one size of text. */
  private widths: { key: string; names: number[]; total: number } | null = null;

  constructor(private readonly g: Game) {}

  get settled() { return this.move >= 1; }
  /** On a page of its own he stays under the line. */
  get holdsHimDown() { return this.page !== 'main'; }

  /** Everything back to where a visit starts. */
  reset() {
    this.page = 'main';
    this.selected = 0;
    this.move = 1;
    this.queue = 0;
    this.ghost = null;
    this.stack = 0;
    this.gone = 0;
    this.confirmAsked = false;
    this.pulling = this.pullAsked = this.hauled = false;
    this.fromGame = true;
    this.endCapture();
  }

  /** Where the real line is, in depth. */
  get z() {
    return this.dir * (1 - smooth(this.move)) - smooth(this.gone);
  }

  /** How far this depth is from the front line's place on screen, in units, and how much of a line there shows. */
  riseAt(z: number) { return depthRise(z); }
  alphaAt(z: number) { return depthAlpha(z); }
  blurAt(z: number) { return z > 0 ? z * BLUR : 0; }

  /** How thick a line is at this depth, in the units it is drawn in: thin behind the front, like the game's background. */
  lineWidthAt(z: number) {
    if (z <= 0) return LINE_WIDTH;
    return lerp(LINE_WIDTH, BACK_WIDTH / depthScale(Math.max(z, 1)), Math.min(z, 1));
  }

  /** How far a line at this depth is from straight on screen (u): flat at the front, wiggling behind it. */
  private waveAt(z: number, x: number) {
    const { camX } = this.g.neon, time = this.g.time;
    if (z <= 0) return 0;
    const near = backWave(BACK_LINES[0], x, camX, time);
    return z < 1 ? near * z : lerp(near, backWave(BACK_LINES[1], x, camX, time), Math.min(z - 1, 1));
  }

  /** The lines on the move take on, or lose, the wiggle of the depth they are at. */
  private shapeMoving() {
    const n = this.g.neon, far = n.viewW;
    const shape = (L: SpringLine, z: number) => {
      const k = depthScale(z);
      L.shape(n.camX - far, n.camX + n.viewW + far, (x) => this.waveAt(z, x) / k);
    };
    if (this.dir > 0) shape(this.g.line, this.z);
    else if (this.ghost) shape(this.ghost.line, smooth(this.move));
  }

  /** The menu still draws its lines: the game's background waits until they have become it. */
  get showing() { return this.show() > 0.01; }

  /** The game's background is on screen: during a game, and coming back from one until the menu's lines take over from it. */
  get backdropShows() { return !this.showing && (this.g.mode !== 'title' || this.fromGame); }

  /** How much further than the view the real line has to reach, being far away (u). */
  get linePad() {
    const z = this.z;
    return z > 0 ? (this.g.neon.viewW * (1 / depthScale(z) - 1)) / 2 : 0;
  }

  /** On to another line: d is 1 for the one behind this one, -1 for the one that comes from behind the view. */
  go(d: number) {
    if (this.page !== 'main' || !d || this.pulling) return;
    if (!this.settled || !this.g.wavell.alive) { this.queue = clamp(this.queue + d, -QUEUE, QUEUE); return; }
    this.begin(Math.sign(d) as 1 | -1);
    this.queue = d - Math.sign(d);
  }

  private begin(d: 1 | -1) {
    const { wavell: W, line: L } = this.g;
    const ghost = new Wavell();
    ghost.mirror(W);
    ghost.kill('zap');
    this.ghost = { wavell: ghost, line: L.clone() };
    this.selected = mod(this.selected + d, ENTRIES.length);
    this.dir = d;
    this.move = 0;
    L.clear();
    W.spawn(W.x);
    W.events.length = 0;
    sfx.play(d > 0 ? 'flipUp' : 'flipDown', 0.7);
    sfx.play('appear', 0.5);
  }

  /** The player picks the entry on the front line: he pulls the line in, and that does it. */
  choose() {
    if (this.pulling) return;
    if (!this.settled) { this.confirmAsked = true; return; }
    const W = this.g.wavell;
    // Still under the line, he has nothing to pull with.
    if (!W.alive) { this.open(); return; }
    W.hurry();
    this.pulling = this.pullAsked = true;
  }

  /** What he does on the start screen: what the game asks, and the pull when it is time. */
  controls(k: Controls): Controls {
    if (!this.pullAsked) return k;
    if (this.g.wavell.state === 'ground') this.pullAsked = false;
    return { ...k, pullPressed: true };
  }

  /** The entry picked takes over. */
  private open() {
    const { g } = this, entry = ENTRIES[this.selected];
    this.pulling = this.pullAsked = this.hauled = false;
    sfx.play('bonus', 0.6);
    if (entry === 'START') {
      this.startX = g.neon.camX + g.neon.viewW * WORD_CENTRE;
      this.startShow = this.show();
      g.startFromMenu();
      return;
    }
    this.fromGame = false;
    this.page = entry === 'CONTROL' ? 'control' : 'credits';
    this.row = 1;
    // A mouse that happens to be over a row hasn't picked it.
    this.mouseX = g.input.mouseX;
    this.mouseY = g.input.mouseY;
    this.scroll = 0;
    this.note = '';
    g.wavell.kill('zap');
  }

  /** Back from a page. */
  back() {
    if (this.page === 'main') return;
    this.endCapture();
    this.page = 'main';
    sfx.play('flipDown', 0.5);
  }

  /** One step of the menu's own time, from the game's simulation. */
  step(dt: number) {
    const { g } = this, n = g.neon;
    if (this.pulling) this.stepPull();
    const shown = this.page === 'main' && g.morphT >= g.morphEnd - (this.fromGame ? RETURN_TIME : 0) && !this.hauled;
    this.stack = clamp(this.stack + (shown ? dt : -dt) / (this.fromGame ? RETURN_TIME : STACK_TIME), 0, 1);
    if (this.stack >= 1) this.fromGame = false;
    this.gone = clamp(this.gone + (this.page === 'control' ? dt : -dt) / PAGE_TIME, 0, 1);
    if (this.page === 'credits') this.scroll += CREDIT_SPEED * dt;
    if (this.ghost) {
      const { wavell: W, line: L } = this.ghost, pad = n.viewW;
      // He has gone under by the time his line has finished moving.
      const fast = g.wavell.sinkTime / MOVE_TIME;
      L.cover(n.camX - 70 - pad, n.camX + n.viewW + 70 + pad);
      W.update(dt * fast, NO_INPUT, L, true, n.viewTop, n.viewBottom, 100);
      W.eyePop = null;
      L.step(dt / 2);
      L.step(dt / 2);
    }
    if (this.settled) return;
    this.move = Math.min(1, this.move + dt / MOVE_TIME);
    this.shapeMoving();
    if (!this.settled) return;
    this.ghost = null;
    if (this.queue) {
      const d = Math.sign(this.queue) as 1 | -1;
      this.queue -= d;
      this.begin(d);
    } else if (this.confirmAsked) {
      this.confirmAsked = false;
      this.choose();
    }
  }

  /** The pull's moments: the line comes taut and flattens the word; then what was picked opens. */
  private stepPull() {
    const { g } = this, W = g.wavell;
    for (const e of W.events.splice(0)) {
      if (e === 'drag') sfx.play('drag', 0.7);
      else if (e === 'haul') {
        g.lineStreams();
        this.hauled = true;
        if (ENTRIES[this.selected] === 'START') { this.open(); return; }
      }
    }
    // The pages wait for him to finish: he goes under the line from there.
    if (this.hauled && W.state === 'ground') this.open();
  }

  // ---------------------------------------------------------------- the player's input

  /** Once a frame, on the start screen, once it has settled. */
  handle(inp: Input) {
    if (this.page === 'main') this.handleMain(inp);
    else if (this.page === 'credits' || usesTouch(inp)) { if (inp.confirm || inp.tap) this.back(); }
    else this.handleControl(inp);
  }

  private handleMain(inp: Input) {
    if (inp.menuUp) this.go(1);
    if (inp.menuDown) this.go(-1);
    // A swipe moves the lines the way the finger goes: down brings the ones behind closer.
    if (inp.swipeV) this.go(inp.swipeV);
    const far = inp.tap ? this.farWordAt(inp.tap[0] - this.g.neon.ox, inp.tap[1] - this.g.neon.oy) : 0;
    if (far) this.go(far);
    else if (inp.confirm || inp.tap) this.choose();
  }

  /** The far line whose word is at this point of the play area: how many lines back it is, or 0. */
  private farWordAt(x: number, y: number) {
    const n = this.g.neon;
    for (let j = 1; j < FAR; j++) {
      const k = depthScale(j), u = n.unit * k, ly = n.lineY + depthRise(j) * n.unit;
      const half = (strokeWord(ENTRIES[mod(this.selected + j, ENTRIES.length)]).width * WORD_SCALE * u) / 2;
      const cx = n.w / 2 + n.viewW * (WORD_CENTRE - 0.5) * u;
      if (Math.abs(x - cx) <= half && y <= ly + 3 * u && y >= ly - WORD_HEIGHT * WORD_SCALE * u) return j;
    }
    return 0;
  }

  private handleControl(inp: Input) {
    if (this.capturing) return;
    const n = this.g.neon;
    if (inp.menuUp) this.row = mod(this.row - 1, ROWS.length);
    if (inp.menuDown) this.row = mod(this.row + 1, ROWS.length);
    // The mouse picks a row only when it moves, so it doesn't fight with the keys.
    if (inp.mouseX !== this.mouseX || inp.mouseY !== this.mouseY) {
      this.mouseX = inp.mouseX;
      this.mouseY = inp.mouseY;
      const over = rowAt(n, inp.mouseY - n.oy);
      if (over !== null) this.row = over;
    }
    if (ROWS[this.row].kind === 'device' && (inp.menuLeft || inp.menuRight)) this.toggleDevice();
    if (inp.tap) {
      const hit = rowAt(n, inp.tap[1] - n.oy);
      if (hit === null) return;
      this.row = hit;
    } else if (!inp.confirm) return;
    this.pick(ROWS[this.row]);
  }

  private pick(row: Row) {
    const inp = this.g.input;
    this.note = '';
    if (row.kind === 'back') this.back();
    else if (row.kind === 'device') this.toggleDevice();
    else if (row.kind === 'reset') {
      const device = inp.binds.device;
      inp.setBindings({ ...defaultBindings(), device });
      saveBindings(inp.binds);
      sfx.play('bonus', 0.4);
    } else {
      this.capturing = row.action;
      inp.capture = (e) => this.captured(e);
    }
  }

  private toggleDevice() {
    const b = this.g.input.binds;
    b.device = b.device === 'keyboard' ? 'joypad' : 'keyboard';
    saveBindings(b);
    sfx.play('flipUp', 0.4);
  }

  /** A key or a button came in for the action waiting. Esc lets it go. */
  captured(e: Captured) {
    const inp = this.g.input, action = this.capturing, b = inp.binds;
    if (!action) return;
    if ('key' in e && e.key === 'Escape') { this.endCapture(); return; }
    if (b.device === 'keyboard') {
      if (!('key' in e)) return;
      if (RESERVED_KEYS.has(e.key)) { this.note = `${keyLabel(e.key)} HAS A JOB OF ITS OWN`; return; }
      bindKey(b, action, e.key);
    } else {
      if (!('button' in e)) return;
      bindPad(b, action, e.button);
    }
    inp.setBindings(b);
    saveBindings(b);
    this.note = '';
    this.endCapture();
    sfx.play('bonus', 0.4);
  }

  private endCapture() {
    this.capturing = null;
    if (this.g.input) this.g.input.capture = null;
  }

  // ---------------------------------------------------------------- drawing

  /** How much of the menu shows: on the start screen, and fading as a game takes over. */
  private show() {
    const g = this.g;
    if (g.quiet) return 0;
    if (g.mode === 'title') return this.fromGame ? smooth(this.stack) : this.stack;
    return g.titleDust ? this.startShow * (1 - g.titleDust.hudFade) : 0;
  }

  /** Where the word on the real line stands, in world units. */
  private get wordX() { return this.g.mode === 'title' ? this.g.neon.camX + this.g.neon.viewW * WORD_CENTRE : this.startX; }

  /**
   * An entry's word as flat world points, riding a line at this x. `show`, from 0 to 1, is
   * how far the line has been let up into it: at 0 it lies flat, as if pulled taut.
   */
  private wordPoints(entry: string, sample: (x: number) => number, c: number, show = 1) {
    const { pts } = strokeWord(entry), count = pts.length / 2, out: number[] = [], s = smooth(show);
    const x0 = c + pts[0] * WORD_SCALE, x1 = c + pts[pts.length - 2] * WORD_SCALE;
    for (let i = 0; i < count; i++) {
      const x = lerp(lerp(x0, x1, i / (count - 1)), c + pts[i * 2] * WORD_SCALE, s);
      out.push(x, pts[i * 2 + 1] * WORD_SCALE * s + sample(x));
    }
    return out;
  }

  /** The word the real line writes, if there is one. */
  wordOnRealLine() {
    const show = this.show();
    return show > 0.01 ? this.wordPoints(ENTRIES[this.selected], (x) => this.g.line.sample(x), this.wordX, show) : null;
  }

  /** Before the world: the lines behind the real one. */
  drawBehind() {
    const show = this.show();
    if (show <= 0.01) return;
    const moved = 1 - smooth(this.move), d = this.dir;
    // Those further back than either of the two lines on the move.
    for (let j = FAR + 1; j >= (d > 0 || !moved ? 1 : 2); j--) {
      const z = j + d * moved;
      if (z < FAR) this.drawFarLine(z, ENTRIES[mod(this.selected + j, ENTRIES.length)], show);
    }
    if (this.ghost && d < 0) this.drawGhost(smooth(this.move), mod(this.selected + 1, ENTRIES.length), show);
  }

  /** Over the world: the line on its way past the view. */
  drawFront() {
    if (this.ghost && this.dir > 0) this.drawGhost(-smooth(this.move), mod(this.selected - 1, ENTRIES.length), this.show());
  }

  /** A line through these knots (flat points, from the left), at the depth set, from past one edge of the screen to past the other. */
  private strokeLine(sample: (x: number) => number, knots: number[][], width: number) {
    const n = this.g.neon, left = n.camX - 10 - n.depthPad, right = n.camX + n.viewW + 10 + n.depthPad, path = new Path2D();
    path.moveTo(left, sample(left));
    let next = 0;
    for (let x = left; x <= right; x += 2) {
      const k = knots[next];
      if (k && x >= k[0]) {
        smoothPath(k, path, false);
        x = k[k.length - 2];
        next++;
      } else path.lineTo(x, sample(x));
    }
    n.glow(path, COLORS.line, width);
  }

  /** A line with no one on it, writing its word. */
  private drawFarLine(z: number, word: string, show: number) {
    const n = this.g.neon, c = n.camX + n.viewW * WORD_CENTRE, playing = this.g.mode !== 'title' || this.fromGame;
    // As a game starts the word goes flat and the line settles into its place in the game's background. Coming back, the other way.
    const into = playing ? 1 - show : 0;
    const k = lerp(depthScale(z), 1, into), rise = lerp(depthRise(z), -backLerp(z, (l) => l.off), into);
    const sample = (x: number) => this.waveAt(z, x) / k;
    n.setDepth(k, rise * n.unit);
    n.world();
    n.fade = playing ? lerp(depthAlpha(z), backLerp(z, (l) => l.alpha), into) : depthAlpha(z) * show;
    n.blur = lerp(this.blurAt(z), 0, into);
    this.strokeLine(sample, [this.wordPoints(word, sample, c, 1 - into)], BACK_WIDTH / k);
    n.fade = 1;
    n.blur = 0;
    n.setDepth();
  }

  /** The line he is leaving, at this depth, and what is left of him on it. */
  private drawGhost(z: number, entry: number, show: number) {
    const n = this.g.neon, { wavell: W, line: L } = this.ghost!, c = n.camX + n.viewW * WORD_CENTRE;
    const sample = (x: number) => L.sample(x), figure = W.stroke(L);
    n.setDepth(depthScale(z), depthRise(z) * n.unit);
    n.world();
    n.fade = depthAlpha(z) * show;
    n.blur = this.blurAt(z);
    this.strokeLine(sample, figure ? [figure, this.wordPoints(ENTRIES[entry], sample, c)] : [this.wordPoints(ENTRIES[entry], sample, c)], this.lineWidthAt(z));
    W.drawFeatures(n, L);
    n.screen();
    n.fade = 1;
    n.blur = 0;
    n.setDepth();
  }

  /** The menu's part of the HUD, on the start screen. */
  drawHud() {
    const n = this.g.neon, s = hudSize(n), inp = this.g.input, touch = usesTouch(inp);
    if (this.page === 'credits') {
      this.drawCredits();
      n.text(touch ? 'tap to go back' : 'Enter to go back', n.w / 2, n.h - s * 1.4, s * 0.55, '#c9a640');
    } else if (touch) this.drawTouchGuide();
    else this.drawControl();
  }

  /** The names, running across the line and riding its waves. */
  private drawCredits() {
    const n = this.g.neon, L = this.g.line, size = CREDIT_SIZE * n.unit, gap = CREDIT_GAP * n.unit;
    const key = `${size}|${n.retro}`;
    if (this.widths?.key !== key) {
      const names = CREDIT_NAMES.map((name) => n.wordWidth(name, size));
      this.widths = { key, names, total: names.reduce((a, w) => a + w + gap, 0) };
    }
    const { names, total } = this.widths;
    // One lap is the whole list, coming in from the right again after the last name has gone.
    const lap = total + n.w;
    let x = n.w - mod(this.scroll * n.unit, lap);
    CREDIT_NAMES.forEach((name, i) => {
      const w = names[i];
      if (x < n.w && x + w > 0) {
        let cx = x;
        for (const ch of name) {
          const adv = n.wordWidth(ch + ch, size) - n.wordWidth(ch, size);
          if (ch !== ' ' && cx + adv > -size && cx < n.w + size) {
            n.wordOnLine(ch, cx + adv / 2, n.lineY + L.sample(n.camX + (cx + adv / 2) / n.unit) * n.unit, size, COLORS.line);
          }
          cx += adv;
        }
      }
      x += w + gap;
    });
  }

  /** The CONTROL page with a keyboard or a joypad: every action, and what it is on. */
  private drawControl() {
    const n = this.g.neon, s = hudSize(n), inp = this.g.input, b = inp.binds, pad = b.device === 'joypad';
    const show = smooth(this.gone), left = n.w / 2 - s * 0.8, right = n.w / 2 + s * 0.8, size = s * 0.72, GOLD = '#c9a640';
    n.fade = show;
    ROWS.forEach((row, i) => {
      const y = rowY(n, i), on = i === this.row, color = on ? COLORS.hud : GOLD, alpha = on ? 1 : 0.8;
      if (on) n.text('>', left - s * (row.kind === 'bind' ? 6.2 : row.kind === 'device' ? 2.6 : 5.6), y, size, COLORS.hud, 'left');
      if (row.kind === 'device') {
        n.text('INPUT', left, y, size, color, 'right', alpha);
        n.text(pad ? '< JOYPAD >' : '< KEYBOARD >', right, y, size, color, 'left', alpha);
      } else if (row.kind === 'bind') {
        n.text(row.label, left, y, size, color, 'right', alpha);
        const waiting = this.capturing === row.action, keys = pad ? b.pad[row.action].slice(0, 2).map(padLabel) : b.keys[row.action].slice(0, 2).map(keyLabel);
        const text = waiting ? (pad ? 'PRESS A BUTTON...' : 'PRESS A KEY...') : keys.join(' / ');
        n.text(text, right, y, size, waiting ? '#ffffff' : color, 'left', waiting ? 0.55 + 0.45 * Math.sin(this.g.time * 8) : alpha);
      } else n.text(row.kind === 'reset' ? 'RESTORE DEFAULTS' : 'BACK', n.w / 2, y, size, color, 'center', alpha);
    });
    const foot = this.note || (this.capturing ? 'Esc: leave it as it is'
      : pad && !inp.padFound ? 'NO JOYPAD FOUND: CONNECT ONE AND PRESS A BUTTON'
        : pad ? 'THE LEFT STICK WALKS AS WELL   ·   BACK: MENU'
          : 'Esc menu   M mute   F fullscreen   N nostalgia');
    n.text(foot, n.w / 2, rowY(n, ROWS.length) + s * 0.3, s * 0.55, this.note ? COLORS.danger : GOLD);
    n.fade = 1;
  }

  /** The CONTROL page on a phone: nothing to change, just what the two thumbs do. */
  private drawTouchGuide() {
    const n = this.g.neon, s = hudSize(n), r = n.h * 0.09, y = n.h * 0.46, GOLD = '#c9a640', lx = n.w * 0.27, rx = n.w * 0.73;
    n.fade = smooth(this.gone);
    n.screen();
    drawRing(n, lx, y, r, GOLD, 0.7);
    drawRing(n, lx, y, r * 0.38, COLORS.hud, 0.9);
    drawRing(n, rx, y, r * 0.3, COLORS.hud, 0.9);
    const gap = r * 1.25, size = r * 0.26;
    for (const d of [-1, 1]) {
      drawArrow(n, lx, y + d * gap, 0, d, size, GOLD);
      drawArrow(n, lx + d * gap, y, d, 0, size, GOLD);
      drawArrow(n, rx, y + d * r * 0.85, 0, d, size, COLORS.hud);
      drawArrow(n, rx + d * r * 0.85, y, d, 0, size, '#9fe8ff');
    }
    const lines = (x: number, head: string, rows: string[]) => {
      n.text(head, x, y + r * 1.9, s * 0.8, COLORS.hud);
      rows.forEach((row, i) => n.text(row, x, y + r * 1.9 + s * (1.1 + i), s * 0.58, GOLD));
    };
    lines(lx, 'LEFT THUMB', ['SIDEWAYS: WALK', 'TOWARDS THE LINE: THROUGH IT', 'AWAY FROM IT: FLOAT']);
    lines(rx, 'RIGHT THUMB', ['SWIPE SIDEWAYS: PULL', 'SWIPE UP OR DOWN: WIPE']);
    n.text('tap to go back', n.w / 2, n.h - s * 1.2, s * 0.55, GOLD);
    n.fade = 1;
  }
}

const rowY = (n: Neon, i: number) => n.h * (ROW_TOP + ROW_H * i);

/** The row at this height of the play area, if any. */
function rowAt(n: Neon, y: number) {
  const i = Math.round((y / n.h - ROW_TOP) / ROW_H);
  return i >= 0 && i < ROWS.length ? i : null;
}

function drawRing(n: Neon, x: number, y: number, r: number, color: string, alpha: number) {
  if (n.retro) {
    const [px, py] = n.toPixel(x, y), pr = Math.max(2, Math.round(r * n.dpr)), path = new Path2D();
    for (let a = 0; a < 96; a++) path.rect(Math.round(px + Math.cos((a / 48) * Math.PI) * pr), Math.round(py + Math.sin((a / 48) * Math.PI) * pr), 1, 1);
    n.fillPixels(path, color, alpha);
    return;
  }
  const p = new Path2D();
  p.arc(x, y, r, 0, Math.PI * 2);
  n.glow(p, color, 1.5, alpha);
}

const RETRO_ARROWS: Record<string, readonly string[]> = {
  '0,-1': ['..#..', '.#.#.', '#...#'], '0,1': ['#...#', '.#.#.', '..#..'],
  '-1,0': ['..#', '.#.', '#..', '.#.', '..#'], '1,0': ['#..', '.#.', '..#', '.#.', '#..'],
};

function drawArrow(n: Neon, x: number, y: number, dx: number, dy: number, size: number, color: string) {
  if (n.retro) retroSprite(n, RETRO_ARROWS[`${dx},${dy}`], x, y, color);
  else chevron(n, x, y, dx, dy, size, color, 0.8);
}

/** What to press for an action, in the words of the device in use: for the game's hints. */
export const pressFor = (inp: Input, action: Action) => actionLabel(inp.binds, action);
