// The game's rules and simulation: the line, Wavell, Snawaves, Worms, Bubble Bursts, Backwaves,
// line refluxes, sparkles and the end of the line crumbling in from the left. Timings and speeds follow the
// original's events (see docs/original-events.txt) where there is one. Drawing is in
// render.ts and hud.ts.
//
// The rule: every threat is something the line does, and every answer is something
// Wavell does to the line. He has two attacks: a wipe sends a crest along the line on
// his side, a pull hauls the line ahead in taut. A creature is a bulge of the line:
// a pull flattens one on his side, a wipe one on the other side. The wrong attack
// feeds it: it grows, is thrown back, and takes one more right attack per size.
// Meeting one from the other side of the line, the two cancel and both go flat.
//
// Time is the other half: the end of the line crumbles towards him at nearly his
// walking speed, so every stop costs ground. Sparkles are the bait: they drift
// about, often behind him or off the line, and catching them means giving ground.

import { Fx } from './fx';
import { Input, type Controls } from '../core/input';
import { SpringLine } from './line';
import { COLORS, Neon, clamp, rand, smooth } from '../core/neon';
import { sfx } from '../core/sfx';
import { DIFF, at } from '../data/difficulty';
import { TUNE } from '../data/tune';
import { SNAWAVE_W, Snawave, biteHit } from './actors/snawave';
import { BUBBLE_GREEN, BubbleBurst } from './actors/bubble';
import { Wavell, type Attack } from './actors/wavell';
import { WORM_W, Worm, wormBiteHit } from './actors/worm';
import { muteButton } from './hud';
import { drawGame } from './render';

type Mode = 'title' | 'play' | 'over';

export interface Reflux { sx: number; y: number; dir: 1 | -1; warn: number; passed: boolean }
/** A wipe's crest running along the line; spent on the first creature it reaches. */
export interface Pulse { x: number; dir: number; side: number; kind: Attack; spent: boolean }
/** A big wave rolling in from behind. Wavell floats over it, or bounces it back by holding the line as it hits. */
export interface Backwave { x: number; dir: 1 | -1; warn: number; done: boolean }
export interface Sparkle { x: number; y: number; vx: number; vy: number; life: number; max: number; gold: boolean; p: number }
export interface Drop { x: number; y: number; vx: number; vy: number; side: number; life: number }

const STEP = 1 / 120;
const STORE = 'the-line-best';
const BACKWAVE_AMP = 22;
const NO_INPUT: Controls = { left: false, right: false, up: false, down: false, upPressed: false, downPressed: false, dragPressed: false, pullPressed: false };

export class Game {
  readonly line = new SpringLine();
  readonly fx = new Fx();
  readonly wavell = new Wavell();
  snawaves: Snawave[] = [];
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
  private snaClock = 0;
  private wormClock = 0;
  private backClock = 0;
  private bubbleClock = 0;
  private sparkleClock = 0;
  private chain = 0;
  private chainT = 0;
  /** Seconds before the end of the line starts crumbling again after a spawn. */
  private endGrace = 0;
  hint = '';
  hintT = 0;
  private taught = new Set<string>();
  private refluxClock = 0;
  banner = 0;
  private tremor = 0;
  overT = 0;
  private deathHandled = false;
  stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), z: rand(0.04, 0.3), s: rand(0.6, 1.8), p: rand(0, 6) }));

  constructor(readonly neon: Neon, readonly input: Input) {
    try { this.best = Number(localStorage.getItem(STORE)) || 0; } catch { /* storage blocked */ }
    input.onKey.set('KeyM', () => sfx.toggleMute());
    input.uiTap = (x, y) => {
      const [bx, by, r] = muteButton(this.neon);
      if (Math.hypot(x - bx, y - by) > r) return false;
      sfx.toggleMute();
      return true;
    };
    this.wavell.spawn(0);
    this.wavell.state = 'ground';
    this.neon.camX = -this.neon.viewW * this.neon.focus;
  }

  start() {
    sfx.unlock();
    this.mode = 'play';
    this.score = 0;
    this.lives = DIFF.lives;
    this.level = DIFF.startLevel;
    this.playTime = 0;
    this.snaClock = at('snaEvery', this.level) - DIFF.snaFirst;
    this.refluxClock = 0;
    this.snawaves = [];
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
    this.wavell.spawn(this.wavell.x);
    this.endX = this.wavell.x - DIFF.endLead;
    this.endGrace = DIFF.endGrace;
    this.deathHandled = false;
  }

  /** No enemies, sparkles or hints turn up by themselves (the animation lab places its own). */
  quiet = false;

  /** One fixed simulation step with these controls, and a render: how the animation lab drives the game. */
  tick(k: Controls) { this.step(STEP, k); }
  draw(dt: number) { drawGame(this, dt); }

  frame(dt: number) {
    dt = clamp(dt, 0, 0.05);
    this.input.poll();
    if (this.mode === 'title' && this.input.anyPressed) this.start();
    else if (this.mode === 'over' && this.overT > 0.8 && this.input.anyPressed) this.start();
    let controls: Controls = this.mode === 'play' ? { ...this.input } : NO_INPUT;
    this.acc += dt;
    while (this.acc >= STEP) {
      this.step(STEP, controls);
      controls = { ...controls, upPressed: false, downPressed: false, dragPressed: false, pullPressed: false };
      this.acc -= STEP;
    }
    drawGame(this, dt);
  }

  // ---------------------------------------------------------------- simulation

  private step(dt: number, k: Controls) {
    const W = this.wavell, L = this.line, n = this.neon;
    this.time += dt;
    W.update(dt, k, L, this.endX < W.x - 10, n.viewTop);
    const target = W.x - n.viewW * n.focus;
    n.camX += (target - n.camX) * Math.min(1, dt * 12);
    L.cover(n.camX - 70, n.camX + n.viewW + 70);
    L.step(dt / 2);
    L.step(dt / 2);
    this.fx.update(dt);
    this.banner = Math.max(0, this.banner - dt);

    if (this.tremor > 0) {
      this.tremor -= dt;
      if (Math.random() < 0.3) L.impulse(n.camX + Math.random() * n.viewW, rand(-90, 90), 6);
    }
    if (this.mode === 'title') {
      if (Math.random() < dt * 1.5) L.impulse(n.camX + Math.random() * n.viewW, rand(-50, 50), 5);
      return;
    }
    if (this.mode === 'over') { this.overT += dt; this.updateSnawaves(dt); return; }

    this.playTime += dt;
    for (const e of W.events.splice(0)) {
      if (e === 'appear') { sfx.play('appear'); this.fx.burst(W.x, L.sample(W.x), 26, 70, COLORS.wavell, 0, 0.5); }
      else if (e === 'drag') sfx.play('drag', W.attack === 'wipe' ? 1 : 0.7);
      else if (e === 'release' && W.attack === 'wipe') this.pulses.push({ x: W.x + W.facing * 8, dir: W.facing, side: W.side, kind: 'wipe', spent: false });
      else if (e === 'haul') this.haul();
      else if (e === 'flipDown') sfx.play('flipDown');
      else if (e === 'flipUp') sfx.play('flipUp');
      else if (e === 'fly') this.fx.burst(W.x, W.by, 20, 45, COLORS.wavell, 0, 0.35);
      else if (e === 'land') this.fx.burst(W.x, L.sample(W.x), 14, 50, COLORS.wavell, 60, 0.4);
      else if (e === 'dizzy') sfx.play('offline', 0.6);
    }

    // The end of the line crumbles in at nearly walking speed, faster every level, and
    // a lead can only be built up so far. Stopping for anything costs ground.
    if (this.endGrace > 0) this.endGrace -= dt;
    else if (W.alive && W.state !== 'appear') this.endX += at('endSpeed', this.level) * dt;
    this.endX = Math.max(this.endX, W.x - DIFF.endLead);
    // Bits of line break off and fall; the line trembles near the break. While he burns,
    // he is the end of the line, so the break itself keeps still.
    const crumbling = W.state === 'dead' && W.death === 'fall';
    if (!crumbling && Math.random() < dt * 40) this.fx.spark(this.endX + rand(0, 14), L.sample(this.endX) + rand(-1, 1), rand(-12, 12), rand(-10, 30), 1.1, COLORS.line, 160);
    if (!crumbling && Math.random() < dt * 8) L.impulse(this.endX + rand(8, 30), rand(-30, 30), 3);
    if (W.alive && (W.onLine || W.state === 'appear') && this.endX >= W.x - 5) W.kill('fall');

    this.spawnSnawaves(dt);
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
    // Opposite waves closing in on him press each other flat (see interfere).
    if (W.alive) W.squash = 1;
    this.updateSnawaves(dt);
    this.updateWorms(dt);
    this.updateBackwaves(dt);
    this.updateRefluxes(dt);
    if (this.hintT > 0) this.hintT -= dt;
    this.handleDeath();

    if (this.score > DIFF.levelScore * this.level) {
      this.level++;
      this.banner = 2.2;
      this.tremor = 1.2;
      n.shake = 1.5;
      sfx.play('level');
      if (DIFF.lifeEvery > 0 && this.level % DIFF.lifeEvery === 0) this.lives++;
    }
  }

  private spawnSnawaves(dt: number) {
    const W = this.wavell, n = this.neon;
    if (!W.alive || W.state === 'appear') return;
    // The original only counts while you walk right; standing still is punished by the end of the line.
    if (this.quiet) return;
    this.snaClock += dt * (W.vel > 0 ? 1 : DIFF.snaIdle);
    const every = at('snaEvery', this.level);
    if (this.snaClock >= every) {
      this.snaClock = 0;
      this.snawaves.push(new Snawave(n.camX + n.viewW + 30, at('snaSpeed', this.level)));
      sfx.play('snawave', 0.8);
      this.teach('snawave', 'SNAWAVE: SWIPE SIDEWAYS when it is close to pull it flat (or TAP from under)', 'SNAWAVE: X when it is close pulls it flat (or Z from under)');
    }
  }

  private spawnWorms(dt: number) {
    const W = this.wavell, n = this.neon;
    if (!W.alive || W.state === 'appear' || this.playTime < DIFF.wormFrom) return;
    // Worms come faster for players who hide under the line.
    if (this.quiet) return;
    this.wormClock += dt * (W.under ? DIFF.wormUnder : 1);
    const every = at('wormEvery', this.level);
    if (this.wormClock >= every) {
      this.wormClock = rand(-1, 0);
      this.worms.push(new Worm(n.camX + n.viewW + 20, at('wormSpeed', this.level)));
      this.teach('worm', 'WORM: TAP to wipe it flat from on top', 'WORM: Z wipes it flat from on top');
    }
  }

  private updateSnawaves(dt: number) {
    const W = this.wavell, L = this.line, n = this.neon;
    for (const s of this.snawaves) {
      s.update(dt);
      // A moving Snawave is a wave: it lifts the line in front and leaves a trough behind.
      if (s.state === 'move' || s.state === 'rise') { L.push(s.x - 3, -700, 3); L.push(s.back + 4, 500, 4); }
      if (this.mode !== 'play') continue;
      if (s.harmful) s.squash = this.interfere(s.x + SNAWAVE_W / 2, W.under);
      if ((s.state === 'move' || s.state === 'rise') && W.alive && W.onLine && !W.under && s.x < W.x + 20 && s.x > W.x - 4) {
        s.bite();
        W.kill('eaten', biteHit());
        sfx.play('eaten');
      }
      // Walking under it is no way round: his knot and its bump are opposite waves, and they cancel.
      if ((s.state === 'move' || s.state === 'rise') && W.alive && W.onLine && W.under && s.x < W.x + 8 && s.back > W.x - 2) {
        this.cancel((s.x + s.back) / 2);
        s.kill();
      }
      if (s.harmful && W.flying && s.touches(L, W.x, W.by, W.bubbleR)) W.kill('pop');
      if (s.harmful && s.state !== 'bite' && s.x < this.endX + 2) { s.sink(); L.impulse(s.x + 15, 80, 9); }
    }
    this.snawaves = this.snawaves.filter((s) => s.state !== 'done' && s.back > n.camX - 90);
  }

  private updateWorms(dt: number) {
    const W = this.wavell, L = this.line, n = this.neon;
    for (const w of this.worms) {
      w.update(dt);
      // Its weight sags the line: you can see it coming from above.
      if (w.harmful) L.push(w.x + WORM_W / 2, 350, 5);
      if (this.mode !== 'play') continue;
      if (w.harmful) w.squash = this.interfere(w.x + WORM_W / 2, !W.under);
      if ((w.state === 'move' || w.state === 'rise') && W.alive && W.onLine && W.under && w.x < W.x + 14 && w.x > W.x - 6) {
        w.bite();
        W.kill('eaten', wormBiteHit());
        sfx.play('eaten');
      }
      // Same over it from on top.
      if ((w.state === 'move' || w.state === 'rise') && W.alive && W.onLine && !W.under && w.x < W.x + 8 && w.back > W.x - 2) {
        this.cancel((w.x + w.back) / 2);
        w.kill();
      }
      if (w.harmful && w.state !== 'bite' && w.x < this.endX + 2) { w.sink(); L.impulse(w.x + 13, -80, 9); }
    }
    this.worms = this.worms.filter((w) => w.state !== 'done' && w.back > n.camX - 90);
  }

  private updateBackwaves(dt: number) {
    const W = this.wavell, L = this.line, n = this.neon;
    this.backClock += dt;
    if (!this.quiet && this.backClock > DIFF.backCheck && this.playTime > DIFF.backFrom && W.alive && W.state !== 'appear' && this.backwaves.length === 0 && this.refluxes.length === 0) {
      this.backClock = 0;
      if (Math.random() < at('backChance', this.level)) {
        this.backwaves.push({ x: n.camX - 10, dir: 1, warn: 1.1, done: false });
        this.teach('backwave', 'BACKWAVE: float over it, or TAP just as it hits', 'BACKWAVE: float over it (UP), or Z just as it hits');
      }
    }
    for (const b of this.backwaves) {
      if (b.warn > 0) {
        b.warn -= dt;
        // The line trembles behind you before it comes.
        if (Math.random() < 0.5) L.impulse(n.camX + rand(0, 20), rand(-40, 40), 3);
        if (b.warn <= 0) { b.x = n.camX - 10; L.pulse(b.x, -BACKWAVE_AMP, 11, 1); sfx.play('reflux'); }
        continue;
      }
      b.x += b.dir * L.c * dt;
      if (b.done || !W.alive || W.state === 'appear') continue;
      // Holding the line pins it, and a pinned line throws the wave back (the physics does
      // that by itself; this only keeps score).
      const reach = W.facing < 0 ? 56 : 12;
      if (W.holding && b.x >= W.x - reach) {
        b.dir = -1;
        b.done = true;
        this.addScore(10, W.x, L.sample(W.x) - 30 * W.side);
        n.shake = Math.max(n.shake, 0.8);
        sfx.play('bonus');
        continue;
      }
      if (b.x >= W.x) {
        b.done = true;
        if (W.flying) this.addScore(6, W.x, W.by - 18);
        else if (W.onLine) W.kill('zap');
      }
    }
    this.backwaves = this.backwaves.filter((b) => b.warn > 0 || (b.x < n.camX + n.viewW + 40 && b.x > n.camX - 40));
  }

  private updateBubbles(dt: number) {
    const W = this.wavell, L = this.line, n = this.neon;
    this.bubbleClock += dt;
    const every = at('bubbleEvery', this.level);
    if (!this.quiet && W.alive && W.state !== 'appear' && this.playTime > DIFF.bubbleFrom && this.bubbleClock > every) {
      this.bubbleClock = rand(-1, 0);
      const x = W.x + rand(60, 170);
      if (!this.bubbles.some((b) => Math.abs(b.x - x) < 30) && !this.snawaves.some((s) => x > s.x - 10 && x < s.back + 10)) {
        // Mostly on his side, so it is in his way.
        const side = (Math.random() < DIFF.bubbleOwnSide ? W.side : -W.side) as 1 | -1;
        this.bubbles.push(new BubbleBurst(x, side, at('bubbleGrow', this.level)));
        sfx.play('reflux', 0.25);
        this.teach('bubble', 'BUBBLE BURST: SWIPE SIDEWAYS on your side, TAP on the other, or keep away', 'BUBBLE BURST: X on your side, Z on the other, or keep away');
      }
    }
    for (const b of this.bubbles) {
      b.update(dt);
      // Crossing its root from the other side cancels it too, and the clash leaves him dizzy.
      if (b.harmful && W.alive && W.onLine && (W.under ? -1 : 1) !== b.side && Math.abs(b.x - W.x) < 6) {
        b.pop();
        const [cx, cy] = b.centre(L);
        this.fx.shatter(b.outline(L), BUBBLE_GREEN, 30, 0);
        this.fx.burst(cx, cy, 10, 30, '#ffffff', 0, 0.3);
        L.calm(b.x, 10);
        sfx.play('pop', 0.6);
        if (W.stun()) this.teach('cancel', 'OPPOSITE WAVES CANCEL: the other side is no way round', 'OPPOSITE WAVES CANCEL: the other side is no way round');
      }
      if (b.state === 'burst') {
        // The spray flies out on its own side and falls back to the line.
        const [cx, cy] = b.centre(L);
        for (let i = 0; i < 16; i++) {
          const a = rand(0.15, Math.PI - 0.15), sp = rand(55, 120);
          this.drops.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: -b.side * Math.sin(a) * sp, side: b.side, life: 1.1 });
        }
        this.fx.burst(cx, cy, 18, 60, BUBBLE_GREEN, 0, 0.4);
        L.impulse(b.x, b.side * 90, 6);
        sfx.play('pop');
      }
      if (b.state === 'grow' && b.x < this.endX + 4) b.pop();
    }
    this.bubbles = this.bubbles.filter((b) => b.state !== 'done' && b.x > n.camX - 60);
    for (const d of this.drops) {
      d.vy += d.side * 200 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life -= dt;
      // Back into the line on its own side.
      if (d.side * (d.y - L.sample(d.x)) > 0 && d.side * d.vy > 0) d.life = 0;
      if (d.life > 0 && W.onLine && (W.under ? -1 : 1) === d.side) {
        const g = L.sample(W.x);
        if (Math.abs(d.x - W.x) < 6 && d.side * (g - d.y) > -2 && d.side * (g - d.y) < 28) {
          d.life = 0;
          if (W.stun()) this.teach('dizzy', 'DIZZY: slow for a moment, and the line keeps coming', 'DIZZY: slow for a moment, and the line keeps coming');
        }
      }
    }
    this.drops = this.drops.filter((d) => d.life > 0);
  }

  private updateSparkles(dt: number) {
    const W = this.wavell, L = this.line, n = this.neon;
    this.chainT -= dt;
    if (this.chainT <= 0) this.chain = 0;
    this.sparkleClock -= dt;
    if (!this.quiet && W.alive && W.state !== 'appear' && this.playTime > 2 && this.sparkleClock <= 0 && this.sparkles.length < DIFF.sparkleMax) {
      this.sparkleClock = rand(0.6, 1.5);
      // Anywhere around him, behind too, above or below the line; gold ones high up.
      const gold = Math.random() < DIFF.sparkleGold;
      const below = !gold && Math.random() < 0.35;
      const x = W.x + rand(-130, 150);
      const y = gold ? rand(-75, -45) : below ? rand(6, 26) : rand(-40, -6);
      const life = rand(3, 4.5);
      this.sparkles.push({ x, y, vx: rand(-20, 20), vy: rand(-10, 10), life, max: life, gold, p: rand(0, 6) });
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
        hit = W.onLine && Math.abs(s.x - W.x) < 7 && h > -3 && h < 30;
      }
      if (hit) {
        s.life = 0;
        this.chain = Math.min(this.chain + 1, 8);
        this.chainT = DIFF.chainTime;
        const pts = this.chain * (s.gold ? 5 : 1);
        this.addScore(pts, s.x, s.y - 8);
        this.fx.burst(s.x, s.y, s.gold ? 20 : 10, 40, s.gold ? '#ffffff' : '#fff3a0', 0, 0.35);
        sfx.play('bonus', 0.35);
      }
    }
    this.sparkles = this.sparkles.filter((s) => s.life > 0 && s.x > n.camX - 40 && s.x < n.camX + n.viewW + 40);
  }

  /** Explain an enemy the first time it shows up, in the words of the controls in use. */
  private teach(key: string, touch: string, keys: string) {
    if (this.quiet || this.taught.has(key)) return;
    this.taught.add(key);
    this.hint = this.input.touchUsed || matchMedia('(pointer: coarse)').matches ? touch : keys;
    this.hintT = 3.5;
  }

  private updateRefluxes(dt: number) {
    const W = this.wavell, L = this.line, n = this.neon;
    this.refluxClock += dt;
    // Every so often: maybe a reflux, unless a Snawave is still coming in from the far right.
    if (!this.quiet && this.refluxClock > DIFF.refluxCheck) {
      this.refluxClock = 0;
      const incoming = this.snawaves.some((s) => s.x > n.camX + n.viewW * 0.9);
      if (W.alive && W.state !== 'appear' && this.playTime > DIFF.refluxFrom && this.refluxes.length === 0 && !incoming &&
          Math.random() < at('refluxChance', this.level)) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        this.refluxes.push({ sx: dir > 0 ? -12 : n.viewW + 12, y: Math.random() < 0.5 ? -17 : 9, dir, warn: 0.9, passed: false });
      }
    }
    for (const r of this.refluxes) {
      if (r.warn > 0) {
        r.warn -= dt;
        if (r.warn <= 0) sfx.play('reflux');
        continue;
      }
      r.sx += r.dir * DIFF.refluxSpeed * dt;
      const x = n.camX + r.sx;
      L.push(x, r.y < 0 ? -2600 : 2600, 4);
      if (Math.random() < 0.8) this.fx.spark(x, r.y, -r.dir * rand(20, 60), rand(-15, 15), 0.35, COLORS.danger);
      if (!W.alive || W.state === 'appear') continue;
      if (Math.abs(x - W.x) < 5) {
        const hit = W.flying ? Math.hypot(x - W.x, r.y - W.by) < W.bubbleR + 3
          : r.y < 0 ? W.onLine && !W.under : W.under;
        if (hit) { W.kill(W.flying ? 'pop' : 'zap'); continue; }
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
        fx.debris(c[i], c[i + 1], c[i + 2], c[i + 3], COLORS.wavell, 0.35);
        if (Math.random() < 0.12) fx.spark(c[i], c[i + 1], rand(-20, 20), rand(-40, -10), 0.45, COLORS.danger, 90);
      }
      c.length = 0;
      if (W.ember && Math.random() < 0.3) fx.spark(W.ember[0], W.ember[1], rand(-30, 30), rand(-40, 10), 0.35, '#fff1b0', 40);
      // The line starts where what is left of him ends, so it has one end: the ember.
      const left = W.stroke(L);
      if (left) this.endX = Math.max(this.endX, left[left.length - 2] - 7);
    }
    // Once the knot has come undone (or the jaws have closed), what is left flies apart
    // and the line twangs.
    if (W.death !== 'pop' && W.t >= W.linger && W.t - STEP < W.linger) {
      const pts = W.figurePoints(L);
      if (W.death === 'eaten') { fx.shatter(pts, COLORS.wavell, 40, 80, -20); L.impulse(W.x, 160, 10); n.shake = 1.6; }
      else if (W.death === 'fall') L.impulse(W.x + 8, 120, 8);
      // Pressed flat: what is left of him slides off along the line, which stays still.
      else if (W.death === 'flatten') L.calm(W.x, 14);
      else { fx.shatter(pts, '#ffffff', 70, 0); fx.shatter(pts, COLORS.danger, 40, 0); L.impulse(W.x, -110, 6); }
    }
    if (W.t > 1.7) {
      if (this.lives > 0) {
        for (const s of this.snawaves) s.sink();
        for (const w of this.worms) w.sink();
        for (const b of this.bubbles) b.pop();
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
        if (this.score > this.best) {
          this.best = this.score;
          try { localStorage.setItem(STORE, String(this.best)); } catch { /* storage blocked */ }
        }
      }
    }
  }

  /** Creatures an attack can reach: their span on the line and the side they bulge to. */
  private targets() {
    const out: { e: Snawave | Worm | BubbleBurst; x0: number; x1: number; side: number }[] = [];
    for (const s of this.snawaves) if (s.harmful && s.state !== 'bite') out.push({ e: s, x0: s.x, x1: s.back, side: 1 });
    for (const w of this.worms) if (w.harmful && w.state !== 'bite') out.push({ e: w, x0: w.x, x1: w.back, side: -1 });
    for (const b of this.bubbles) if (b.harmful) out.push({ e: b, x0: b.x - 8, x1: b.x + 8, side: b.side });
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

  /** A pull draws the line ahead in taut: the nearest creature within reach takes it. */
  private haul() {
    const W = this.wavell, f = W.facing;
    const ahead = (t: { x0: number; x1: number }) => (f > 0 ? t.x0 - W.x : W.x - t.x1);
    const t = this.targets().filter((t) => ahead(t) > -6 && ahead(t) < DIFF.pullRange).sort((a, b) => ahead(a) - ahead(b))[0];
    // The line streams in towards his hands.
    for (let i = 0; i < 14; i++) {
      const x = W.x + f * rand(14, DIFF.pullRange);
      this.fx.spark(x, this.line.sample(x), -f * rand(120, 220), rand(-6, 6), 0.3, '#9fe8ff', 0);
    }
    if (t) this.hit(t.e, t.side, 'pull', W.side, -f);
  }

  /**
   * The right attack flattens a creature (a pull for one on his side, a wipe for one
   * on the other), or shrinks it back a size if it had grown. The wrong one feeds it:
   * it grows and is thrown back. dir is the way a flattened one melts away.
   */
  private hit(e: Snawave | Worm | BubbleBurst, side: number, kind: Attack, from: number, dir: number) {
    const L = this.line, n = this.neon, W = this.wavell;
    const right = (kind === 'pull') === (side === from);
    if (e instanceof BubbleBurst) {
      const [cx, cy] = e.centre(L);
      if (!right) this.fed(cx, cy, () => e.feed(), BUBBLE_GREEN);
      else {
        e.pop();
        this.fx.burst(cx, cy, 14, 40, '#ffffff', 0, 0.35);
        this.addScore(3, cx, cy - e.side * 12);
        sfx.play('pop', 0.6);
      }
      return;
    }
    const worm = e instanceof Worm, x = e.centre;
    const y = worm ? L.sample(x) + 14 * e.sc : L.sample(x) - 34 * e.sc;
    if (!right) {
      this.fed(x, y, () => { e.grow(); e.knock((Math.sign(x - W.x) || 1) * DIFF.knock); });
      // Thrown back, it drags the line with it.
      L.impulse(x, side * 60, 8);
    } else if (e.size > 0) this.shrunk(x, y, () => e.shrink());
    else {
      // Flattened, it melts into the line and rolls on the way it was hit.
      e.kill(dir);
      L.pulse(x, -side * 6 * e.sc, 10, dir);
      this.addScore((worm ? 5 : 4) + 3 * e.peak, e.x + 12, y + (worm ? 8 : -2));
      this.fx.burst(x, L.sample(x) - side * (worm ? 8 : 18), 10, 40, COLORS.enemy, 0, 0.3);
      n.shake = Math.max(n.shake, 0.6);
      sfx.play('kill');
    }
  }

  /** The wrong wave: the creature takes it in and grows. */
  private fed(x: number, y: number, grow: () => void, color = COLORS.enemy) {
    grow();
    this.fx.burst(x, y, 12, 30, color, 0, 0.4);
    this.neon.shake = Math.max(this.neon.shake, 0.3);
    sfx.play('snawave', 0.5);
    this.teach('grow', 'WRONG ATTACK, IT GREW! Your side: SWIPE SIDEWAYS. Other side: TAP', 'WRONG ATTACK, IT GREW! Your side: X. Other side: Z');
  }

  /** The right wave on a grown creature: one size back. */
  private shrunk(x: number, y: number, shrink: () => void) {
    shrink();
    this.fx.burst(x, y, 10, 40, '#ffffff', 0, 0.3);
    sfx.play('kill', 0.5);
  }

  /**
   * An enemy centred at ex on the other side of the line from him (opposite) is the
   * opposite wave: as the two close in they press each other flat, like two pulses
   * passing through each other. Returns the enemy's height factor, and lowers his.
   */
  private interfere(ex: number, opposite: boolean): number {
    const W = this.wavell;
    if (!opposite || !W.alive || !W.onLine) return 1;
    const k = 1 - TUNE.cancelDepth * smooth(clamp((TUNE.cancelStart - Math.abs(ex - W.x)) / TUNE.cancelSpan, 0, 1));
    W.squash = Math.min(W.squash, k);
    return k;
  }

  /** They met: both melt flat into a still line. */
  private cancel(ex: number) {
    const W = this.wavell, L = this.line;
    this.fx.burst((ex + W.x) / 2, L.sample(W.x), 16, 50, '#ffffff', 0, 0.35);
    L.calm((ex + W.x) / 2, 16);
    W.kill('flatten');
    this.neon.shake = Math.max(this.neon.shake, 0.7);
    this.teach('cancel', 'OPPOSITE WAVES CANCEL: the other side is no way round', 'OPPOSITE WAVES CANCEL: the other side is no way round');
  }

  private addScore(points: number, x: number, y: number) {
    this.score += points;
    this.fx.popup(x, y, '+' + points);
  }
}
