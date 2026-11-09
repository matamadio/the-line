// The game's rules and simulation: the line, Wavell, Sinepedes, Worms, Disturchins, Bubble Bursts, Backwaves,
// line refluxes, sparkles and the end of the line crumbling in from the left. Timings and speeds follow the
// original's events (see docs/original-events.txt) where there is one. Drawing is in
// render.ts and hud.ts.
//
// The rule: every threat is something the line does, and every answer is something
// Wavell does to the line. He has two attacks: a wipe sends a crest along the line on
// his side, a pull hauls the line ahead in taut. A creature is a bulge of the line:
// a pull flattens one on his side, a wipe one on the other side. The wrong attack
// feeds it: it grows, is thrown back, and takes one more right attack per size.
// The Disturchin and the Worm have a simpler rule, from either side: a pull is right.
// Meeting one from the other side of the line, the two cancel and both go flat.
//
// His size is his armour: enough sparkles make him bigger and faster, and an enemy's hit
// takes a size instead of a life. Not in the bubble, and not at the end of the line.
//
// Time is the other half: the end of the line crumbles towards him, faster every
// level, so every stop costs ground. Sparkles are the bait: they drift about on both
// sides of the line, often behind him, and catching them means giving ground.

import { AudioMenu } from './audioMenu';
import { BEAT_SECONDS, BeatClock } from './beat';
import { Crumble, type Shape } from './crumble';
import { Fx } from './fx';
import { canFullscreen, canInstall, promptInstall, toggleFullscreen } from '../core/app';
import { loadBindings } from '../core/controls';
import { Input, usesTouch, type Controls } from '../core/input';
import { SpringLine } from './line';
import { COLORS, Neon, clamp, rand, smooth } from '../core/neon';
import { audioPrefs } from '../core/audioPrefs';
import { meterById } from '../core/music';
import { sfx } from '../core/sfx';
import { DIFF, at } from '../data/difficulty';
import { TUNE } from '../data/tune';
import { SEG_W, Sinepede, type Side } from './actors/sinepede';
import { Urchin } from './actors/urchin';
import { BUBBLE_GREEN, BubbleBurst } from './actors/bubble';
import { Wavell, type Attack } from './actors/wavell';
import { WORM_W, Worm } from './actors/worm';
import { devLinkAt, fullscreenButton, inDevMenu, inInstallButton, audioButton, nostalgiaButton } from './hud';
import { drawGame } from './render';
import { MENU_FOCUS, Menu, pressFor } from './menu';
import { MORPH_TIME, TitleDust } from './title';

type Mode = 'title' | 'play' | 'over';

/** A spark running along one side of the line, always the same distance from it. y follows from those. */
export interface Reflux { sx: number; y: number; side: 1 | -1; dist: number; dir: 1 | -1; warn: number; passed: boolean }
/** A wipe's crest running along the line; spent on the first creature it reaches. */
export interface Pulse { x: number; dir: number; side: number; kind: Attack; spent: boolean }
/** A big wave rolling in from behind. Wavell floats over it, or bounces it back by holding the line as it hits. */
export interface Backwave { x: number; dir: 1 | -1; warn: number; done: boolean; amp: number; gone?: boolean }
/** One about to roll in from x, after warn seconds. */
const BACKWAVE_WIDTH = 11;
/** It starts this far along from the end of the line, all of it on the line (u). */
const BACKWAVE_MARGIN = BACKWAVE_WIDTH * 2.5;
/** It needs this much line between where it starts and Wavell, or it doesn't come (u). */
const BACKWAVE_ROOM = 60;
/** How far off the left of the screen a wave sent back goes, taking the end of the line with it (u). */
const BACKWAVE_OFF = 20;
/** The clear line kept between two enemies (u). */
const ENEMY_GAP = 4;
/** Room a new enemy that stays put needs on each side, leaving it space to grow (u). */
const URCHIN_ROOM = 40;
const BUBBLE_ROOM = 22;
type EnemyKind = 'sine' | 'urchin' | 'worm' | 'bubble' | 'back' | 'reflux';
/** An enemy's stretch of the line. Those that crawl can be moved; the rest can only be ended. */
interface Span { x0: number; x1: number; shift?: (d: number) => void; end: () => void }
export const backwave = (x: number, warn: number): Backwave => ({ x, dir: 1, warn, done: false, amp: DIFF.backAmp });
export interface Sparkle { x: number; y: number; vx: number; vy: number; life: number; max: number; gold: boolean; p: number }
/** air: it came from a bubble bursting in the air, and pops his bubble too. */
export interface Drop { x: number; y: number; vx: number; vy: number; side: number; life: number; air: boolean }

const STEP = 1 / 120;
const STORE = 'the-line-best';
const NOSTALGIA_STORE = 'the-line-nostalgia';
/** How many drops a bursting bubble sprays, on the line and in the air. */
const SPRAY = 48;
const AIR_SPRAY = 28;
const NO_INPUT: Controls = { left: false, right: false, up: false, down: false, upPressed: false, downPressed: false, dragPressed: false, pullPressed: false };

/** A reflux at half his height from the line, on the given side (1: above it). */
export function reflux(sx: number, dir: 1 | -1, side: 1 | -1, W: Wavell, warn = 0): Reflux {
  return { sx, y: 0, side, dist: W.height / 2, dir, warn, passed: false };
}

export class Game {
  readonly line = new SpringLine();
  readonly fx = new Fx();
  crumbles: Crumble[] = [];
  readonly wavell = new Wavell();
  readonly beat = new BeatClock();
  /** A beat falls on this step, so what was waiting for one can go. Always, with the beat off. */
  private onBeat = true;
  /** An enemy may come in on this step: one to a beat, and only on the beats the level allows. */
  private cue = true;
  /** Whose turn this beat is, with the beat on: the kind most overdue. */
  private cueKind: EnemyKind | null = null;
  sinepedes: Sinepede[] = [];
  urchins: Urchin[] = [];
  worms: Worm[] = [];
  backwaves: Backwave[] = [];
  bubbles: BubbleBurst[] = [];
  drops: Drop[] = [];
  sparkles: Sparkle[] = [];
  refluxes: Reflux[] = [];
  pulses: Pulse[] = [];
  mode: Mode = 'title';
  score = 0;
  lives = 3;
  level = 1;
  best = 0;
  endX = -1000;
  private acc = 0;
  time = 0;
  playTime = 0;
  private sineClock = 0;
  private urchinClock = 0;
  /** Seconds of clear line still owed before the next threat, on the early levels. */
  private calm = 0;
  private wormClock = 0;
  private backClock = 0;
  private bubbleClock = 0;
  private sparkleClock = 0;
  private chain = 0;
  private chainT = 0;
  /** Seconds before the end of the line starts crumbling again after a spawn. */
  private endGrace = 0;
  /** A wiped Backwave has carried the end of the line further back than the lead he can build up. */
  private endCarried = false;
  hint = '';
  hintT = 0;
  private taught = new Set<string>();
  private refluxClock = 0;
  banner = 0;
  private tremor = 0;
  overT = 0;
  paused = false;
  /** Seconds since FLATLINED began turning back into the title. */
  morphT = MORPH_TIME;
  /** The title coming apart, for a moment after a game starts from the start screen. */
  titleDust: TitleDust | null = null;
  readonly menu = new Menu(this);
  /** The audio menu, over everything else when it is open. */
  readonly audio = new AudioMenu(this);
  /** The audio menu paused the game, so closing it lets the game go on. */
  private audioPaused = false;
  readonly morphEnd = MORPH_TIME;
  /** The view jumps into place if the first step is on the title, and eases from then on. */
  private viewSet = false;
  /** Asked for by a key since the last frame. */
  private menuAsked = false;
  private deathHandled = false;
  /** The time until which the start screen explains how to install by hand. */
  installNote = -1;
  stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), z: rand(0.04, 0.3), s: rand(0.6, 1.8), p: rand(0, 6) }));

  constructor(readonly neon: Neon, readonly input: Input) {
    try { this.best = Number(localStorage.getItem(STORE)) || 0; } catch { /* storage blocked */ }
    input.onKey.set('KeyM', () => sfx.toggleMute());
    input.onKey.set('Escape', () => { this.menuAsked = true; });
    input.onKey.set('KeyF', () => { void toggleFullscreen(); });
    input.onKey.set('KeyN', () => this.setNostalgia(!this.neon.retro));
    input.onGesture = () => sfx.unlock();
    input.uiTap = (cx, cy) => {
      const n = this.neon, x = cx - n.ox, y = cy - n.oy;
      if (this.audio.open) return this.audio.tapAt(x, y);
      const on = ([bx, by, r]: [number, number, number]) => Math.hypot(x - bx, y - by) <= Math.max(r * 1.25, 22);
      // The dev menu and the install button are only there on the start screen, once it has settled.
      const title = this.mode === 'title' && this.morphT >= MORPH_TIME && this.menu.page === 'main';
      if (title && inDevMenu(n, x, y)) {
        const page = devLinkAt(n, x, y);
        return () => { if (page) location.href = page; };
      }
      if (title && canInstall() && inInstallButton(n, x, y)) return () => { void this.install(); };
      if (on(audioButton(n))) return () => this.openAudio();
      if (on(fullscreenButton(n)) && canFullscreen()) return () => { void toggleFullscreen(); };
      if (on(nostalgiaButton(n))) return () => this.setNostalgia(!n.retro);
      return null;
    };
    this.wavell.rise(0);
    this.neon.camX = -this.neon.viewW * this.neon.focus;
  }

  /** Nostalgia mode: the game looks low resolution. It stays as it was left, from one visit to the next. */
  setNostalgia(on: boolean) {
    this.neon.retro = on;
    this.neon.resize();
    sfx.setNostalgia(on);
    try { localStorage.setItem(NOSTALGIA_STORE, on ? '1' : '0'); } catch { /* storage blocked */ }
  }

  /** Back to how the player left it last time. */
  loadNostalgia() {
    try { if (localStorage.getItem(NOSTALGIA_STORE) === '1') this.setNostalgia(true); } catch { /* storage blocked */ }
  }

  /** The keys and buttons the player left last time. */
  loadControls() { this.input.setBindings(loadBindings()); }

  /** The start of a game, from the menu: the title comes apart as it starts. */
  startFromMenu() {
    this.start();
    this.titleDust = new TitleDust();
  }

  /** Offer to install the game, or say how where the browser can't ask by itself. */
  private async install() {
    if (!(await promptInstall())) this.installNote = this.time + 6;
  }

  start() {
    sfx.unlock();
    // On the title he has already risen out of the line, or is doing it now.
    if (this.mode === 'title' && this.wavell.alive) this.wavell.hurry();
    else this.wavell.spawn(this.wavell.x);
    this.morphT = MORPH_TIME;
    this.titleDust = null;
    this.mode = 'play';
    this.score = 0;
    this.lives = DIFF.lives;
    this.level = DIFF.startLevel;
    this.playTime = 0;
    this.sineClock = at('sineEvery', this.level) - DIFF.sineFirst;
    this.urchinClock = 0;
    this.calm = 0;
    this.refluxClock = 0;
    this.sinepedes = [];
    this.urchins = [];
    this.worms = [];
    this.backwaves = [];
    this.wormClock = 0;
    this.backClock = 0;
    this.bubbles = [];
    this.drops = [];
    this.sparkles = [];
    this.bubbleClock = 0;
    this.sparkleClock = 0;
    this.chain = 0;
    this.refluxes = [];
    this.pulses = [];
    this.fx.clear();
    this.crumbles = [];
    this.beat.reset(this.level, meterById(audioPrefs.meter));
    sfx.restartMusic();
    this.endX = this.wavell.x - DIFF.endLead;
    this.endGrace = DIFF.endGrace;
    this.deathHandled = false;
  }

  /**
   * Back to the start screen. What is on the line sinks into it, and so does he, and he
   * rises again once the line is clear. `morph`: FLATLINED turns into the title first.
   */
  backToTitle(morph: boolean) {
    const W = this.wavell;
    this.setPaused(false);
    this.keepBest();
    this.mode = 'title';
    this.titleDust = null;
    this.menu.reset();
    this.morphT = morph ? 0 : MORPH_TIME;
    for (const s of this.sinepedes) s.sink();
    for (const u of this.urchins) u.sink();
    for (const w of this.worms) w.sink();
    this.bubbles = [];
    this.drops = [];
    this.sparkles = [];
    this.backwaves = [];
    this.refluxes = [];
    this.pulses = [];
    this.hintT = 0;
    this.banner = 0;
    this.tremor = 0;
    W.kill('zap');
  }

  /** The audio menu opens over whatever is going on. A game waits for it, and the music plays on its own. */
  openAudio() {
    if (this.audio.open) return;
    this.audio.show();
    if (this.mode === 'play' && !this.paused) { this.setPaused(true); this.audioPaused = true; }
    const bpm = this.mode === 'play' ? this.beat.bpm : at('bpm', DIFF.startLevel);
    sfx.preview(true, bpm, () => meterById(audioPrefs.meter), this.mode === 'play' ? this.musicEnergy : 0.7);
  }

  closeAudio() {
    if (!this.audio.open) return;
    this.audio.hide();
    sfx.preview(false);
    if (this.audioPaused) this.setPaused(false);
    else if (this.paused) sfx.pause(true);
    this.audioPaused = false;
  }

  /** How busy the music is: it fills in as the levels go up. */
  get musicEnergy() { return clamp(0.25 + (this.level - 1) * 0.15, 0, 1); }

  setPaused(on: boolean) {
    if (on === this.paused) return;
    this.paused = on;
    sfx.pause(on);
  }

  private keepBest() {
    if (this.score <= this.best) return;
    this.best = this.score;
    try { localStorage.setItem(STORE, String(this.best)); } catch { /* storage blocked */ }
  }

  /** No enemies, sparkles or hints turn up by themselves (the animation lab places its own). */
  quiet = false;

  /** One fixed simulation step with these controls, and a render: how the animation lab drives the game. */
  tick(k: Controls) { this.step(STEP, k); }
  draw(dt: number) { drawGame(this, dt); }

  frame(dt: number) {
    dt = clamp(dt, 0, 0.05);
    this.input.poll();
    const ready = this.mode === 'over' && this.overT > 0.8;
    if (this.audio.open) {
      if (this.menuAsked || this.input.backPressed) this.closeAudio();
      else this.audio.handle(this.input);
    } else if (this.menuAsked && this.mode === 'play') this.backToTitle(false);
    else if (this.input.pausePressed && this.mode === 'play') this.setPaused(!this.paused);
    else if (ready && (this.menuAsked || this.input.anyPressed)) this.backToTitle(true);
    else if (this.mode === 'title' && this.morphT >= MORPH_TIME) {
      if (this.menuAsked || this.input.backPressed) this.menu.back();
      else this.menu.handle(this.input);
    }
    this.menuAsked = false;
    if (this.paused) { drawGame(this, dt); return; }
    this.titleDust?.update(dt, this.neon, this.time);
    if (this.titleDust?.done) this.titleDust = null;
    let controls: Controls = this.mode === 'play' ? { ...this.input } : NO_INPUT;
    this.acc += dt * (DIFF.beatOn && this.mode !== 'title' ? this.beat.speed : 1);
    while (this.acc >= STEP) {
      this.step(STEP, controls);
      controls = { ...controls, upPressed: false, downPressed: false, dragPressed: false, pullPressed: false };
      this.acc -= STEP;
    }
    this.hum();
    drawGame(this, dt);
  }

  /** The nearest Sinepede is heard as well as seen: its pure tone swells as it gets close. */
  private hum() {
    const W = this.wavell;
    let near: Sinepede | undefined, best = Infinity;
    if (this.mode === 'play' && W.alive) {
      for (const s of this.sinepedes) {
        const d = Math.abs(s.frontCentre(W.x) - W.x);
        if (s.harmful && d < best) { best = d; near = s; }
      }
    }
    const f = near?.front(W.x);
    sfx.hum(f ? f.side : 0, f ? clamp(1 - best / this.neon.viewW, 0, 1) : 0);
  }

  // ---------------------------------------------------------------- simulation

  private step(dt: number, k: Controls) {
    const W = this.wavell, L = this.line, n = this.neon;
    this.time += dt;
    W.update(dt, this.mode === 'title' ? this.menu.controls(k) : k, L, this.endX < W.x - 10, n.viewTop, n.viewBottom, this.viewAhead);
    if (W.eyePop) {
      for (let i = 0; i < W.eyePop.length; i += 2) this.fx.burst(W.eyePop[i], W.eyePop[i + 1], 12, 55, COLORS.danger, 40, 0.5);
      sfx.play('pop', 0.6);
      W.eyePop = null;
    }
    // On the title he stands to the left of the menu's word.
    const target = W.x - n.viewW * (this.mode === 'title' ? MENU_FOCUS : n.focus);
    n.camX = !this.viewSet && this.mode === 'title' ? target : n.camX + (target - n.camX) * Math.min(1, dt * 12);
    this.viewSet = true;
    const pad = this.mode === 'title' ? this.menu.linePad : 0;
    L.cover(n.camX - 70 - pad, n.camX + n.viewW + 70 + pad);
    L.step(dt / 2);
    L.step(dt / 2);
    this.fx.update(dt);
    for (const c of this.crumbles) c.update(dt, L, this.fx);
    this.crumbles = this.crumbles.filter((c) => !c.done);
    this.banner = Math.max(0, this.banner - dt);
    this.onBeat = this.cue = !DIFF.beatOn;
    this.cueKind = null;
    if (this.mode !== 'play') this.onBeat = true;

    if (this.tremor > 0) {
      this.tremor -= dt;
      if (Math.random() < 0.3) L.impulse(n.camX + Math.random() * n.viewW, rand(-90, 90), 6);
    }
    if (this.mode === 'title') {
      this.morphT += dt;
      this.crumbles = [];
      // Coming back from a game: the line grows back from the left, what was on it finishes sinking, and he rises again.
      this.endX = Math.max(W.x - 1000, this.endX - dt * 600);
      this.updateSinepedes(dt);
      this.updateUrchins(dt);
      this.updateWorms(dt);
      if (W.state === 'dead' && W.t > W.linger + 0.3 && !this.menu.holdsHimDown) W.rise(W.x);
      // The line lies flat until he has risen out of it, or while the names run along it.
      if ((W.state === 'ground' || this.menu.page === 'credits') && Math.random() < dt * 1.5) L.impulse(n.camX + Math.random() * n.viewW, rand(-50, 50), 5);
      this.menu.step(dt);
      return;
    }
    if (this.mode === 'over') { this.overT += dt; this.updateSinepedes(dt); this.updateUrchins(dt); this.keepApart(); return; }

    this.playTime += dt;
    if (DIFF.beatOn) this.stepBeat();
    for (const e of W.events.splice(0)) {
      if (e === 'appear') sfx.play('appear');
      else if (e === 'drag') sfx.play('drag', W.attack === 'wipe' ? 1 : 0.7);
      else if (e === 'release' && W.attack === 'wipe') this.pulses.push({ x: W.x + W.facing * 8, dir: W.facing, side: W.side, kind: 'wipe', spent: false });
      else if (e === 'haul') this.haul();
      else if (e === 'flipDown') sfx.play('flipDown');
      else if (e === 'flipUp') sfx.play('flipUp');
      else if (e === 'fly') this.fx.burst(W.x, L.sample(W.x), 20, 45, COLORS.wavell, 0, 0.35);
      else if (e === 'land') this.fx.burst(W.x, L.sample(W.x), 14, 50, COLORS.wavell, 60, 0.4);
      else if (e === 'dizzy') sfx.play('offline', 0.6);
      else if (e === 'grow') {
        sfx.grew(W.size);
        this.fx.burst(W.x, L.sample(W.x) - W.side * 14, 24, 60, COLORS.wavell, 0, 0.45);
        n.shake = Math.max(n.shake, 0.4);
        if (DIFF.sizePoints > 0) this.teach('multiplier', `BIGGER IS RICHER: every point now counts ×${this.multiplier}`, `BIGGER IS RICHER: every point now counts ×${this.multiplier}`);
      } else if (e === 'shrink') {
        sfx.shrank(W.size);
        this.fx.burst(W.x, L.sample(W.x) - W.side * 14, 26, 70, COLORS.danger, 60, 0.5);
        n.shake = Math.max(n.shake, 1);
        this.teach('shrink', 'THAT HIT TOOK A CIRCLE: with none left it is game over', 'THAT HIT TOOK A CIRCLE: with none left it is game over');
      }
    }

    // The end of the line crumbles in, faster every level, and
    // a lead can only be built up so far. Stopping for anything costs ground.
    if (this.endGrace > 0) this.endGrace -= dt;
    // A burning creature is the end of the line: it waits for the burn to finish.
    else if (W.alive && W.state !== 'appear' && !this.crumbles.length) this.endX += at('endSpeed', this.level) * dt;
    if (W.x - this.endX <= DIFF.endLead) this.endCarried = false;
    this.endX = Math.max(this.endX, this.endCarried ? n.camX - BACKWAVE_OFF : W.x - DIFF.endLead);
    // Sparks come off the break; the line trembles near it. While he burns,
    // he is the end of the line, so the break itself keeps still.
    const crumbling = (W.state === 'dead' && W.death === 'fall') || this.crumbles.length > 0;
    // Just grown: a few motes of light lift off him.
    if (W.alive && W.glowing > 0 && Math.random() < dt * 22) {
      const a = W.auraPoints(L), i = Math.floor(Math.random() * (a.length / 2)) * 2;
      if (a.length) this.fx.spark(a[i], a[i + 1], rand(-8, 8), -W.side * rand(14, 32), rand(0.5, 0.9), '#ffe680', 0, 0);
    }
    // The line being eaten: sparks fan out evenly to the left and fade where they are.
    if (!crumbling && Math.random() < dt * 40) {
      this.fx.disperse(this.endX, L.sample(this.endX), COLORS.line, Math.PI / 2, Math.PI * 1.5);
    }
    if (!crumbling && Math.random() < dt * 8) L.impulse(this.endX + rand(8, 30), rand(-30, 30), 3);
    if (W.alive && (W.onLine || W.state === 'appear') && this.endX >= W.x - 5) W.kill('fall');

    if (this.threatsAround()) this.calm = DIFF.soloGap;
    else this.calm = Math.max(0, this.calm - dt);
    this.spawnSinepedes(dt);
    this.spawnUrchins(dt);
    this.spawnWorms(dt);
    this.updateBubbles(dt);
    this.updateSparkles(dt);
    // Sparks riding Wavell's waves (the waves themselves are in the line).
    // Sparks ride a wipe's crest.
    for (const p of this.pulses) {
      p.x += p.dir * L.c * dt;
      if (Math.random() < 0.6) this.fx.spark(p.x, L.sample(p.x), rand(-20, 20), -p.side * rand(10, 40), 0.4, '#fff3a0', 60 * p.side);
      if (this.mode === 'play') this.strike(p);
    }
    this.pulses = this.pulses.filter((p) => !p.spent && p.x < n.camX + n.viewW + 60 && p.x > n.camX - 60);
    this.updateSinepedes(dt);
    this.updateUrchins(dt);
    this.updateWorms(dt);
    this.keepApart();
    this.updateBackwaves(dt);
    this.updateRefluxes(dt);
    if (this.hintT > 0) this.hintT -= dt;
    this.handleDeath();

    // Level 10 is the last: the boss fight.
    if (this.level < DIFF.lastLevel && this.score >= DIFF.levelScore * this.level) {
      this.level++;
      this.banner = 2.2;
      this.tremor = 1.2;
      n.shake = 1.5;
      sfx.play('level');
      if (DIFF.lifeEvery > 0 && this.level % DIFF.lifeEvery === 0) this.lives++;
    }
  }

  /** On each beat: the music's next beat. */
  private stepBeat() {
    const hit = this.beat.step(this.level);
    if (!hit) return;
    this.onBeat = true;
    this.cue = this.beat.cueBeats;
    if (this.cue) this.cueKind = this.mostOverdue();
    sfx.beat(60 / this.beat.bpm, this.beat.beatOfBar, this.beat.meter, this.musicEnergy);
  }

  /** Every enemy on the line, from the left. One in the air, or on its way out, takes up no room. */
  private spans(): Span[] {
    const out: Span[] = [];
    for (const s of this.sinepedes) if (s.harmful) out.push({ x0: s.x, x1: s.back, shift: (d) => { s.x += d; }, end: () => s.sink() });
    for (const w of this.worms) if (w.harmful) out.push({ x0: w.x, x1: w.back, shift: w.state === 'bite' ? undefined : (d) => { w.x += d; }, end: () => w.sink() });
    for (const u of this.urchins) if (u.standing) out.push({ x0: u.x - u.reach, x1: u.x + u.reach, shift: u.moving ? (d) => { u.x += d; } : undefined, end: () => u.sink() });
    for (const b of this.bubbles) if (b.harmful && !b.airborne) out.push({ x0: b.x - b.r - 3, x1: b.x + b.r + 3, end: () => b.pop() });
    return out.sort((a, b) => a.x0 - b.x0);
  }

  /** Would something new at x, with this much room on each side, touch an enemy? */
  private clash(x: number, room: number) {
    return this.spans().some((s) => x + room + ENEMY_GAP > s.x0 && x - room - ENEMY_GAP < s.x1);
  }

  /**
   * Enemies never overlap. Those that crawl queue up behind what is ahead of them, and
   * one thrown back or grown into another shoves it along, or is stopped by it if it
   * stays put. Two that stay put can only meet if one grew: the later one goes.
   */
  private keepApart() {
    const s = this.spans();
    const move = (a: Span, d: number) => { a.shift?.(d); a.x0 += d; a.x1 += d; };
    for (let i = 1; i < s.length; i++) {
      const over = s[i - 1].x1 + ENEMY_GAP - s[i].x0;
      if (over > 0 && s[i].shift) move(s[i], over);
    }
    for (let i = s.length - 2; i >= 0; i--) {
      const over = s[i].x1 + ENEMY_GAP - s[i + 1].x0;
      if (over <= 0) continue;
      if (s[i].shift) move(s[i], -over);
      else if (s[i + 1].shift) move(s[i + 1], over);
      else s[i + 1].end();
    }
  }

  /** Is anything out there that he has to deal with? */
  private threatsAround() {
    return this.sinepedes.some((s) => s.harmful) || this.worms.some((w) => w.harmful) || this.bubbles.some((b) => b.harmful)
      || this.urchins.some((u) => u.standing) || this.backwaves.length > 0 || this.refluxes.length > 0;
  }

  /**
   * On the early levels threats come one at a time, with a moment of clear line between
   * them. Their clocks wait meanwhile, so each kind still gets its turn.
   */
  private canSpawn() {
    return this.level > DIFF.soloUntil || (this.calm <= 0 && !this.threatsAround());
  }

  /**
   * With few beats to come in on, the kind that comes most often would take them all.
   * So they take turns: the one furthest past its time goes next.
   */
  private mostOverdue(): EnemyKind | null {
    const W = this.wavell, t = this.playTime, l = this.level;
    const free = this.backwaves.length === 0 && this.refluxes.length === 0;
    const late: [EnemyKind, number][] = [['sine', this.sineClock / at('sineEvery', l)]];
    if (t >= DIFF.urchinFrom) late.push(['urchin', this.urchinClock / at('urchinEvery', l)]);
    if (t >= DIFF.wormFrom) late.push(['worm', this.wormClock / at('wormEvery', l)]);
    if (t > DIFF.bubbleFrom) late.push(['bubble', this.bubbleClock / at('bubbleEvery', l)]);
    if (t > DIFF.backFrom && free && this.backwaveStart < W.x - BACKWAVE_ROOM) late.push(['back', this.backClock / DIFF.backCheck]);
    if (t > DIFF.refluxFrom && free) late.push(['reflux', this.refluxClock / DIFF.refluxCheck]);
    const due = late.filter((k) => k[1] >= 1).sort((a, b) => b[1] - a[1]);
    return due.length ? due[0][0] : null;
  }

  /** May this kind come in now? */
  private takes(kind: EnemyKind) {
    return this.cue && (this.cueKind === null || this.cueKind === kind);
  }

  /** A warning or a fuse, in whole beats with the beat on, so what comes after it falls on one. */
  private inBeats(seconds: number, least = 1) {
    return DIFF.beatOn ? Math.max(least, Math.round(seconds / BEAT_SECONDS)) * BEAT_SECONDS : seconds;
  }

  /** How long a sound lasting this much game time lasts: the world runs at the tempo. */
  private heard(seconds: number) {
    return DIFF.beatOn ? seconds / this.beat.speed : seconds;
  }

  /** A countdown to something that makes a sound: at the end it waits for the beat. */
  private countDown(warn: number, dt: number) {
    const left = warn - dt;
    return left > 0 || this.onBeat ? left : 1e-6;
  }

  private spawnSinepedes(dt: number) {
    const W = this.wavell, n = this.neon;
    if (!W.alive || W.state === 'appear') return;
    // The original only counts while you walk right; standing still is punished by the end of the line.
    if (this.quiet || !this.canSpawn()) return;
    this.sineClock += dt * (W.vel > 0 ? 1 : DIFF.sineIdle);
    const every = at('sineEvery', this.level);
    if (this.sineClock >= every && this.takes('sine')) {
      this.cue = false;
      this.sineClock = 0;
      // Half start on a crest (a sine), half on a trough (a cosine). Longer every few levels.
      const s = new Sinepede(n.camX + n.viewW + 30, at('sineSpeed', this.level), Math.floor(at('sineSegs', this.level)), Math.random() < 0.5 ? 1 : -1);
      this.sinepedes.push(s);
      sfx.call(s.sides);
      this.teach('sinepede', 'SINEPEDE: a crest on your side: SWIPE ↔. A trough on the other: SWIPE ↕', 'SINEPEDE: a crest on your side: {pull}. A trough on the other: {drag}');
    }
  }

  private spawnUrchins(dt: number) {
    const W = this.wavell;
    if (!this.canSpawn()) return;
    this.urchinClock += dt;
    if (!W.alive || W.state === 'appear' || this.quiet || this.playTime < DIFF.urchinFrom) return;
    if (this.urchinClock < at('urchinEvery', this.level) || !this.takes('urchin')) return;
    // Far enough ahead to stop or go round in the time the warning gives.
    const warn = this.inBeats(at('urchinWarn', this.level));
    const x = W.x + W.facing * (warn * 100 + rand(25, 80));
    // No room there: it tries again on a later beat.
    if (this.clash(x, URCHIN_ROOM)) return;
    this.urchinClock = rand(-1, 0);
    const u = new Urchin(x, warn, DIFF.urchinHold);
    u.hush = sfx.rumble(this.heard(warn));
    this.urchins.push(u);
    this.cue = false;
    this.teach('urchin', 'DISTURCHIN: where the line fuzzes, spikes come out. SWIPE ↔ to pull it flat', 'DISTURCHIN: where the line fuzzes, spikes come out. {pull} pulls it flat');
  }

  private spawnWorms(dt: number) {
    const W = this.wavell, n = this.neon;
    if (!W.alive || W.state === 'appear' || this.playTime < DIFF.wormFrom) return;
    // Worms come faster for players who hide under the line.
    if (this.quiet || !this.canSpawn()) return;
    this.wormClock += dt * (W.under ? DIFF.wormUnder : 1);
    const every = at('wormEvery', this.level);
    if (this.wormClock >= every && this.takes('worm')) {
      this.cue = false;
      this.wormClock = rand(-1, 0);
      this.worms.push(new Worm(n.camX + n.viewW + 20, at('wormSpeed', this.level)));
      this.teach('worm', 'WORM: SWIPE ↔ to pull it flat', 'WORM: {pull} pulls it flat');
    }
  }

  /**
   * Caught by the end of the line, a creature burns along its contour, and the line now
   * starts where it ends, so nothing runs under it. That end never takes him with it.
   */
  private crumble(shape: Shape) {
    const c = new Crumble(shape, this.line);
    this.crumbles.push(c);
    this.endX = Math.max(this.endX, Math.min(c.right - 7, this.wavell.x - 12));
  }

  private updateSinepedes(dt: number) {
    const W = this.wavell, L = this.line, n = this.neon;
    const wSide = W.under ? -1 : 1;
    for (const s of this.sinepedes) {
      s.update(dt);
      if (this.mode !== 'play' || !s.harmful) continue;
      // The segment closest to him presses down, and is pressed, if it is on the other side.
      for (const seg of s.segs) seg.press = 1;
      const f = s.front(W.x);
      if (f) f.press = this.interfere(s.frontCentre(W.x), f.side !== wSide);
      if (W.alive && W.onLine && W.safe <= 0 && !s.recoiling) {
        const met = s.segAt(W.x + 8) ?? s.segAt(W.x - 8);
        if (met) this.bump(s, met.side);
      }
      if (W.flying && s.touches(L, W.x, W.by, W.bubbleR)) W.hurt('pop');
      if (s.x < this.endX + 2) {
        this.crumble(s.parts(L));
        L.impulse(s.x + SEG_W / 2, 80, 9);
        s.vanish();
      }
    }
    this.sinepedes = this.sinepedes.filter((s) => s.state !== 'done' && s.back > n.camX - 90);
  }

  private updateUrchins(dt: number) {
    const W = this.wavell, L = this.line, n = this.neon;
    for (const u of this.urchins) {
      u.update(dt, this.onBeat);
      // The fuzz is in its outline. Here the line just shivers a little around it.
      if (u.state === 'warn' && Math.random() < 0.5) L.impulse(u.x + rand(-9, 9), rand(-14, 14), 3);
      if (u.justOpened) { u.hush = sfx.crunch(this.heard(u.hold)); n.shake = Math.max(n.shake, 0.4); }
      if (u.standing && u.x - u.reach < this.endX + 2) {
        this.crumble(u.parts(L));
        u.vanish();
        continue;
      }
      if (this.mode !== 'play' || !u.harmful) continue;
      if (W.alive && W.onLine && Math.abs(W.x - u.x) < u.reach) W.hurt('zap');
      if (W.flying && u.touches(L, W.x, W.by, W.bubbleR)) W.hurt('pop');
    }
    this.urchins = this.urchins.filter((u) => u.state !== 'done' && u.x > n.camX - 60);
  }

  private updateWorms(dt: number) {
    const W = this.wavell, L = this.line, n = this.neon;
    for (const w of this.worms) {
      w.update(dt);
      // Its weight sags the line: you can see it coming from above.
      if (w.harmful) L.push(w.x + WORM_W / 2, 350, 5);
      if (this.mode !== 'play') continue;
      if (w.harmful) w.squash = this.interfere(w.x + WORM_W / 2, !W.under);
      // It hangs under the line, so only a bubble down there can run into it.
      if (W.flying && W.side < 0 && w.touches(L, W.x, W.by, W.bubbleR)) W.hurt('pop');
      // On his own side it bites, which leaves him dizzy, and that is the end of it.
      const crawling = (w.state === 'move' || w.state === 'rise') && W.alive && W.onLine && W.safe <= 0;
      if (crawling && W.under && w.x < W.x + 14 && w.back > W.x - 6) {
        w.bite();
        sfx.play('eaten');
        if (W.stun()) this.teach('dizzy', 'DIZZY: slow for a moment, and the line keeps coming', 'DIZZY: slow for a moment, and the line keeps coming');
      }
      // From the other side, the two opposite waves cancel. That costs him.
      if (crawling && !W.under && w.x < W.x + 8 && w.back > W.x - 2) {
        this.cancel((w.x + w.back) / 2);
        w.kill();
        this.dropSparkles((w.x + w.back) / 2);
      }
      if (w.harmful && w.state !== 'bite' && w.x < this.endX + 2) {
        this.crumble(w.parts(L));
        L.impulse(w.x + 13, -80, 9);
        w.vanish();
      }
    }
    this.worms = this.worms.filter((w) => w.state !== 'done' && w.back > n.camX - 90);
  }

  private updateBackwaves(dt: number) {
    const W = this.wavell, L = this.line, n = this.neon;
    if (this.canSpawn()) this.backClock += dt;
    if (!this.quiet && this.takes('back') && this.canSpawn() && this.backClock > DIFF.backCheck && this.playTime > DIFF.backFrom && W.alive && W.state !== 'appear' && this.backwaves.length === 0 && this.refluxes.length === 0 && this.backwaveStart < W.x - BACKWAVE_ROOM) {
      this.backClock = 0;
      if (Math.random() < at('backChance', this.level)) {
        this.backwaves.push(backwave(this.backwaveStart, this.inBeats(1.1)));
        this.cue = false;
        this.teach('backwave', 'BACKWAVE: float over it, or face it: SWIPE ↕ sends it back, SWIPE ↔ cancels it', 'BACKWAVE: float over it ({up}), or face it ({left}): {drag} sends it back, {pull} cancels it');
      }
    }
    // Where a wave sent back is gone: just off the screen.
    const backTo = n.camX - BACKWAVE_OFF;
    for (const b of this.backwaves) {
      if (b.warn > 0) {
        b.warn = this.countDown(b.warn, dt);
        // The line trembles behind you before it comes.
        const start = this.backwaveStart;
        if (Math.random() < 0.5) L.impulse(start + 10 + rand(0, 20), rand(-40, 40), 3);
        if (b.warn <= 0) {
          // The end of the line has crumbled in too far meanwhile: there is no line left for it.
          if (start >= W.x - BACKWAVE_ROOM) { b.gone = true; continue; }
          b.x = start;
          L.pulse(b.x, -b.amp, BACKWAVE_WIDTH, 1, DIFF.backSpeed);
          sfx.play('reflux');
        }
        continue;
      }
      b.x += b.dir * DIFF.backSpeed * dt;
      if (b.dir < 0) {
        this.carryBackwave(b);
        // It carries the end of the line back with it, all the way to the left of the screen.
        this.endX = Math.max(backTo, Math.min(this.endX, b.x - BACKWAVE_MARGIN));
        // He has earned some time: there the end of the line stops for a moment.
        if (b.x < backTo) { this.endGrace = Math.max(this.endGrace, DIFF.backEarn); L.calm(b.x, 16); }
        continue;
      }
      // Past him it is on its own: a ripple running out along the line.
      if (b.done) continue;
      b.amp += DIFF.backAmp * DIFF.backGrow * dt;
      this.carryBackwave(b);
      if (!W.alive || W.state === 'appear') continue;
      // Only a wipe towards it sends it back: he has to face it. Wiping the other way does nothing.
      const thrown = this.pulses.find((p) => p.kind === 'wipe' && p.dir < 0 && p.x <= b.x);
      if (thrown) thrown.spent = true;
      if (thrown || (W.holding && W.attack === 'wipe' && W.facing < 0 && b.x >= W.x - 80)) {
        b.dir = -1;
        b.done = true;
        this.endCarried = true;
        L.calm(b.x, 22);
        L.pulse(b.x, -b.amp, BACKWAVE_WIDTH, -1, DIFF.backSpeed);
        this.addScore(10, W.x, L.sample(W.x) - 30 * W.side);
        this.dropSparkles(b.x);
        n.shake = Math.max(n.shake, 0.8);
        sfx.play('bonus');
        continue;
      }
      if (b.x >= W.x) {
        b.done = true;
        if (W.flying) this.addScore(6, W.x, W.by - 18);
        else if (W.onLine) W.hurt('zap');
      }
    }
    this.backwaves = this.backwaves.filter((b) => !b.gone && (b.warn > 0 || (b.dir > 0 ? b.x < n.camX + n.viewW + 40 : b.x >= backTo)));
  }

  /** Where a Backwave starts: just off the screen, or at the end of the line if that is in view. */
  private get backwaveStart() {
    return Math.max(this.neon.camX - 10, this.endX + BACKWAVE_MARGIN);
  }

  /** Pulled flat by a pull facing it: it is simply gone, and no time is earned. */
  private cancelBackwave(b: Backwave) {
    const L = this.line, W = this.wavell;
    L.calm(b.x, BACKWAVE_WIDTH * 2);
    b.gone = true;
    this.addScore(10, W.x, L.sample(W.x) - 30 * W.side);
    this.dropSparkles(b.x);
    this.fx.burst(b.x, L.sample(b.x), 14, 45, COLORS.danger, 0, 0.35);
    this.neon.shake = Math.max(this.neon.shake, 0.5);
    sfx.play('kill', 0.5);
  }

  /** It stays a wave in the line, kept going at its own speed and up to its height. */
  private carryBackwave(b: Backwave) {
    const short = Math.max(0, b.amp + this.line.sample(b.x));
    this.line.carry(b.x, -b.amp, BACKWAVE_WIDTH, b.dir * DIFF.backSpeed, -short * 0.05);
  }

  private updateBubbles(dt: number) {
    const W = this.wavell, L = this.line, n = this.neon;
    if (this.canSpawn()) this.bubbleClock += dt;
    const every = at('bubbleEvery', this.level);
    if (!this.quiet && this.takes('bubble') && this.canSpawn() && W.alive && W.state !== 'appear' && this.playTime > DIFF.bubbleFrom && this.bubbleClock > every) {
      const x = W.x + rand(60, 170);
      if (!this.clash(x, BUBBLE_ROOM)) {
        this.bubbleClock = rand(-1, 0);
        // Mostly on his side, so it is in his way.
        const side = (Math.random() < DIFF.bubbleOwnSide ? W.side : -W.side) as 1 | -1;
        const flies = this.level >= DIFF.bubbleFlyLevel && Math.random() < DIFF.bubbleFlyChance;
        // One that floats off needs a beat on the line and a beat to let go.
        this.bubbles.push(new BubbleBurst(x, side, this.inBeats(at('bubbleGrow', this.level), flies ? 2 : 1), flies ? this.inBeats(DIFF.bubbleFlyTime) : 0));
        this.cue = false;
        sfx.play('reflux', 0.25);
        this.teach('bubble', 'BUBBLE BURST: SWIPE ↔ on your side, SWIPE ↕ on the other, or keep away', 'BUBBLE BURST: {pull} on your side, {drag} on the other, or keep away');
      }
    }
    for (const b of this.bubbles) {
      b.update(dt, L, this.onBeat);
      if (b.justDetached) {
        // It lets go of the line, the way his own bubble does.
        L.impulse(b.x, b.side * 70, 6);
        this.fx.burst(b.x, L.sample(b.x), 10, 35, BUBBLE_GREEN, 0, 0.3);
        sfx.play('pop', 0.3);
        this.teach('bubbleFly', 'A BUBBLE IN THE AIR: its spray pops your bubble and leaves you dizzy on the line', 'A BUBBLE IN THE AIR: its spray pops your bubble and leaves you dizzy on the line');
      }
      if (b.state === 'fly' && W.alive) {
        // Touching one in the air sets it off, right there.
        const [cx, cy] = b.centre(L);
        if (W.flying ? Math.hypot(cx - W.x, cy - W.by) < b.r + W.bubbleR : this.onBody(cx, cy, b.side, b.r)) b.burst();
      }
      // Walking into one on the line, from either side, pops it and leaves him dizzy.
      if (b.harmful && !b.airborne && W.alive && W.onLine && Math.abs(b.x - W.x) < 6) {
        b.pop();
        const [cx, cy] = b.centre(L);
        this.fx.shatter(b.outline(L), BUBBLE_GREEN, 30, 0);
        this.fx.burst(cx, cy, 10, 30, '#ffffff', 0, 0.3);
        L.calm(b.x, 10);
        this.dropSparkles(b.x);
        sfx.play('pop', 0.6);
        if (W.stun()) this.teach('dizzy', 'DIZZY: slow for a moment, and the line keeps coming', 'DIZZY: slow for a moment, and the line keeps coming');
      }
      if (b.justBurst) {
        const [cx, cy] = b.centre(L);
        if (b.airborne) {
          // In the air the spray flies out all round, evenly, so nothing close slips through.
          for (let i = 0; i < AIR_SPRAY; i++) {
            const a = ((i + rand(-0.3, 0.3)) / AIR_SPRAY) * Math.PI * 2, sp = rand(45, 85);
            this.drops.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, side: b.side, life: 0.8, air: true });
          }
        } else {
          // On the line it flies out on its own side and falls back to the line.
          for (let i = 0; i < SPRAY; i++) {
            const a = rand(0.15, Math.PI - 0.15), sp = rand(55, 120);
            this.drops.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: -b.side * Math.sin(a) * sp, side: b.side, life: 1.1, air: false });
          }
          L.impulse(b.x, b.side * 90, 6);
        }
        this.fx.burst(cx, cy, 18, 60, BUBBLE_GREEN, 0, 0.4);
        sfx.play('pop');
      }
      if (b.harmful && b.x < this.endX + 4) b.pop();
    }
    this.bubbles = this.bubbles.filter((b) => b.state !== 'done' && b.x > n.camX - 60);
    for (const d of this.drops) {
      d.vy += d.side * 200 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life -= dt;
      // Back into the line on its own side.
      if (d.side * (d.y - L.sample(d.x)) > 0 && d.side * d.vy > 0) d.life = 0;
      if (d.life > 0 && d.air && W.flying && Math.hypot(d.x - W.x, d.y - W.by) < W.bubbleR + 1) {
        d.life = 0;
        W.hurt('pop');
      }
      if (d.life > 0 && this.onBody(d.x, d.y, d.side, 0)) {
        d.life = 0;
        if (W.stun()) this.teach('dizzy', 'DIZZY: slow for a moment, and the line keeps coming', 'DIZZY: slow for a moment, and the line keeps coming');
      }
    }
    this.drops = this.drops.filter((d) => d.life > 0);
  }

  /** Does something at (x, y), with this margin, on this side of the line, touch his body? */
  private onBody(x: number, y: number, side: number, margin: number) {
    const W = this.wavell;
    if (!W.onLine || (W.under ? -1 : 1) !== side) return false;
    const h = side * (this.line.sample(W.x) - y);
    return Math.abs(x - W.x) < 6 * W.scale + margin && h > -2 - margin && h < 28 * W.scale + margin;
  }

  /**
   * A sparkle over this point of the line, above it or below. Gold ones are the hard ones
   * to reach: far off the line, for the bubble.
   */
  private addSparkle(x: number, below: boolean) {
    const gold = Math.random() < DIFF.sparkleGold;
    const off = (below ? 1 : -1) * (gold ? rand(45, 65) : rand(6, 40));
    const life = rand(3, 4.5);
    this.sparkles.push({ x, y: this.line.sample(x) + off, vx: rand(-20, 20), vy: rand(-10, 10), life, max: life, gold, p: rand(0, 6) });
  }

  /** An enemy is dead: what it leaves behind, as many on each side of the line, however many are about already. */
  private dropSparkles(x: number) {
    const first = Math.random() < 0.5;
    for (let i = 0; i < DIFF.sparkleKill; i++) this.addSparkle(x + rand(-16, 16), first === (i % 2 === 0));
  }

  private updateSparkles(dt: number) {
    const W = this.wavell, L = this.line, n = this.neon;
    this.chainT -= dt;
    if (this.chainT <= 0) this.chain = 0;
    this.sparkleClock -= dt;
    if (!this.quiet && W.alive && W.state !== 'appear' && this.playTime > 2 && this.sparkleClock <= 0 && this.sparkles.length < DIFF.sparkleMax) {
      this.sparkleClock = DIFF.sparkleEvery * rand(0.6, 1.4);
      // Anywhere around him, behind too.
      this.addSparkle(W.x + rand(-130, 150), Math.random() < 0.5);
    }
    for (const s of this.sparkles) {
      // A restless random drift, kept off the line itself.
      s.vx += rand(-90, 90) * dt;
      s.vy += rand(-90, 90) * dt;
      s.vx = clamp(s.vx, -35, 35);
      s.vy = clamp(s.vy, -25, 25);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const g = L.sample(s.x), above = s.y < g;
      if (Math.abs(s.y - g) < 4) { s.y = g + (above ? -4 : 4); s.vy *= -0.5; }
      s.life -= dt;
      if (s.x < this.endX + 4) s.life = Math.min(s.life, 0.15);
      if (!W.alive) continue;
      let hit: boolean;
      if (W.flying) hit = Math.hypot(s.x - W.x, s.y - W.by) < W.bubbleR + 3;
      else {
        // Along his body, on his side of the line.
        const gw = L.sample(W.x), side = W.under ? -1 : 1, h = side * (gw - s.y);
        hit = W.onLine && Math.abs(s.x - W.x) < 7 * W.scale && h > -3 && h < 30 * W.scale;
      }
      if (hit) {
        s.life = 0;
        this.chain = Math.min(this.chain + 1, 8);
        this.chainT = DIFF.chainTime;
        const pts = this.chain * (s.gold ? 5 : 1);
        this.addScore(pts, s.x, s.y - 8);
        this.fx.burst(s.x, s.y, s.gold ? 20 : 10, 40, s.gold ? '#ffffff' : '#fff3a0', 0, 0.35);
        sfx.play('bonus', 0.35);
        W.collect();
        const grow = `${DIFF.sparksPerSize} SPARKLES FILL A CIRCLE: a hit takes a circle, with none left it's game over`;
        this.teach('growth', grow, grow);
      }
    }
    this.sparkles = this.sparkles.filter((s) => s.life > 0 && s.x > n.camX - 40 && s.x < n.camX + n.viewW + 40);
  }

  /** Explain an enemy the first time it shows up, in the words of the controls in use. */
  private teach(key: string, touch: string, keys: string) {
    if (this.quiet || this.taught.has(key)) return;
    this.taught.add(key);
    this.hint = usesTouch(this.input) ? touch : keys.replace(/\{(\w+)\}/g, (_, action) => pressFor(this.input, action));
    this.hintT = 3.5;
  }

  private updateRefluxes(dt: number) {
    const W = this.wavell, L = this.line, n = this.neon;
    if (this.canSpawn()) this.refluxClock += dt;
    // Every so often: maybe a reflux, unless a Sinepede is still coming in from the far right.
    if (!this.quiet && this.takes('reflux') && this.canSpawn() && this.refluxClock > DIFF.refluxCheck) {
      this.refluxClock = 0;
      const incoming = this.sinepedes.some((s) => s.x > n.camX + n.viewW * 0.9);
      if (W.alive && W.state !== 'appear' && this.playTime > DIFF.refluxFrom && this.refluxes.length === 0 && this.backwaves.length === 0 && !incoming &&
          Math.random() < at('refluxChance', this.level)) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        this.refluxes.push(reflux(dir > 0 ? -12 : n.viewW + 12, dir, Math.random() < 0.5 ? 1 : -1, W, this.inBeats(0.9)));
        this.cue = false;
      }
    }
    for (const r of this.refluxes) {
      r.y = L.sample(n.camX + r.sx) - r.side * r.dist;
      if (r.warn > 0) {
        r.warn = this.countDown(r.warn, dt);
        if (r.warn <= 0) sfx.play('reflux');
        continue;
      }
      r.sx += r.dir * DIFF.refluxSpeed * dt;
      const x = n.camX + r.sx;
      r.y = L.sample(x) - r.side * r.dist;
      L.push(x, -r.side * 2600, 4);
      if (Math.random() < 0.8) this.fx.spark(x, r.y, -r.dir * rand(20, 60), rand(-15, 15), 0.35, COLORS.danger);
      if (!W.alive || W.state === 'appear') continue;
      if (Math.abs(x - W.x) < 5) {
        const hit = W.flying ? Math.hypot(x - W.x, r.y - W.by) < W.bubbleR + 3
          : W.onLine && W.under === (r.side < 0);
        if (hit) { W.hurt(W.flying ? 'pop' : 'zap'); r.passed = true; continue; }
      }
      if (!r.passed && (r.dir > 0 ? x > W.x + 5 : x < W.x - 5)) {
        r.passed = true;
        this.addScore(6, W.x, r.y - 8);
      }
    }
    this.refluxes = this.refluxes.filter((r) => r.sx > -40 && r.sx < n.viewW + 40);
  }

  private handleDeath() {
    const W = this.wavell, L = this.line, n = this.neon, fx = this.fx;
    if (W.alive) { this.deathHandled = false; return; }
    if (!this.deathHandled) {
      this.deathHandled = true;
      this.lives--;
      if (W.death === 'fall') { sfx.play('offline'); n.shake = 0.5; }
      else if (W.death === 'zap') { sfx.play('vanish'); n.shake = 1.2; }
      else if (W.death === 'flatten') sfx.play('kill');
      else if (W.death === 'pop') { sfx.play('pop'); fx.burst(W.x, W.by, 40, 90, '#ff4a3a', 120, 0.7); fx.burst(W.x, W.by, 16, 40, COLORS.wavell, 160, 0.8); }
    }
    // Caught by the end of the line: he crumbles along his own outline, piece by piece,
    // and the line under him goes with him.
    if (W.death === 'fall') {
      const c = W.crumbs;
      for (let i = 0; i < c.length; i += 4) {
        fx.disperse((c[i] + c[i + 2]) / 2, (c[i + 1] + c[i + 3]) / 2, COLORS.wavell);
        if (Math.random() < 0.12) fx.disperse(c[i], c[i + 1], COLORS.danger);
      }
      c.length = 0;
      if (W.ember && Math.random() < 0.3) fx.disperse(W.ember[0], W.ember[1], '#fff1b0');
      // The line starts where what is left of him ends, so it has one end: the ember.
      const left = W.stroke(L);
      if (left) this.endX = Math.max(this.endX, left[left.length - 2] - 7);
    }
    // Burnt through, the line twangs.
    if (W.death === 'fall' && W.t >= W.linger && W.t - STEP < W.linger) L.impulse(W.x + 8, 120, 8);
    if (W.t > 1.7) {
      if (this.lives > 0) {
        for (const s of this.sinepedes) s.sink();
        for (const u of this.urchins) u.sink();
        for (const w of this.worms) w.sink();
        for (const b of this.bubbles) b.pop();
        this.crumbles = [];
        this.drops = [];
        this.backwaves = [];
        this.refluxes = [];
        this.pulses = [];
        W.spawn(W.x);
        this.endX = W.x - DIFF.endLead;
        this.endGrace = DIFF.endGrace;
      } else {
        this.mode = 'over';
        this.overT = 0;
        this.keepBest();
      }
    }
  }

  /** Creatures an attack can reach: their span on the line and the side they bulge to. */
  private targets() {
    const out: { e: Sinepede | Urchin | Worm | BubbleBurst; x0: number; x1: number; side: number }[] = [];
    for (const u of this.urchins) if (u.standing) out.push({ e: u, x0: u.x - u.reach, x1: u.x + u.reach, side: 1 });
    for (const s of this.sinepedes) if (s.harmful) out.push({ e: s, x0: s.x, x1: s.back, side: s.front(this.wavell.x)?.side ?? 1 });
    for (const w of this.worms) if (w.harmful && w.state !== 'bite') out.push({ e: w, x0: w.x, x1: w.back, side: -1 });
    // One that has floated off the line is out of reach of anything sent along the line.
    for (const b of this.bubbles) if (b.harmful && !b.airborne) out.push({ e: b, x0: b.x - 8, x1: b.x + 8, side: b.side });
    return out;
  }

  /** A wipe's crest is spent on the first creature it reaches. */
  private strike(p: Pulse) {
    const t = this.targets().find((t) => p.x > t.x0 - 4 && p.x < t.x1 + 4);
    if (!t) return;
    this.hit(t.e, t.side, 'wipe', p.side, p.dir);
    p.spent = true;
    this.line.calm(p.x, 10, 0.85);
  }

  /** How much of the view lies ahead of Wavell, the way he faces. */
  private get viewAhead() {
    const n = this.neon;
    return this.wavell.facing > 0 ? n.camX + n.viewW - this.wavell.x : this.wavell.x - n.camX;
  }

  /** A pull draws the line ahead in taut: the nearest creature in view ahead of him takes it. */
  private haul() {
    const W = this.wavell, f = W.facing, reach = this.viewAhead;
    const ahead = (t: { x0: number; x1: number }) => (f > 0 ? t.x0 - W.x : W.x - t.x1);
    const t = this.targets().filter((t) => ahead(t) > -6 && ahead(t) < reach).sort((a, b) => ahead(a) - ahead(b))[0];
    this.lineStreams();
    // Facing a Backwave on its way, the pull takes that, if nothing is nearer.
    const wave = f < 0 ? this.backwaves.find((b) => b.warn <= 0 && b.dir > 0 && !b.done && !b.gone && W.x - b.x > -6 && W.x - b.x < reach) : undefined;
    if (wave && (!t || W.x - wave.x < ahead(t))) this.cancelBackwave(wave);
    else if (t) this.hit(t.e, t.side, 'pull', W.side, -f);
  }

  /** A pull: the line streams in towards his hands. */
  lineStreams() {
    const W = this.wavell, f = W.facing, reach = this.viewAhead;
    for (let i = 0; i < 14; i++) {
      const x = W.x + f * rand(14, reach);
      this.fx.spark(x, this.line.sample(x), -f * rand(120, 220), rand(-6, 6), 0.3, '#9fe8ff', 0);
    }
  }

  /**
   * The right attack flattens a creature (a pull for one on his side, a wipe for one
   * on the other), or shrinks it back a size if it had grown. The wrong one feeds it:
   * it grows and is thrown back. dir is the way a flattened one melts away.
   */
  private hit(e: Sinepede | Urchin | Worm | BubbleBurst, side: number, kind: Attack, from: number, dir: number) {
    const L = this.line, n = this.neon, W = this.wavell;
    // The Disturchin has its own rule, from either side: only a pull hurts it.
    if (e instanceof Urchin) {
      const y = L.sample(e.x) - 12 * W.side;
      if (kind === 'wipe') {
        const size = e.size;
        e.grow();
        // Its time starts over. Only growing makes it longer, so wipes can't keep it for ever.
        e.renew(e.size > size ? DIFF.urchinRenew : 0);
        if (e.state === 'spikes') { e.hush?.(); e.hush = sfx.crunch(this.heard(e.holdLeft)); }
        e.knock((Math.sign(e.x - W.x) || 1) * DIFF.urchinKnock);
        L.impulse(e.x, W.side * 40, 8);
        this.fx.burst(e.x, y, 12, 30, COLORS.danger, 0, 0.4);
        n.shake = Math.max(n.shake, 0.3);
        sfx.crunch(0.16, 1.5);
        this.teach('urchinGrow', 'A WIPE FEEDS THE DISTURCHIN! SWIPE ↔ to pull it', 'A WIPE FEEDS THE DISTURCHIN! {pull} pulls it');
      } else if (e.size > 0) {
        e.shrink();
        this.fx.burst(e.x, y, 10, 40, '#ffffff', 0, 0.3);
        sfx.crunch(0.1, 0.75);
      } else {
        e.sink();
        this.dropSparkles(e.x);
        L.calm(e.x, 12);
        this.addScore(4 + 3 * e.peak, e.x, y - 8 * W.side);
        this.fx.burst(e.x, y, 14, 45, COLORS.danger, 0, 0.35);
        n.shake = Math.max(n.shake, 0.5);
        sfx.crunch(0.18, 0.5);
      }
      return;
    }
    const right = (kind === 'pull') === (side === from);
    if (e instanceof BubbleBurst) {
      const [cx, cy] = e.centre(L);
      if (!right) this.fed(cx, cy, () => e.feed(), BUBBLE_GREEN);
      else {
        e.pop();
        this.dropSparkles(cx);
        this.fx.burst(cx, cy, 14, 40, '#ffffff', 0, 0.35);
        this.addScore(3, cx, cy - e.side * 12);
        sfx.play('pop', 0.6);
      }
      return;
    }
    if (e instanceof Sinepede) {
      const x = e.frontCentre(W.x), y = L.sample(x) - side * 24;
      if (right) {
        // The two waves cancel: that segment is gone, and a ripple rolls on the way it was hit.
        e.cancel(W.x);
        L.pulse(x, -side * 5, 10, dir);
        this.addScore(4, x, y - side * 6);
        this.fx.burst(x, y, 10, 40, COLORS.enemy, 0, 0.3);
        n.shake = Math.max(n.shake, 0.4);
        sfx.cancelled(side, e.count === 0);
        if (e.count === 0) this.dropSparkles(x);
      } else {
        e.grow(W.x);
        e.knock((Math.sign(x - W.x) || 1) * DIFF.knock);
        L.impulse(x, side * 60, 8);
        this.fx.burst(x, y, 12, 30, COLORS.enemy, 0, 0.4);
        n.shake = Math.max(n.shake, 0.3);
        sfx.fed(side);
        this.teach('grow', 'WRONG ATTACK, IT GREW! Your side: SWIPE ↔. Other side: SWIPE ↕', 'WRONG ATTACK, IT GREW! Your side: {pull}. Other side: {drag}');
      }
      return;
    }
    // The Worm's rule, from either side: a pull flattens it and a wipe feeds it.
    const x = e.centre, y = L.sample(x) + 14 * e.sc;
    if (kind === 'wipe') {
      this.fed(x, y, () => { e.grow(); e.knock((Math.sign(x - W.x) || 1) * DIFF.knock); }, COLORS.enemy, ['A WIPE FEEDS THE WORM! SWIPE ↔ to pull it flat', 'A WIPE FEEDS THE WORM! {pull} pulls it flat']);
      // Thrown back, it drags the line with it.
      L.impulse(x, side * 60, 8);
    } else if (e.size > 0) this.shrunk(x, y, () => e.shrink());
    else {
      // Flattened, it melts into the line and rolls on the way it was hit.
      e.kill(dir);
      this.dropSparkles(x);
      L.pulse(x, -side * 6 * e.sc, 10, dir);
      this.addScore(5 + 3 * e.peak, e.x + 12, y + 8);
      this.fx.burst(x, L.sample(x) - side * 8, 10, 40, COLORS.enemy, 0, 0.3);
      n.shake = Math.max(n.shake, 0.6);
      sfx.play('kill');
    }
  }

  /** The wrong wave: the creature takes it in and grows. */
  private fed(x: number, y: number, grow: () => void, color = COLORS.enemy, hint = ['WRONG ATTACK, IT GREW! Your side: SWIPE ↔. Other side: SWIPE ↕', 'WRONG ATTACK, IT GREW! Your side: {pull}. Other side: {drag}']) {
    grow();
    this.fx.burst(x, y, 12, 30, color, 0, 0.4);
    this.neon.shake = Math.max(this.neon.shake, 0.3);
    sfx.play('snawave', 0.5);
    this.teach('grow', hint[0], hint[1]);
  }

  /** The right wave on a grown creature: one size back. */
  private shrunk(x: number, y: number, shrink: () => void) {
    shrink();
    this.fx.burst(x, y, 10, 40, '#ffffff', 0, 0.3);
    sfx.play('kill', 0.5);
  }

  /**
   * An enemy centred at ex on the other side of the line from him (opposite) is the
   * opposite wave: as he closes in it is pressed flat. Returns its height factor. He
   * keeps his shape, as nothing has happened to him until they actually meet.
   */
  private interfere(ex: number, opposite: boolean): number {
    const W = this.wavell;
    if (!opposite || !W.alive || !W.onLine) return 1;
    return 1 - TUNE.cancelDepth * smooth(clamp((TUNE.cancelStart - Math.abs(ex - W.x)) / TUNE.cancelSpan, 0, 1));
  }

  /**
   * A Sinepede ran into him: they throw each other back, and he loses the ground. On
   * his side of the line it gains a segment. On the other, the two waves cancel: it
   * loses one, which flattens it if that was the last, and he loses a size or a life.
   */
  private bump(s: Sinepede, side: Side) {
    const W = this.wavell, L = this.line, x = s.frontCentre(W.x), y = L.sample(x) - side * 24;
    const away = Math.sign(s.centre - W.x) || 1;
    W.bounce(-away * DIFF.bounce);
    if (side === (W.under ? -1 : 1)) {
      s.knock(away * DIFF.knock);
      s.grow(W.x);
      L.impulse(x, side * 60, 8);
      this.fx.burst(x, y, 12, 30, COLORS.enemy, 0, 0.4);
      sfx.fed(side);
      this.teach('bumpGrow', 'ON YOUR SIDE IT THROWS YOU BACK AND GROWS: SWIPE ↔ to pull it', 'ON YOUR SIDE IT THROWS YOU BACK AND GROWS: {pull} pulls it');
      this.neon.shake = Math.max(this.neon.shake, 0.5);
    } else {
      this.cancel(x);
      s.cancel(W.x);
      // Flattened, it just melts where it is. Only what is left of it gets thrown back.
      if (s.count > 0) s.knock(away * DIFF.knock);
      L.pulse(x, -side * 5, 10, away);
      sfx.cancelled(side, s.count === 0);
      if (s.count === 0) this.dropSparkles(x);
    }
  }

  /** They met: both melt flat into a still line. */
  private cancel(ex: number) {
    const W = this.wavell, L = this.line;
    this.fx.burst((ex + W.x) / 2, L.sample(W.x), 16, 50, '#ffffff', 0, 0.35);
    L.calm((ex + W.x) / 2, 16);
    W.hurt('flatten');
    this.neon.shake = Math.max(this.neon.shake, 0.7);
    this.teach('cancel', 'OPPOSITE WAVES CANCEL: the other side is no way round', 'OPPOSITE WAVES CANCEL: the other side is no way round');
  }

  /** Points count more the bigger he is: ×2 at the first size, ×3 at the second, and so on. */
  get multiplier() { return 1 + DIFF.sizePoints * this.wavell.size; }

  private addScore(points: number, x: number, y: number) {
    const m = this.multiplier, pts = Math.round(points * m);
    this.score += pts;
    this.fx.popup(x, y, '+' + pts);
  }
}
