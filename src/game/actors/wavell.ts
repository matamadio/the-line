// Wavell is a knot in the line. His body is one continuous stroke that leaves the
// line at his back toe, runs up a ribbon spine, loops out into each arm and around
// the head (the hair is a zig-zag in that loop) and comes back down to the line at
// his front toe; the game splices it into the line's own stroke. The bubble is a
// loop the line ties off and lets go.
//
// The skeleton underneath is jointed. Its key poses and clips (idle, walk cycle, both
// attacks) are keyframes in anim.json, edited in the animation lab; the first ones
// were measured from the original sprites. Poses face right with y up, in original
// pixels, origin between the feet on the line.

import type { Controls } from '../../core/input';
import type { SpringLine } from '../line';
import { COLORS, Neon, clamp, lerp, polyPath, smooth } from '../../core/neon';
import { DIFF } from '../../data/difficulty';
import { TUNE } from '../../data/tune';
import { ANIM, I, TILT, clipLength, mark, mix, namedPose, pose, type Joint, type Pose } from '../../data/anim';




/** Half the width of the ribbons (spine and arms). */
const RIB = 0.75;

/**
 * The two attacks. A wipe lifts the line on his side and sends a crest along it the
 * way he faces: it flattens a creature bulging the other way and feeds one bulging
 * his way. A pull hauls the line ahead in taut: it flattens a creature bulging his
 * way and, pulled against the grain, feeds one on the other side.
 */
export type Attack = 'wipe' | 'pull';

export type State = 'appear' | 'ground' | 'drag' | 'flip' | 'fly' | 'land' | 'dead';
/**
 * zap: hit by an enemy on his side, or the player quit. flatten: met an enemy from the
 * other side of the line, and the two opposite waves cancelled out. He sinks into the
 * line from both.
 */
export type Death = 'fall' | 'zap' | 'pop' | 'flatten';
export type WavellEvent = 'appear' | 'drag' | 'haul' | 'release' | 'flipDown' | 'flipUp' | 'fly' | 'land' | 'step' | 'dizzy' | 'grow' | 'shrink';

/** Units per second for each step of `vel` (the original scrolled 1 px every 10 ms). */
const FLY_TIME = 3.6;
/** The line loops up and ties off into the bubble... */
/** ...and on landing the bubble dives back in, then the knot rises out of it. */
/** How far ahead of his hand the held line reaches the ground. */
const REACH_FAR = 47.5;
/** Dizzy (from a Bubble Burst's spray): no moves at all for TUNE.dizzyLock, slow walking for all of TUNE.dizzyTime. */
/**
 * Caught by the end of the line, he crumbles with it: the break runs along his
 * stroke from the left root to the right one, after a moment of shock.
 */
/** How long dying takes. */
const unravel = (d: Death) => ({ fall: TUNE.burnTime, zap: TUNE.sinkTime, flatten: TUNE.sinkTime, pop: 0 })[d];

/** How tall he stands at his smallest (u). */
const HEIGHT = 28;

export class Wavell {
  x = 0;
  /** Bubble centre while flying, otherwise unused. */
  by = 0;
  facing = 1;
  /** -2..2: how fast the world scrolls, in the original's units. */
  vel = 0;
  private kick = 0;
  state: State = 'appear';
  /** How long the current appearing takes (s). */
  private appearFor = TUNE.appearTime;
  /** Caught before he had climbed out: what was still under the line stays hidden. */
  private diedClimbing = false;
  /** Sinking: his eyes have gone under. */
  private eyesGone = false;
  /** Where his eyes just popped (flat x, y of each), until the game has looked. */
  eyePop: number[] | null = null;
  death: Death = 'fall';
  t = 0;
  flip = 0;
  /** 1 on top of the line, -1 hanging under it. */
  side = 1;
  /** Seconds the dead figure stays visible (unravelling). */
  linger = 0;
  private phase = 0;
  private time = 0;
  private hair = 0;
  private landR = 9;
  /** How much of his stroke has crumbled (0..1, by length), while dying at the end of the line. */
  private burnt = 0;
  /** Pieces broken off since the game last looked: flat x0, y0, x1, y1 quads in world space. */
  readonly crumbs: number[] = [];
  /** The burning point, while he crumbles. */
  ember: [number, number] | null = null;
  /** Seconds of dizziness left. */
  dizzy = 0;
  /** How many times he has grown. An enemy's hit takes one of these instead of a life. */
  size = 0;
  /** Sparkles caught towards his next size. */
  sparks = 0;
  /** Seconds left of the glow he gets from growing. */
  glowing = 0;
  /** Drawn scale, easing towards his size. */
  scale = 1;
  /** Seconds in which enemies can't hurt him, after losing a size. */
  safe = 0;
  /** A press that came while busy, replayed as soon as he is free. */
  private buffered: 'drag' | 'pull' | 'down' | 'up' | null = null;
  /** Which attack the current 'drag' state is. */
  attack: Attack = 'wipe';
  private bufferT = 0;
  private cur: Pose = namedPose('idle');
  private from: Pose = namedPose('idle');
  private work: Pose = namedPose('idle');
  readonly events: WavellEvent[] = [];

  get onLine() { return this.state === 'ground' || this.state === 'drag' || this.state === 'land' || this.state === 'flip'; }
  get under() { return this.flip > 0.5; }
  /** Holding the line away from the ground: it is pinned, so waves bounce off it. */
  get holding() { return this.state === 'drag' && this.t > mark(this.attack, 'grab') && this.t <= mark(this.attack, 'release'); }
  get flying() { return this.state === 'fly'; }
  /** How tall he stands on the line. */
  get height() { return HEIGHT * this.scale; }
  get alive() { return this.state !== 'dead'; }
  /** Hit by an enemy: going down into the line, one hand up to the last. */
  get sinking() { return this.state === 'dead' && (this.death === 'zap' || this.death === 'flatten'); }
  /** Pressed flat by an opposite wave closing in (1: full height); set by the game. */
  squash = 1;
  /** A bigger Wavell makes a bigger bubble, which lasts longer but is easier to hit. */
  get bubbleR() { return lerp(9, 14, clamp(this.t / this.flyTime, 0, 1)) * this.scale; }
  get flyTime() { return FLY_TIME * (1 + DIFF.growBubble * this.size); }
  get flyLeft() { return this.flyTime - this.t; }
  /** Walking speed: faster for each size; dizziness slows him down, recovering as it wears off. */
  get speedMul() {
    const dizzy = this.dizzy > 0 ? lerp(1, 0.35, clamp(this.dizzy / (TUNE.dizzyTime - TUNE.dizzyLock), 0, 1)) : 1;
    return dizzy * (1 + DIFF.growWalk * this.size);
  }
  get locked() { return this.dizzy > TUNE.dizzyTime - TUNE.dizzyLock; }

  /** Hit by a Bubble Burst's spray. Only works on the line: the bubble flies through it. */
  stun() {
    if (!this.alive || this.flying || this.state === 'appear') return false;
    if (this.dizzy <= 0) this.events.push('dizzy');
    this.dizzy = TUNE.dizzyTime;
    return true;
  }

  /** Thrown back along the line, easing to a stop. */
  bounce(v: number) { this.kick = v; }

  /** Caught a sparkle: enough of them and he grows. At full size they don't add up. */
  collect() {
    if (this.size >= DIFF.growMax || ++this.sparks < DIFF.sparksPerSize) return;
    this.sparks = 0;
    this.grow();
  }

  /** One size bigger. False if he is as big as he gets. */
  grow() {
    if (this.size >= DIFF.growMax) return false;
    this.size++;
    this.glowing = DIFF.growGlow;
    this.events.push('grow');
    return true;
  }

  /**
   * Hit by an enemy. On the line, a size goes instead of a life, and he is safe for a
   * moment to get clear. A bubble has no size to give up: it pops. (The end of the
   * line doesn't come through here: it takes him whatever his size.)
   */
  hurt(kind: Death) {
    if (!this.alive || this.safe > 0) return;
    if (this.size > 0 && !this.flying) {
      this.size--;
      this.safe = DIFF.growSafe;
      this.events.push('shrink');
    } else this.kill(kind);
  }

  spawn(x: number) {
    this.size = 0;
    this.sparks = 0;
    this.glowing = 0;
    this.scale = 1;
    this.safe = 0;
    this.x = x;
    this.facing = 1;
    this.vel = 0;
    this.flip = 0;
    this.side = 1;
    this.dizzy = 0;
    this.kick = 0;
    this.buffered = null;
    this.appearFor = TUNE.appearTime;
    this.go('appear');
    this.events.push('appear');
  }

  /** The first time: the line lies flat for a moment, then he climbs slowly out of it, without a sound. */
  rise(x: number) {
    this.spawn(x);
    this.events.length = 0;
    this.appearFor = TUNE.riseTime;
    this.t = -TUNE.riseHold;
  }

  /** Still rising when the game starts: carry on from where he is, at the usual pace. */
  hurry() {
    if (this.state !== 'appear') return;
    const k = clamp(this.t / this.appearFor, 0, 1);
    this.appearFor = Math.min(this.appearFor, TUNE.appearTime);
    this.t = k * this.appearFor;
  }

  kill(kind: Death) {
    if (this.state === 'dead') return;
    // A bubble caught while the line is still tying it off has no figure left.
    if (this.state === 'fly') kind = 'pop';
    this.diedClimbing = this.state === 'appear';
    this.eyesGone = this.cur[I.head + 1] < EYES_UNDER;
    this.eyePop = null;
    this.death = kind;
    this.linger = unravel(kind);
    this.kick = 0;
    this.burnt = 0;
    this.crumbs.length = 0;
    this.ember = null;
    this.vel = 0;
    this.go('dead');
  }

  /** Show this pose (the animation lab's editor). */
  showPose(p: Pose) { this.cur.set(p); this.from.set(p); }

  private go(s: State) {
    this.from.set(this.cur);
    this.state = s;
    this.t = 0;
  }

  update(dt: number, k: Controls, line: SpringLine, canLand: boolean, top: number, ahead: number) {
    this.time += dt;
    this.t += dt;
    this.dizzy = Math.max(0, this.dizzy - dt);
    this.safe = Math.max(0, this.safe - dt);
    this.glowing = Math.max(0, this.glowing - dt);
    this.scale += (1 + DIFF.growScale * this.size - this.scale) * Math.min(1, dt * 8);
    const ground = line.sample(this.x);
    // Presses during an animation are kept for a moment, so a quick player never loses one.
    if (this.state !== 'ground' && this.state !== 'fly' && this.state !== 'dead') {
      const p = k.dragPressed ? 'drag' : k.pullPressed ? 'pull' : k.downPressed ? 'down' : k.upPressed ? 'up' : null;
      if (p) { this.buffered = p; this.bufferT = 0.2; }
    }
    this.bufferT -= dt;
    if (this.bufferT <= 0) this.buffered = null;
    switch (this.state) {
      case 'appear':
        this.vel = 0;
        this.grip(dt, line);
        if (this.t > this.appearFor) this.go('ground');
        break;
      case 'land':
        this.vel = 0;
        if (this.t > TUNE.landTime) this.go('ground');
        break;
      case 'ground': {
        this.vel = k.right && !k.left ? 1 : k.left && !k.right ? -1 : 0;
        if (this.vel) this.facing = this.vel;
        // Dizzy: the head spins and no moves come out.
        if (this.locked) { this.buffered = null; break; }
        const b = this.buffered;
        this.buffered = null;
        const drag = k.dragPressed || b === 'drag', pull = k.pullPressed || b === 'pull', down = k.downPressed || b === 'down', up = k.upPressed || b === 'up';
        if (drag || pull) { this.vel = 0; this.attack = drag ? 'wipe' : 'pull'; this.go('drag'); this.events.push('drag'); break; }
        // Down always goes through the line; up goes back through it from underneath.
        if (down || (up && this.side < 0)) {
          this.vel = 0;
          this.side = -this.side as 1 | -1;
          this.go('flip');
          this.events.push(this.side < 0 ? 'flipDown' : 'flipUp');
          break;
        }
        if (up) { this.vel = 0; this.go('fly'); this.by = ground - 15; break; }
        break;
      }
      case 'drag': {
        this.vel = 0;
        const t = this.t, f = this.facing, s = this.side, clip = this.attack, sc = this.scale;
        const grab = mark(clip, 'grab'), release = mark(clip, 'release'), haulAt = mark(clip, 'haul');
        // Where the hands hold the line: the pose at the moment he lets go.
        const P = pose(clip, release, this.work, this.from);
        if (t > grab && t <= release) {
          // Hold the line away from the ground, from the front hand down to the line
          // ahead, like the sprite, while the line under his feet stays put. Under the
          // line everything is mirrored, and the wave goes the way he faces.
          const k = smooth((t - grab) / 0.12);
          const x0 = this.x + f * P[I.handF] * sc;
          const top = -s * P[I.handF + 1] * k * sc;
          line.shape(this.x - f * 12 * sc, x0 - f * 0.5, () => 0);
          if (this.attack === 'wipe') line.shape(x0, x0 + f * REACH_FAR, (x) => top * Math.pow(Math.max(0, 1 - Math.abs(x - x0) / REACH_FAR), 1.25));
          else {
            // From the hands down to the line, then taut all the way out.
            line.shape(x0, x0 + f * 14, (x) => top * (1 - Math.abs(x - x0) / 14) ** 2);
            if (t > haulAt) line.shape(x0 + f * 14, this.x + f * ahead, () => 0);
          }
        }
        if (this.attack === 'pull' && t > haulAt && t - dt <= haulAt) this.events.push('haul');
        if (t > release && t - dt <= release) {
          line.shape(this.x - f * 12 * sc, this.x + f * (P[I.handF] * sc + REACH_FAR), () => 0);
          if (this.attack === 'wipe') line.pulse(this.x + f * 20, -TUNE.waveAmp * s, TUNE.waveWidth, f);
          // Let go of a pull: the line springs back a little.
          else line.impulse(this.x + f * 30, 25 * s, 10);
          this.events.push('release');
        }
        if (t > ANIM.clips[clip].keys[ANIM.clips[clip].keys.length - 1].t) this.go('ground');
        break;
      }
      case 'flip': {
        this.vel = 0;
        const target = this.side < 0 ? 1 : 0;
        this.flip += clamp(target - this.flip, -dt / TUNE.flipTime, dt / TUNE.flipTime);
        // Passing through the line shoves it the way he goes.
        line.push(this.x, -this.side * 2200 * Math.sin(this.flip * Math.PI), 5);
        if (this.flip === target) this.go('ground');
        break;
      }
      case 'fly': {
        this.vel = k.right && !k.left ? 2 : k.left && !k.right ? -2 : 0;
        if (this.t < TUNE.takeoff) {
          this.by -= 40 * dt;
          // The loop pulls the line up until it lets go.
          line.push(this.x, -2400 * smooth(this.t / TUNE.takeoff), 5);
          if (this.t + dt >= TUNE.takeoff) { line.impulse(this.x, 70, 6); this.events.push('fly'); }
          break;
        }
        if (k.up) this.by -= 50 * dt;
        if (k.down) this.by += 50 * dt;
        const r = this.bubbleR;
        this.by = Math.max(top + r + 2, this.by);
        if (this.by + r >= ground) {
          this.by = ground - r;
          if (k.down && canLand) {
            this.landR = r;
            this.go('land');
            this.events.push('land');
            line.impulse(this.x, 60, 5);
          }
        }
        if (this.state === 'fly' && this.t >= this.flyTime) this.kill('pop');
        break;
      }
      case 'dead':
        this.vel = 0;
        if (this.burning) this.burn(line);
        // The line sags under him and is let go as he goes through it.
        if (this.sinking) {
          line.push(this.x, this.side * 2200 * (1 - smooth(this.t / this.linger)), 4);
          // Pressed down by the wave that got him: he springs back as it lets go.
          this.squash += (1 - this.squash) * Math.min(1, dt * 12);
          // Gone under: the line closes over him in a small arch that fades out.
          if (this.t >= this.linger && this.t - dt < this.linger) line.impulse(this.x + this.facing * 8, -60 * this.side, 6);
        }
        break;
    }
    this.x += this.vel * TUNE.walkSpeed * dt * (this.state === 'ground' ? this.speedMul : 1);
    this.x += this.kick * dt;
    this.kick *= Math.exp(-5 * dt);

    // Footsteps press the line and the figure's weight dents it.
    if (this.onLine && this.state !== 'land') line.push(this.x, 1800, 3);
    // His weight comes on as he rises, so the line takes it without a jolt.
    else if (this.state === 'appear') line.push(this.x, 1800 * smooth(this.t / this.appearFor), 3);
    if (this.state === 'ground' && this.vel) {
      const walk = ANIM.clips.walk, len = walk.length ?? 0.4;
      const before = this.phase;
      this.phase = (this.phase + (dt / len) * this.speedMul) % 1;
      for (const [m, dx] of [['stepFront', 7], ['stepBack', -6]] as const) {
        // A foot lands when the cycle passes its mark.
        const at = (walk.marks?.[m] ?? 0) / len;
        const crossed = before <= this.phase ? before < at && at <= this.phase : at > before || at <= this.phase;
        if (crossed) { line.impulse(this.x + this.facing * dx, 26 * this.side, 3); this.events.push('step'); }
      }
    }
    this.hair += (this.vel * 0.5 - this.hair) * Math.min(1, dt * 8);
    this.solvePose();
    if (this.sinking && !this.eyesGone && this.cur[I.head + 1] < EYES_UNDER) {
      this.eyesGone = true;
      const tf = this.transform(line), H = this.headTf(), look = this.lookUp;
      this.eyePop = [];
      for (const ex of EYES) this.eyePop.push(...tf(...H(ex + look * LOOK_FORWARD, PUPIL_Y + look)));
    }
  }

  /** How far through climbing out he is, 0..1. */
  private get climbed() { return clamp(this.t / this.appearFor, 0, 1); }

  /** Climbing out: each hand slaps down on the line, and it sags under them until he lets go. */
  private grip(dt: number, line: SpringLine) {
    const grab = mark('appear', 'grab'), letGo = mark('appear', 'letGo'), k = this.climbed;
    if (k < grab || k > letGo) return;
    const slap = (this.t - dt) / this.appearFor < grab;
    for (const hand of [I.handB, I.handF]) {
      const x = this.x + this.facing * this.cur[hand];
      if (slap) line.impulse(x, 26, 3);
      line.push(x, 1100, 2);
    }
  }

  private solvePose() {
    const target = this.work;
    const blendIn = (p: Pose, time: number) => mix(this.from, p, smooth(this.t / time), this.cur);
    switch (this.state) {
      case 'ground':
        if (this.vel) pose('walk', this.phase * (ANIM.clips.walk.length ?? 0.4), target);
        else {
          namedPose('idle', target);
          const b = Math.sin(this.time * 3) * 0.35;
          for (const j of ['neck', 'elbowB', 'handB', 'elbowF', 'handF', 'head'] as const) target[I[j] + 1] += b;
          target[I.hip + 1] += b * 0.5;
          target[I.handF] += Math.sin(this.time * 1.7) * 0.4;
        }
        blendIn(target, 0.12);
        break;
      case 'drag': {
        pose(this.attack, this.t, this.cur, this.from);
        break;
      }
      case 'appear':
        pose('appear', this.climbed * clipLength(ANIM.clips.appear), this.cur);
        break;
      case 'dead':
        if (this.sinking) {
          const k = clamp(this.t / this.linger, 0, 1), len = clipLength(ANIM.clips.sink);
          // Caught still climbing out, he slips straight back rather than standing up first.
          if (this.diedClimbing) mix(this.from, pose('sink', len, target), smooth(k), this.cur);
          else pose('sink', k * len, this.cur, this.from);
          // The hand left up waves for help.
          this.cur[I.handF] += Math.sin(this.time * 17) * 0.7 * smooth(k / 0.5);
        }
        // Otherwise frozen where it was hit.
        break;
      default:
        blendIn(namedPose('idle', target), 0.12);
    }
  }

  // ---------------------------------------------------------------- the stroke

  get burning() { return this.state === 'dead' && this.death === 'fall' && this.burnt < 1; }

  /** Advance the break along the stroke and break off what it passed. */
  private burn(line: SpringLine) {
    const k = clamp((this.t - TUNE.burnShock) / (this.linger - TUNE.burnShock), 0, 1);
    // Slow to catch, then racing.
    const next = Math.pow(k, TUNE.burnEase);
    if (next <= this.burnt) return;
    const pts = this.fullStroke(line), lens = arcLengths(pts), total = lens[lens.length - 1];
    const from = this.burnt * total, to = next * total;
    // Pieces about 2.5 units long, so the outline comes apart in its own shape.
    for (let d = from; d < to; d += 2.5) {
      const [x0, y0] = pointAt(pts, lens, d), [x1, y1] = pointAt(pts, lens, Math.min(to, d + 2.5));
      this.crumbs.push(x0, y0, x1, y1);
    }
    this.burnt = next;
  }

  /** Sinking: how far his eyes have turned up, towards the hand he has raised. */
  private get lookUp() { return this.sinking ? smooth(this.t / this.linger / 0.3) * LOOK_UP : 0; }

  /** Pose space to world: squashes for landing and flipping, and follows the line. */
  private transform(line: SpringLine) {
    const ground = line.sample(this.x);
    // Flipping turns him inside out through the line; under it he stays mirrored.
    let sy = Math.cos(this.flip * Math.PI) * this.squash, sx = 1 + 0.45 * Math.sin(this.flip * Math.PI), jit = 0;
    const grow = (k: number) => {
      sy = k < 0.7 ? smooth(k / 0.7) * 1.12 : lerp(1.12, 1, (k - 0.7) / 0.3);
      sx = lerp(1.6, 1, smooth(k));
    };
    if (this.state === 'land') grow(clamp((this.t - TUNE.landDive) / (TUNE.landTime - TUNE.landDive), 0, 1));
    else if (this.state === 'dead' && this.death === 'fall') jit = 0.3;
    const f = this.facing, x0 = this.x, scale = this.scale;
    // Dizzy: the whole figure sways from the feet up.
    const sway = this.dizzy > 0 && this.alive ? Math.sin(this.time * 7) * 0.09 * clamp(this.dizzy / 0.8, 0, 1) : 0;
    return (px: number, py: number): [number, number] => {
      px *= scale;
      py *= scale;
      const wx = x0 + f * px * sx + sway * py + (jit ? (Math.random() - 0.5) * jit : 0);
      // Low points ride the line under them; higher ones move with the body.
      const h = py * sy, w = clamp(Math.abs(h) / 8, 0, 1);
      return [wx, lerp(line.sample(wx), ground, w) - h + (jit ? (Math.random() - 0.5) * jit : 0)];
    };
  }

  /** Head-local (x right, y up from the head centre) to pose space. */
  private headTf() {
    const p = this.cur, hx = p[I.head], hy = p[I.head + 1], cs = Math.cos(p[TILT]), sn = Math.sin(p[TILT]);
    return (lx: number, ly: number): [number, number] => [hx + lx * cs + ly * sn, hy - lx * sn + ly * cs];
  }

  /** The figure as one stroke in pose space, from the back toe to the front toe. */
  private strokePose(): number[] {
    const p = this.cur, o: number[] = [];
    const J = (j: Joint): [number, number] => [p[I[j]], p[I[j] + 1]];
    const add = (x: number, y: number) => { o.push(x, y); };
    const [hx, hy] = J('hip'), [nx, ny] = J('neck');
    const sd = Math.hypot(nx - hx, ny - hy) || 1;
    // The spine's normal, pointing backwards: up one side of the ribbon, down the other.
    const ux = (-(ny - hy) / sd) * RIB, uy = ((nx - hx) / sd) * RIB;

    // Out along one side to the hand, round the fist, back along the other side.
    const arm = (e: Joint, h: Joint) => {
      const [ex, ey] = J(e), [px, py] = J(h);
      const ad = Math.hypot(px - ex, py - ey) || 1;
      const dx = (px - ex) / ad, dy = (py - ey) / ad, mx = -dy * RIB, my = dx * RIB;
      add(ex + mx, ey + my);
      add(px + mx, py + my);
      const a0 = Math.atan2(my, mx);
      for (let i = 1; i < 5; i++) { const a = a0 - (i / 5) * Math.PI; add(px + dx * 0.6 + Math.cos(a) * 1.6, py + dy * 0.6 + Math.sin(a) * 1.6); }
      add(px - mx, py - my);
      add(ex - mx, ey - my);
      add(nx, ny);
    };

    // Round the head from the chin, front side first; the hair is a zig-zag in the
    // same loop. The stroke crosses itself at the chin: the knot.
    const head = () => {
      const H = this.headTf();
      const egg = (th: number) => {
        const w = 0.42 + 0.58 * Math.pow((1 - Math.cos(th)) / 2, 0.6);
        return H(4.3 * Math.sin(th) * w + 1.1 * Math.max(0, Math.cos(th)) ** 3, -6.1 * Math.cos(th));
      };
      add(...H(-0.8, -6.6));
      for (let th = 0.12; th < 0.7 * Math.PI; th += Math.PI / 12) add(...egg(th));
      const sway = -this.hair * 1.6;
      for (let i = 0; i <= 8; i++) {
        const a = lerp(0.75, 2.5, i / 8);
        const r = i % 2 ? 9.3 : 5.6;
        const tip = i % 2 ? sway + Math.sin(this.time * 9 + i) * 0.25 : 0;
        add(...H(Math.cos(a) * r * 0.62 + tip, Math.sin(a) * r));
      }
      for (let th = 1.35 * Math.PI; th < 1.95 * Math.PI; th += Math.PI / 12) add(...egg(th));
      add(...H(0.9, -6.6));
    };

    add(...J('toeB')); add(...J('footB')); add(...J('kneeB'));
    add(hx + ux, hy + uy); add(nx + ux, ny + uy);
    arm('elbowB', 'handB');
    head();
    add(nx, ny);
    arm('elbowF', 'handF');
    add(nx - ux, ny - uy); add(hx - ux, hy - uy);
    add(...J('kneeF')); add(...J('footF')); add(...J('toeF'));
    return o;
  }

  /** The line looping up into a bubble: k = 0 flat on the line, 1 tied off. */
  private pinch(line: SpringLine, k: number, r: number): number[] {
    const x = this.x, g = line.sample(x), s = smooth(k);
    const rr = r * lerp(0.3, 1, s);
    const cy = lerp(g - rr * 0.5, this.by, s);
    const root = lerp(10, 0.8, s);
    const out = [x - root, line.sample(x - root)];
    // Start at the lower right and go the long way round, so the stroke crosses
    // itself under the loop.
    const a0 = Math.PI / 2 - 0.55, a1 = a0 - Math.PI * 2 + 1.1;
    for (let i = 0; i <= 16; i++) {
      const a = lerp(a0, a1, i / 16);
      out.push(x + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    out.push(x + root, line.sample(x + root));
    return out;
  }

  /**
   * The stroke to splice into the line, in world space and left to right, or null
   * when Wavell is not part of the line. While he holds the line up, it ends at
   * his front hand and the line carries on from there. During a pull it ends in the
   * bulge, which stays within `room` of him.
   */
  stroke(line: SpringLine, room = Infinity): number[] | null {
    if (this.state === 'fly') return this.t < TUNE.takeoff ? this.pinch(line, this.t / TUNE.takeoff, this.bubbleR) : null;
    if (this.state === 'land' && this.t < TUNE.landDive) return this.pinch(line, 1 - this.t / TUNE.landDive, this.landR);
    if (this.state === 'dead' && this.death === 'fall') {
      // Only what the break hasn't reached yet, starting at the burning point.
      if (this.burnt >= 1) { this.ember = null; return null; }
      const pts = this.fullStroke(line), lens = arcLengths(pts);
      const d = this.burnt * lens[lens.length - 1];
      let i = 0;
      while (i < lens.length - 1 && lens[i + 1] <= d) i++;
      this.ember = pointAt(pts, lens, d);
      return [...this.ember, ...pts.slice((i + 1) * 2)];
    }
    if (this.state === 'dead' && (this.death === 'pop' || this.t >= this.linger)) return null;
    return this.fullStroke(line, room);
  }

  /** The whole figure as a stroke in world space, left to right. */
  private fullStroke(line: SpringLine, room = Infinity): number[] {
    const tf = this.transform(line);
    const p = this.state === 'appear' || this.sinking || (this.state === 'dead' && this.diedClimbing) ? aboveLine(this.strokePose()) : this.strokePose();
    const out: number[] = [];
    for (let i = 0; i < p.length; i += 2) out.push(...tf(p[i], p[i + 1]));
    if (this.facing < 0) {
      for (let i = 0, j = out.length - 2; i < j; i += 2, j -= 2) {
        [out[i], out[j]] = [out[j], out[i]];
        [out[i + 1], out[j + 1]] = [out[j + 1], out[i + 1]];
      }
    }
    if (this.state === 'drag' && this.attack === 'pull') {
      if (this.facing < 0) out.unshift(...this.pullTail(line, out[0], out[1], room));
      else out.push(...this.pullTail(line, out[out.length - 2], out[out.length - 1], room));
    } else if (this.holding) {
      const hand = tf(this.cur[I.handF], this.cur[I.handF + 1]);
      if (this.facing < 0) out.unshift(...hand); else out.push(...hand);
    }
    return out;
  }

  /**
   * The bulge of a pull: from where his stroke ends, the line eases down ahead of him.
   * It is only drawn, on top of the real line, so the pull still does the same to
   * everything on the line; it stops short of the next creature (`room` away from
   * him) and sinks away as the keyframes bring his stroke back down.
   */
  pullTail(line: SpringLine, ex: number, ey: number, room = Infinity): number[] {
    const f = this.facing;
    const len = Math.max(6, Math.min(TUNE.pullBulge * this.scale, room - f * (ex - this.x)));
    const lift = ey - line.sample(ex), n = Math.ceil(len / 3), out: number[] = [];
    for (let i = 1; i <= n; i++) {
      const j = f < 0 ? n + 1 - i : i, x = ex + (f * len * j) / n;
      out.push(x, line.sample(x) + lift * (1 - smooth(j / n)));
    }
    return out;
  }

  /** The first part of the stroke ahead of the break, for the hot glow. */
  private hotStretch(line: SpringLine, len: number): number[] | null {
    const s = this.stroke(line);
    if (!s) return null;
    const out = [s[0], s[1]];
    let d = 0;
    for (let i = 2; i < s.length && d < len; i += 2) {
      d += Math.hypot(s[i] - s[i - 2], s[i + 1] - s[i - 1]);
      out.push(s[i], s[i + 1]);
    }
    return out;
  }

  /** His shape as he stands, or the bubble's ring: what the aura of growing plays over. */
  auraPoints(line: SpringLine): number[] {
    if (!this.flying) return this.stroke(line) ?? [];
    const out: number[] = [];
    for (let i = 0; i <= 48; i++) {
      const a = -Math.PI / 2 + (i / 48) * Math.PI * 2;
      out.push(this.x + Math.cos(a) * this.bubbleR, this.by + Math.sin(a) * this.bubbleR);
    }
    return out;
  }

  /**
   * Just grew. His outline stays as it is. Fine copies of it ripple outwards, turning from
   * cyan to violet as they go, while light runs along him from both feet to meet at the head.
   */
  private drawAura(neon: Neon, line: SpringLine) {
    const pts = this.auraPoints(line);
    if (pts.length < 4) return;
    const t = 1 - this.glowing / DIFF.growGlow, fade = Math.min(1, this.glowing / 0.25);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
      y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
    }
    // On the line they grow out of it, from his feet; the bubble's spread all round.
    const cx = (x0 + x1) / 2, cy = this.flying ? (y0 + y1) / 2 : this.under ? y0 : y1;
    for (let i = 0; i < AURA_RIPPLES; i++) {
      const e = (t - i * AURA_GAP) / AURA_RIPPLE;
      if (e <= 0 || e >= 1) continue;
      const k = 1 + AURA_REACH * (1 - (1 - e) * (1 - e)), echo = new Path2D();
      const copy = pts.map((v, j) => (j % 2 ? cy + (v - cy) * k : cx + (v - cx) * k));
      polyPath(copy, false, echo);
      neon.glow(echo, `hsl(${185 + 100 * e}, 100%, 72%)`, 0.32, (1 - e) * (1 - e) * 1.3 * fade);
    }
    const lens = arcLengths(pts), len = lens[lens.length - 1];
    const run = len / 2 * ((t * AURA_RUNS) % 1);
    for (const from of [0, len]) {
      const dir = from ? -1 : 1, tail = new Path2D(), head = new Path2D();
      const trail = (path: Path2D, long: number) => {
        const out: number[] = [];
        for (let i = 0; i <= 8; i++) out.push(...pointAt(pts, lens, from + dir * Math.max(0, run - (long * i) / 8)));
        polyPath(out, false, path);
      };
      trail(tail, len * 0.16);
      trail(head, len * 0.04);
      neon.glow(tail, '#9fe8ff', 0.5, 0.8 * fade);
      neon.glow(head, '#ffffff', 0.6, 1.4 * fade);
    }
  }

  /** Everything that isn't part of the line: the eyes, or the whole bubble. */
  drawFeatures(neon: Neon, line: SpringLine) {
    if (this.glowing > 0 && this.alive) this.drawAura(neon, line);
    // Just lost a size: he flashes for as long as nothing can hurt him.
    if (this.safe > 0 && this.alive && Math.floor(this.time * 14) % 2 === 0) {
      const s = this.stroke(line);
      if (s) neon.glow(polyPath(s), COLORS.danger, 0.9, 1);
    }
    if (this.state === 'fly') { if (this.t >= TUNE.takeoff) this.drawBubble(neon); return; }
    if (this.state === 'land' && this.t < TUNE.landDive + 0.08) return;
    if (this.burning) { this.drawBurn(neon, line); if (this.burnt > 0.5) return; }
    else if (this.state === 'dead' && !this.sinking) return;
    // Under the line: his eyes haven't come up yet, or have gone.
    if ((this.state === 'appear' && this.cur[I.head + 1] < 1.5) || (this.sinking && this.eyesGone)) return;
    const tf = this.transform(line), H = this.headTf();
    const E = (lx: number, ly: number) => tf(...H(lx, ly));
    const eyes = new Path2D();
    // A slow blink now and then.
    const open = (this.time % 3.7) < 0.12 ? 0.15 : 1;
    const look = this.lookUp;
    for (const ex of EYES) {
      // Sinking, the brows go up and the pupils roll up after them.
      const brow = 1.9 + look * 0.6;
      polyPath([...E(ex - 0.7, brow + (ex < 1 ? 0.5 : -0.1)), ...E(ex + 0.7, brow + (ex < 1 ? -0.1 : 0.5))], false, eyes);
      const [dx, dy] = E(ex + look * LOOK_FORWARD, PUPIL_Y + look);
      eyes.moveTo(dx + 0.45, dy);
      eyes.ellipse(dx, dy, 0.45, 0.45 * open, 0, 0, Math.PI * 2);
    }
    neon.glow(eyes, this.sinking ? COLORS.danger : COLORS.white, 0.5);

    if (this.dizzy > 0 && this.alive) {
      // Three little stars circling his head.
      const stars = new Path2D(), amt = clamp(this.dizzy / 0.6, 0, 1);
      for (let i = 0; i < 3; i++) {
        const a = this.time * 5 + (i * Math.PI * 2) / 3;
        const [cx, cy] = E(Math.cos(a) * 7, 9.5 + Math.sin(a) * 1.8);
        const r = 1.3 * amt * (Math.sin(a) > 0 ? 1 : 0.7);
        for (let j = 0; j <= 5; j++) {
          const b = this.time * 3 + (j * Math.PI * 4) / 5;
          if (j === 0) stars.moveTo(cx + Math.cos(b) * r, cy + Math.sin(b) * r);
          else stars.lineTo(cx + Math.cos(b) * r, cy + Math.sin(b) * r);
        }
      }
      neon.glow(stars, '#b6ff6a', 0.45, amt);
    }
  }

  /** The break as it runs along him: a white-hot point and the stroke glowing ahead of it. */
  private drawBurn(neon: Neon, line: SpringLine) {
    const hot = this.hotStretch(line, 10);
    if (!hot || !this.ember) return;
    const flick = 0.7 + Math.random() * 0.5;
    neon.glow(polyPath(hot), COLORS.danger, 1.3, flick);
    const [ex, ey] = this.ember, core = new Path2D();
    core.arc(ex, ey, 0.9 + Math.random() * 0.5, 0, Math.PI * 2);
    neon.glow(core, '#ffffff', 1.2, 1.4);
  }

  private drawBubble(neon: Neon) {
    const f = clamp(this.t / this.flyTime, 0, 1);
    // Yellow, green, blue, then red and blinking just before it pops (as in the original).
    const hue = f < 0.45 ? lerp(52, 140, f / 0.45) : f < 0.82 ? lerp(140, 235, (f - 0.45) / 0.37) : lerp(235, 360, (f - 0.82) / 0.18);
    const color = `hsl(${hue % 360} 100% 60%)`;
    const r = this.bubbleR + Math.sin(this.time * 9) * 0.35;
    const x = this.x, y = this.by + Math.sin(this.time * 4) * 0.8;
    const ring = new Path2D();
    if (f > 0.82) {
      const dashes = 14;
      for (let i = 0; i < dashes; i++) {
        const a = (i / dashes) * Math.PI * 2 + this.time;
        ring.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        ring.arc(x, y, r, a, a + (Math.PI * 2) / dashes * 0.55);
      }
    } else {
      // One loop of line, crossed and tied off at the bottom, with two loose ends.
      const sw = Math.sin(this.time * 5) * 0.8;
      ring.moveTo(x - 2.4 + sw, y + r + 3.6);
      ring.quadraticCurveTo(x - 0.4, y + r + 1.2, x + Math.cos(Math.PI / 2 - 0.3) * r, y + Math.sin(Math.PI / 2 - 0.3) * r);
      ring.ellipse(x, y, r, r * (1 - Math.sin(this.time * 6) * 0.03), 0, Math.PI / 2 - 0.3, Math.PI / 2 + 0.3 - Math.PI * 2, true);
      ring.quadraticCurveTo(x + 0.4, y + r + 1.2, x + 2.4 - sw, y + r + 3.6);
    }
    const blinkOff = f > 0.9 && Math.floor(this.time * 12) % 2 === 0;
    neon.glow(ring, color, 0.85, blinkOff ? 0.4 : 1);
    const shine = new Path2D();
    shine.arc(x, y, r * 0.72, -2.5, -1.9);
    neon.glow(shine, '#ffffff', 0.45, 0.6);
    const eyes = new Path2D();
    for (const ex of [-3.4, 3.4]) {
      eyes.moveTo(x + ex - 0.9, y - 2.6 + (ex < 0 ? -0.5 : 0.4));
      eyes.lineTo(x + ex + 0.9, y - 2.6 + (ex < 0 ? 0.4 : -0.5));
    }
    neon.glow(eyes, COLORS.white, 0.55);
  }
}

/** The aura of growing: its ripples, the share of it each takes and comes after the last, how far they spread, and the runs of light. */
const AURA_RIPPLES = 3, AURA_RIPPLE = 0.5, AURA_GAP = 0.22, AURA_REACH = 1.1, AURA_RUNS = 2;

/** His eyes, across the head; the pupils' height; how far they roll up and forward when sinking. */
const EYES = [0.6, 2.9], PUPIL_Y = 0.9, LOOK_UP = 0.75, LOOK_FORWARD = 0.4;
/** How low his head can go, sinking, before his eyes are at the line and pop. */
const EYES_UNDER = -0.85;

/**
 * A stroke in pose space, as the line would draw what is above it: each part that shows
 * is a hump, and they run one after the other from left to right. So the line goes up
 * and over him and carries on, with nothing across his face where it passes behind him.
 */
function aboveLine(p: number[]): number[] {
  const humps: number[][] = [];
  let hump: number[] | null = null;
  for (let i = 0; i < p.length; i += 2) {
    const x = p[i], y = p[i + 1], above = y > 0;
    if (i > 0 && above !== p[i - 1] > 0) {
      const at = lerp(p[i - 2], x, p[i - 1] / (p[i - 1] - y));
      if (above) humps.push(hump = [at, 0]);
      else { hump?.push(at, 0); hump = null; }
    }
    if (above) {
      if (!hump) humps.push(hump = []);
      hump.push(x, y);
    }
  }
  for (const h of humps) {
    if (h[0] <= h[h.length - 2]) continue;
    for (let i = 0, j = h.length - 2; i < j; i += 2, j -= 2) {
      [h[i], h[j]] = [h[j], h[i]];
      [h[i + 1], h[j + 1]] = [h[j + 1], h[i + 1]];
    }
  }
  humps.sort((a, b) => a[0] - b[0]);
  const out = [humps.length ? Math.min(p[0], humps[0][0]) : p[0], 0];
  let end = -Infinity, last: number[] | null = null;
  for (const h of humps) {
    // One that lies within the last is behind it.
    if (h[h.length - 2] <= end) continue;
    // One that starts under the last: getting back to its start would draw a piece of
    // line that isn't there, so go back over the last hump instead, if that leaves less.
    if (last && h[0] < end && Math.abs(h[0] - last[0]) < end - h[0]) {
      for (let i = last.length - 4; i >= 0; i -= 2) out.push(last[i], last[i + 1]);
    }
    out.push(...h);
    end = h[h.length - 2];
    last = h;
  }
  out.push(Math.max(p[p.length - 2], end), 0);
  return out;
}

/** Running length along flat [x, y, ...] points, one entry per point. */
export function arcLengths(p: number[]): number[] {
  const out = [0];
  for (let i = 2; i < p.length; i += 2) out.push(out[out.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]));
  return out;
}

/** The point at distance d along the points. */
export function pointAt(p: number[], lens: number[], d: number): [number, number] {
  let i = 0;
  while (i < lens.length - 2 && lens[i + 1] < d) i++;
  const seg = lens[i + 1] - lens[i] || 1, f = clamp((d - lens[i]) / seg, 0, 1);
  return [lerp(p[i * 2], p[i * 2 + 2], f), lerp(p[i * 2 + 1], p[i * 2 + 3], f)];
}
