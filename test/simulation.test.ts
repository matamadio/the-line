// Plays the real game with scripted keys. The animation lab's scrubbing and live tuning
// rely on the simulation being exact: same seed and same keys, same game.

import { DIFF, levelStart } from '../src/data/difficulty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Controls, Input } from '../src/core/input';
import { sfx } from '../src/core/sfx';
import { STYLES } from '../src/core/styles';
import { METERS } from '../src/core/music';
import { I } from '../src/data/anim';
import { TUNE } from '../src/data/tune';
import { MORPH_TIME, TitleDust } from '../src/game/title';
import { TITLE_HINTS, VERSION_TEXT, audioButton, nostalgiaButton } from '../src/game/hud';
import { strokeWord } from '../src/game/lettering';
import { CREDIT_NAMES, ENTRIES, MENU_FOCUS, depthScale } from '../src/game/menu';
import { ACTIONS, bindKey, bindPad, defaultBindings, keyLabel, padLabel } from '../src/core/controls';
import { hasGlyph } from '../src/core/pixelfont';
import { IDLE, headlessGame, seeded } from './helpers';

// No audio in tests. start() would otherwise open an AudioContext.
vi.mock('../src/core/sfx', () => ({ sfx: { pause() {}, unlock() {}, play() {}, toggleMute() {}, restartMusic() {}, setNostalgia() {}, preview() {}, endPreview() {}, ready: true, cycleStyle() {}, beat() {}, call() {}, cancelled() {}, fed() {}, grew() {}, shrank() {}, hum() {}, rumble() {}, crunch() {}, slam() {}, sentBack() {}, bossHit() {}, meow() {}, whirr() {}, croak() {}, muted: true } }));

const SECONDS = 120;
const STEPS_PER_SECOND = 120;

/** Runs a scripted game and returns what it went through. Extra lives keep a clumsy player in for the later enemies. */
function play(seed: number, startLives?: number) {
  Math.random = seeded(seed);
  const keys = seeded(seed + 1);
  const g = headlessGame();
  g.start();
  if (startLives) g.lives = startLives;
  const seen = { sinepedes: 0, urchins: 0, worms: 0, bubbles: 0, deaths: 0, maxScore: 0 };
  let lives = g.lives, k: Controls = IDLE;
  for (let i = 0; i < SECONDS * STEPS_PER_SECOND; i++) {
    if (i % 30 === 0) {
      k = { ...IDLE, right: keys() < 0.85, downPressed: keys() < 0.05, upPressed: keys() < 0.04, dragPressed: keys() < 0.2, pullPressed: keys() < 0.25 };
    } else k = { ...k, downPressed: false, upPressed: false, dragPressed: false, pullPressed: false };
    g.tick(k);
    if (g.mode === 'over') g.start();
    seen.sinepedes = Math.max(seen.sinepedes, g.sinepedes.length);
    seen.urchins = Math.max(seen.urchins, g.urchins.length);
    seen.worms = Math.max(seen.worms, g.worms.length);
    seen.bubbles = Math.max(seen.bubbles, g.bubbles.length);
    seen.maxScore = Math.max(seen.maxScore, g.score);
    if (g.lives < lives) seen.deaths++;
    lives = g.lives;
    for (const v of [g.endX, g.wavell.x, g.wavell.by, g.line.sample(g.wavell.x)]) {
      if (!Number.isFinite(v)) throw new Error(`not a number at step ${i}`);
    }
  }
  return { seen, score: g.score, level: g.level, lives: g.lives, x: g.wavell.x, endX: g.endX };
}

// For every test in this file: the browser APIs the game touches while it plays (a hint
// asks matchMedia how to word itself), and the same random numbers every run, so no test
// passes or fails on the luck of the draw.
const fileRandom = Math.random;
beforeEach(() => {
  Math.random = seeded(1);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('Path2D', class { moveTo() {} lineTo() {} quadraticCurveTo() {} arc() {} closePath() {} rect() {} });
});
afterEach(() => {
  Math.random = fileRandom;
  vi.unstubAllGlobals();
});

describe('the simulation', () => {
  const nativeRandom = Math.random;
  beforeEach(() => {
    // The only browser API the rules touch (to word a hint for touch or keyboard).
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('Path2D', class { moveTo() {} lineTo() {} quadraticCurveTo() {} arc() {} closePath() {} });
  });
  afterEach(() => {
    Math.random = nativeRandom;
    vi.unstubAllGlobals();
  });

  it('is exact: the same seed and keys give the same game', () => {
    expect(play(7)).toEqual(play(7));
  });

  it('plays a couple of minutes with every kind of enemy and no broken numbers', () => {
    const { seen } = play(11, 20);
    expect(seen.sinepedes).toBeGreaterThan(0);
    expect(seen.urchins).toBeGreaterThan(0);
    expect(seen.worms).toBeGreaterThan(0);
    expect(seen.bubbles).toBeGreaterThan(0);
    expect(seen.deaths).toBeGreaterThan(0);
    expect(seen.maxScore).toBeGreaterThan(0);
  });

  it('a Wavell who stands still is caught by the end of the line', () => {
    Math.random = seeded(3);
    const g = headlessGame();
    g.quiet = true;
    g.start();
    const lives = g.lives;
    for (let i = 0; i < 20 * STEPS_PER_SECOND; i++) g.tick(IDLE);
    expect(g.lives).toBeLessThan(lives);
  });
});

describe('the rise on load', () => {
  const run = (g: ReturnType<typeof headlessGame>, seconds: number) => {
    for (let i = 0; i < seconds * STEPS_PER_SECOND; i++) g.tick(IDLE);
  };

  it('keeps the line flat until he has grown out of it, in the middle of the screen', () => {
    const g = headlessGame();
    run(g, TUNE.riseHold);
    expect(g.wavell.state).toBe('appear');
    expect(Math.max(...g.line.y.map(Math.abs))).toBe(0);
    expect(g.neon.camX + g.neon.viewW * MENU_FOCUS).toBeCloseTo(g.wavell.x);
    run(g, TUNE.riseTime * 0.9);
    expect(g.wavell.state).toBe('appear');
    run(g, TUNE.riseTime * 0.2);
    expect(g.wavell.state).toBe('ground');
  });

  it('climbs out of the line hands first, and nothing shows below it', () => {
    const g = headlessGame();
    g.start();
    const W = g.wavell;
    /** How high he stands above the line and how far he shows below it. */
    const extent = () => {
      const o = W.stroke(g.line)!;
      let up = 0, down = 0;
      for (let i = 0; i < o.length; i += 2) {
        const h = g.line.sample(o[i]) - o[i + 1];
        up = Math.max(up, h);
        down = Math.max(down, -h);
      }
      return { up, down };
    };
    const seen: number[] = [];
    while (W.state === 'appear') {
      run(g, 0.1);
      if (W.state !== 'appear') break;
      const e = extent();
      seen.push(e.up);
      expect(e.down).toBeLessThan(2.5);
    }
    // Only the fists at first, then the head, then all of him.
    expect(seen[0]).toBeLessThan(3);
    expect(seen[2]).toBeLessThan(4);
    expect(seen[seen.length - 1]).toBeGreaterThan(25);
  });

  it.each([['on top of the line', 1], ['under the line', -1]])('hit by an enemy %s, he sinks into it with one hand up to the last', (_name, side) => {
    const g = headlessGame();
    g.start();
    const W = g.wavell;
    W.state = 'ground';
    if (side < 0) { W.side = -1; W.flip = 1; }
    W.hurt('zap');
    /** The furthest point out from the line on his side, and how far he shows on the other. */
    const reach = () => {
      const o = W.stroke(g.line)!;
      let out = 0, x = 0, wrong = 0;
      for (let i = 0; i < o.length; i += 2) {
        const h = side * (g.line.sample(o[i]) - o[i + 1]);
        if (h > out) { out = h; x = o[i]; }
        wrong = Math.max(wrong, -h);
      }
      return { out, x, wrong };
    };
    const seen: { out: number; x: number }[] = [];
    while (W.t < W.linger - 0.05) {
      run(g, 0.05);
      const r = reach();
      seen.push(r);
      expect(r.wrong).toBeLessThan(3);
    }
    // Late on, what still shows is the raised hand, off to one side of him.
    const late = seen[Math.floor(seen.length * 0.88)];
    expect(late.out).toBeGreaterThan(2);
    expect(late.out).toBeLessThan(10);
    expect(Math.abs(late.x - W.x)).toBeGreaterThan(5);
    run(g, 0.1);
    expect(W.stroke(g.line)).toBeNull();
    expect(g.lives).toBeGreaterThanOrEqual(0);
  });

  it('leaves no line across his face as he sinks, and his eyes pop once, in red', () => {
    const g = headlessGame();
    g.start();
    const W = g.wavell;
    W.state = 'ground';
    W.hurt('zap');
    const sparks = () => (g.fx as unknown as { sparks: { color: string }[] }).sparks.length;
    let pops = 0, last = sparks();
    while (W.t < W.linger) {
      run(g, 1 / STEPS_PER_SECOND);
      const now = sparks();
      if (now >= last + 20) pops++;
      last = now;
      const head = (W as unknown as { cur: Float32Array }).cur[I.head + 1];
      if (head < 1 && head > -2) {
        // The head is cut by the line: nothing lies on the line under it.
        const o = W.stroke(g.line)!;
        for (let i = 0; i < o.length; i += 2) {
          const onLine = Math.abs(g.line.sample(o[i]) - o[i + 1]) < 0.05;
          if (onLine) expect(Math.abs(o[i] - (W.x - 2))).toBeGreaterThan(1.5);
        }
      }
    }
    expect(pops).toBe(1);
  });

  it('shows his body as soon as it is above the line, not all at once when the hands let go', () => {
    const g = headlessGame();
    g.start();
    const W = g.wavell;
    const length = () => {
      const o = W.stroke(g.line)!;
      let d = 0;
      for (let i = 2; i < o.length; i += 2) d += Math.hypot(o[i] - o[i - 2], o[i + 1] - o[i - 1]);
      return d;
    };
    run(g, TUNE.appearTime * 0.52);
    const elbow = (W as unknown as { cur: Float32Array }).cur[I.elbowF + 1];
    expect(elbow).toBeGreaterThan(3);
    // The arms are in the stroke already: well over what the head and the line alone would take.
    expect(length()).toBeGreaterThan(90);
    let last = length(), jump = 0;
    while (W.state === 'appear') {
      run(g, 1 / 120);
      if (W.state !== 'appear') break;
      const now = length();
      jump = Math.max(jump, now - last);
      last = now;
    }
    expect(jump).toBeLessThan(6);
  });

  it.each([['climbing out', false], ['sinking', true]])('never draws a stray piece of line back along the line, %s', (_name, sink) => {
    const g = headlessGame();
    g.start();
    const W = g.wavell;
    if (sink) { W.state = 'ground'; W.hurt('zap'); }
    const busy = () => (sink ? W.t < W.linger - 0.01 : W.state === 'appear');
    while (busy()) {
      run(g, 1 / 120);
      if (!busy()) break;
      const o = W.stroke(g.line)!;
      const on = (i: number) => Math.abs(g.line.sample(o[i]) - o[i + 1]) < 0.05;
      for (let i = 2; i < o.length; i += 2) {
        if (on(i) && on(i - 2)) expect(o[i - 2] - o[i]).toBeLessThan(3);
      }
    }
  });

  it.each([['over the line', 1], ['under the line', -1]])('floating off, his head fills up as his body shrinks, and only then he lets go of the line, %s', (_name, side) => {
    const g = headlessGame();
    g.start();
    const W = g.wavell;
    W.state = 'ground';
    if (side < 0) { W.side = -1; W.flip = 1; }
    run(g, 0.1);
    const cur = () => (W as unknown as { cur: Float32Array }).cur;
    const headTop = () => {
      const o = W.stroke(g.line)!;
      let far = 0;
      for (let i = 1; i < o.length; i += 2) far = Math.max(far, Math.abs(o[i] - g.line.sample(W.x)));
      return far;
    };
    const width = () => {
      const o = W.stroke(g.line)!, near = (x: number) => Math.abs(x - W.x);
      let w = 0;
      // Across the head: only the points well away from the line.
      for (let i = 0; i < o.length; i += 2) if (Math.abs(o[i + 1] - W.by) < 3) w = Math.max(w, near(o[i]));
      return w;
    };
    g.tick(side > 0 ? { ...IDLE, upPressed: true } : { ...IDLE, downPressed: true });
    expect(W.flying).toBe(true);
    const arm0 = cur()[I.handF] - cur()[I.elbowF];
    const spine0 = cur()[I.neck + 1] - cur()[I.hip + 1];
    const w0 = width();
    let by = W.by;
    while (W.t < TUNE.takeoff - 2 / STEPS_PER_SECOND) {
      g.tick(IDLE);
      expect(W.stroke(g.line)).not.toBeNull();
      expect(W.snap).toBe(0);
      // Never a jump: the bubble's centre is his head all the way.
      expect(Math.abs(W.by - by)).toBeLessThan(1.5);
      by = W.by;
    }
    expect(width()).toBeGreaterThan(w0 + 3);
    expect(width()).toBeCloseTo(W.bubbleR, 0);
    expect(headTop()).toBeGreaterThan(W.bubbleR * 2);
    expect(cur()[I.handF] - cur()[I.elbowF]).toBeLessThan(arm0);
    expect(cur()[I.neck + 1] - cur()[I.hip + 1]).toBeLessThan(spine0 / 3);
    // It lets go: the line breaks and closes, and the bubble stays where the head was.
    while (W.stroke(g.line)) g.tick(IDLE);
    expect(Math.abs(W.by - by)).toBeLessThan(1.5);
    g.tick(IDLE);
    expect(W.snap).toBeGreaterThan(0);
    run(g, 0.25);
    expect(W.snap).toBe(0);
    expect(side * (g.line.sample(W.x) - W.by)).toBeGreaterThan(W.bubbleR);
  });

  it.each([['over the line', 1, 0], ['under the line', -1, 0], ['grown', 1, 2]])('landing, the bubble ties into the line and he grows out of the knot as his head empties, %s', (_name, side, size) => {
    const g = headlessGame();
    g.start();
    const W = g.wavell;
    W.state = 'ground';
    W.size = size;
    if (side < 0) { W.side = -1; W.flip = 1; }
    run(g, 0.1);
    g.tick(side > 0 ? { ...IDLE, upPressed: true } : { ...IDLE, downPressed: true });
    run(g, TUNE.takeoff + 0.5);
    const toward = side > 0 ? { ...IDLE, down: true } : { ...IDLE, up: true };
    for (let i = 0; W.flying && i < 3 * STEPS_PER_SECOND; i++) g.tick(toward);
    expect(W.state).toBe('land');
    const r = W.bubbleR, by = W.by;
    const cur = () => (W as unknown as { cur: Float32Array }).cur;
    // His head starts as the bubble, right where it touched down.
    g.tick(IDLE);
    const top = () => {
      const o = W.stroke(g.line)!;
      let far = 0;
      for (let i = 1; i < o.length; i += 2) far = Math.max(far, Math.abs(o[i] - g.line.sample(W.x)));
      return far;
    };
    expect(top()).toBeCloseTo(Math.abs(g.line.sample(W.x) - by) + r, -1);
    expect(cur()[I.neck + 1]).toBeLessThan(2);
    // He only rises from there, with no jump, and ends up standing as usual.
    let last = cur()[I.neck + 1], jump = 0;
    const landing = () => W.state === 'land';
    while (landing()) {
      g.tick(IDLE);
      if (!landing()) break;
      jump = Math.max(jump, Math.abs(cur()[I.neck + 1] - last));
      last = cur()[I.neck + 1];
      expect(W.stroke(g.line)).not.toBeNull();
    }
    expect(jump).toBeLessThan(1);
    expect(W.state).toBe('ground');
    expect(last).toBeGreaterThan(12);
  });

  it('does not appear again when the game starts', () => {
    const g = headlessGame();
    run(g, TUNE.riseHold + TUNE.riseTime + 0.1);
    g.start();
    expect(g.wavell.state).toBe('ground');
    expect(g.wavell.events).not.toContain('appear');
  });

  it('finishes quickly from where it was if the game starts while he rises', () => {
    const g = headlessGame();
    run(g, TUNE.riseHold + TUNE.riseTime / 2);
    g.start();
    expect(g.wavell.state).toBe('appear');
    expect(g.wavell.t).toBeGreaterThan(0);
    expect(g.wavell.events).not.toContain('appear');
    run(g, TUNE.appearTime);
    expect(g.wavell.state).toBe('ground');
  });

  it('appears again after a game over', () => {
    const g = headlessGame();
    g.start();
    g.mode = 'over';
    g.start();
    expect(g.wavell.state).toBe('appear');
    expect(g.wavell.events).toContain('appear');
  });
});

describe('going back to the start screen', () => {
  const run = (g: ReturnType<typeof headlessGame>, seconds: number) => {
    for (let i = 0; i < seconds * STEPS_PER_SECOND; i++) g.tick(IDLE);
  };

  it('sinks him into the line and lets him rise again beside the word on the menu, with the line whole', () => {
    const g = headlessGame();
    g.start();
    run(g, 2);
    g.backToTitle(false);
    expect(g.mode).toBe('title');
    expect(g.wavell.state).toBe('dead');
    expect(g.wavell.sinking).toBe(true);
    run(g, TUNE.sinkTime - 0.05);
    expect(g.wavell.stroke(g.line)).not.toBeNull();
    run(g, 0.1);
    expect(g.wavell.stroke(g.line)).toBeNull();
    run(g, 0.35);
    expect(g.wavell.state).toBe('appear');
    run(g, TUNE.riseHold + TUNE.riseTime);
    expect(g.wavell.state).toBe('ground');
    expect(g.endX).toBe(g.wavell.x - 1000);
    expect(g.neon.camX + g.neon.viewW * MENU_FOCUS).toBeCloseTo(g.wavell.x);
  });

  it('only runs the word through its change coming from FLATLINED', () => {
    const g = headlessGame();
    g.start();
    g.backToTitle(false);
    expect(g.morphT).toBe(MORPH_TIME);
    g.backToTitle(true);
    expect(g.morphT).toBe(0);
    run(g, MORPH_TIME);
    expect(g.morphT).toBeGreaterThanOrEqual(MORPH_TIME - 0.01);
  });

  it('starts a clean game even if he has not come back yet', () => {
    const g = headlessGame();
    g.start();
    g.lives = 0;
    g.score = 500;
    g.backToTitle(false);
    g.start();
    expect(g.mode).toBe('play');
    expect(g.wavell.alive).toBe(true);
    expect(g.lives).toBe(DIFF.lives);
    expect(g.score).toBe(0);
  });

  it('keeps the best score of a game left halfway', () => {
    const g = headlessGame();
    g.start();
    g.score = g.best + 100;
    const score = g.score;
    g.backToTitle(false);
    expect(g.best).toBe(score);
  });

  it('is never left paused', () => {
    const g = headlessGame();
    g.start();
    g.setPaused(true);
    g.backToTitle(false);
    expect(g.paused).toBe(false);
  });
});

describe('the dev menu', () => {
  // The box sits down to the left of the fake view, with its links under a heading.
  // A button acts when the finger lifts: true if the tap landed on one.
  const tap = (g: ReturnType<typeof headlessGame>, x: number, y: number) => {
    const run = g.input.uiTap!(x, y);
    run?.();
    return run !== null;
  };
  const links = { settings: [20, 178], animation: [20, 187], heading: [20, 165] } as const;

  beforeEach(() => vi.stubGlobal('location', { href: '' }));
  afterEach(() => vi.unstubAllGlobals());

  it('opens each editor from the start screen', () => {
    const g = headlessGame();
    expect(tap(g, ...links.settings)).toBe(true);
    expect(location.href).toBe('difficulty.html');
    expect(tap(g, ...links.animation)).toBe(true);
    expect(location.href).toBe('lab.html');
  });

  it('keeps a tap on the rest of the box from starting the game', () => {
    const g = headlessGame();
    expect(tap(g, ...links.heading)).toBe(true);
    expect(location.href).toBe('');
  });

  it('is not there during a game, or while the word is changing', () => {
    const g = headlessGame();
    g.start();
    expect(tap(g, ...links.settings)).toBe(false);
    g.backToTitle(true);
    expect(tap(g, ...links.settings)).toBe(false);
    expect(location.href).toBe('');
  });
});

describe('the title coming apart', () => {
  it('goes from left to right, quickly, and is gone', () => {
    const g = headlessGame(), dust = new TitleDust();
    dust.update(0.1, g.neon, 0);
    const early = dust.rest;
    dust.update(0.2, g.neon, 0);
    const later = dust.rest;
    expect(later.length).toBeLessThan(early.length);
    expect(later[0]).toBeGreaterThan(early[0]);
    expect(dust.done).toBe(false);
    dust.update(0.3, g.neon, 0);
    expect(dust.rest.length).toBe(0);
    dust.update(0.8, g.neon, 0);
    expect(dust.done).toBe(true);
  });
});

describe('nostalgia mode', () => {
  it('has a pixel font for every character the game writes', () => {
    const texts = [...TITLE_HINTS, '← → walk   ↓ through the line   ↑ float / back up', 'left thumb: walk  ·  down: through the line', 'SWIPE ↔ to pull  ·  swipe ↕ to wipe',
      'WRONG ATTACK, IT GREW! BACKWAVE: float over it (UP)', 'Share menu, then Add to Home Screen', '000123  LEVEL 12  ·  75 BPM', VERSION_TEXT, '×4  FINAL LEVEL 10', 'BIGGER IS RICHER: every point now counts ×2', ...ENTRIES, ...CREDIT_NAMES, ...ACTIONS.map((a) => a.label),
      '↑ ↓ choose   Enter select', 'swipe to choose   tap to select', 'Enter to go back', 'PRESS A KEY...', 'PRESS A BUTTON...', '< KEYBOARD >', '< JOYPAD >', 'RESTORE DEFAULTS',
      'NO JOYPAD FOUND: CONNECT ONE AND PRESS A BUTTON', 'THE LEFT STICK WALKS AS WELL   ·   BACK: MENU', 'Esc: leave it as it is', 'TOWARDS THE LINE: THROUGH IT', 'SWIPE SIDEWAYS: PULL', 'SWIPE UP OR DOWN: WIPE',
      'AUDIO', 'SOUND', 'MUSIC', 'TIME', '> CLOSE <', '< ON >', '< OFF >', 'MUSIC BITCRUSHED', ...STYLES.map((st) => `< ${st.name} >`), ...METERS.map((m) => `< ${m.id} >`),
      ...Object.values(defaultBindings().keys).flat().map(keyLabel), ...Array.from({ length: 18 }, (_, i) => padLabel(i))];
    for (const t of texts) for (const ch of t) expect(hasGlyph(ch), ch).toBe(true);
  });

  it('goes on and off from its key and its button, and redraws at the new size', () => {
    vi.stubGlobal('document', { fullscreenEnabled: false });
    const g = headlessGame(), resize = vi.fn();
    Object.assign(g.neon, { resize, retro: false });
    g.input.onKey.get('KeyN')!();
    expect(g.neon.retro).toBe(true);
    expect(resize).toHaveBeenCalledTimes(1);
    const [x, y] = nostalgiaButton(g.neon);
    g.input.uiTap!(x, y)!();
    expect(g.neon.retro).toBe(false);
    expect(resize).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});

describe('the audio menu', () => {
  const press = (over: Partial<Input>) => ({ menuUp: false, menuDown: false, menuLeft: false, menuRight: false, confirm: false, mouseX: -1, mouseY: -1, ...over }) as Input;

  it('opens from the speaker button without muting, and the game waits for it', () => {
    const g = headlessGame();
    g.start();
    const [x, y] = audioButton(g.neon);
    g.input.uiTap!(x, y)!();
    expect(g.audio.open).toBe(true);
    expect(g.paused).toBe(true);
    expect(sfx.muted).toBe(true);
    // Every tap goes to it while it is open; one outside the window closes it.
    g.input.uiTap!(1, 1)!();
    expect(g.audio.open).toBe(false);
    expect(g.paused).toBe(false);
  });

  it('leaves a game paused by the player paused', () => {
    const g = headlessGame();
    g.start();
    g.setPaused(true);
    g.openAudio();
    g.closeAudio();
    expect(g.paused).toBe(true);
  });

  it('changes the time signature from the next bar', () => {
    const g = headlessGame();
    g.start();
    g.openAudio();
    g.audio.row = 2;
    g.audio.handle(press({ menuRight: true }));
    expect(g.beat.beats).toBe(4);
    g.closeAudio();
    for (let i = 0; i < 96 * 4 + 1; i++) g.tick(IDLE);
    expect(g.beat.beats).toBe(5);
    g.audio.row = 2;
    g.audio.handle(press({ menuLeft: true }));
    for (let i = 0; i < 96 * 5; i++) g.tick(IDLE);
    expect(g.beat.beats).toBe(4);
  });
});

describe('the menu', () => {
  // The same numbers every run, so a test can't pass or fail on the luck of the draw.
  const nativeRandom = Math.random;
  beforeEach(() => { Math.random = seeded(7); });
  afterEach(() => { Math.random = nativeRandom; });
  const run = (g: ReturnType<typeof headlessGame>, seconds: number) => {
    for (let i = 0; i < seconds * STEPS_PER_SECOND; i++) g.tick(IDLE);
  };
  /** The title, with him up and the line settled. */
  const ready = () => {
    const g = headlessGame();
    run(g, TUNE.riseHold + TUNE.riseTime + 0.5);
    return g;
  };

  it('goes round in circles, in either direction', () => {
    const g = ready(), seen = [ENTRIES[g.menu.selected]];
    for (let i = 0; i < 3; i++) { g.menu.go(1); run(g, 1); seen.push(ENTRIES[g.menu.selected]); }
    expect(seen).toEqual(['START', 'CONTROL', 'CREDITS', 'START']);
    g.menu.go(-1);
    run(g, 1);
    expect(ENTRIES[g.menu.selected]).toBe('CREDITS');
  });

  it('sinks him on the line he leaves while he rises on the one coming to the front', () => {
    const g = ready();
    g.menu.go(1);
    expect(g.menu.ghost?.wavell.sinking).toBe(true);
    expect(g.wavell.state).toBe('appear');
    expect(g.menu.z).toBeGreaterThan(0.9);
    run(g, 0.37);
    expect(g.menu.z).toBeGreaterThan(0);
    expect(g.menu.z).toBeLessThan(1);
    run(g, 0.5);
    expect(g.menu.ghost).toBeNull();
    expect(g.menu.z).toBeCloseTo(0);
    expect(g.wavell.alive).toBe(true);
  });

  it('brings the new line up from past the view going the other way', () => {
    const g = ready();
    g.menu.go(-1);
    expect(g.menu.z).toBeLessThan(-0.9);
    run(g, 1);
    expect(g.menu.z).toBeCloseTo(0);
  });

  it('keeps presses that come during a move for after it', () => {
    const g = ready();
    g.menu.go(1);
    g.menu.go(1);
    expect(g.menu.queue).toBe(1);
    run(g, 2);
    expect(ENTRIES[g.menu.selected]).toBe('CREDITS');
    expect(g.menu.queue).toBe(0);
  });

  it('fades and blurs the lines with distance, and shows only the two behind the front one', () => {
    const g = ready();
    expect(g.menu.alphaAt(0)).toBe(1);
    expect(g.menu.alphaAt(1)).toBeLessThan(0.5);
    expect(g.menu.alphaAt(2)).toBeLessThan(g.menu.alphaAt(1));
    expect(g.menu.alphaAt(3)).toBe(0);
    expect(g.menu.blurAt(0)).toBe(0);
    expect(g.menu.blurAt(2)).toBeGreaterThan(g.menu.blurAt(1));
  });

  it('makes the line coming from the back wiggle like the background, and flat by the time it arrives', () => {
    const g = ready();
    g.menu.go(1);
    run(g, 0.1);
    // Away from his feet, which press their own dent into the line.
    const wiggle = () => Math.max(...Array.from({ length: 150 }, (_, i) => g.neon.camX + i * 2)
      .filter((x) => Math.abs(x - g.wavell.x) >= 15).map((x) => Math.abs(g.line.sample(x))));
    expect(wiggle()).toBeGreaterThan(1);
    run(g, 1);
    expect(g.menu.settled).toBe(true);
    expect(wiggle()).toBeLessThan(3);
  });

  it('draws the lines thinner behind the front, and the real line as ever during a game', () => {
    const g = ready();
    expect(g.menu.lineWidthAt(0)).toBe(0.9);
    expect(g.menu.lineWidthAt(1) * depthScale(1)).toBeCloseTo(0.5);
    expect(g.menu.lineWidthAt(2) * depthScale(2)).toBeCloseTo(0.5);
  });

  it('writes each word in one stroke that starts and ends flat on the line, at its far ends', () => {
    for (const entry of ENTRIES) {
      const { pts, width } = strokeWord(entry);
      expect(pts[1]).toBeCloseTo(0, 1);
      expect(pts[pts.length - 1]).toBeCloseTo(0, 1);
      for (let i = 2; i < pts.length; i += 2) {
        expect(pts[i]).toBeGreaterThanOrEqual(pts[0]);
        expect(pts[i]).toBeLessThanOrEqual(pts[pts.length - 2]);
        expect(Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1])).toBeLessThan(3);
      }
      expect(pts[pts.length - 2] - pts[0]).toBeCloseTo(width, 0);
    }
  });

  it('pulls the line in to choose, and starts the game with the haul', () => {
    const g = ready();
    g.menu.choose();
    expect(g.mode).toBe('title');
    g.tick(IDLE);
    expect(g.wavell.state).toBe('drag');
    expect(g.wavell.attack).toBe('pull');
    g.menu.go(1);
    expect(g.menu.queue).toBe(0);
    run(g, 2);
    expect(g.mode).toBe('play');
    expect(g.titleDust).not.toBeNull();
    expect(g.menu.z).toBeCloseTo(0);
  });

  it('waits for the move to finish when asked to choose during one', () => {
    const g = ready();
    g.menu.go(-1);
    g.menu.go(-1);
    g.menu.choose();
    expect(g.mode).toBe('title');
    run(g, 4);
    expect(g.menu.page).toBe('control');
  });

  it('keeps him under the line on a page of its own, and lets him back up after', () => {
    const g = ready();
    g.menu.go(1);
    run(g, 1);
    g.menu.choose();
    run(g, 2);
    expect(g.menu.page).toBe('control');
    run(g, 3);
    expect(g.wavell.state).toBe('dead');
    expect(g.menu.z).toBe(-1);
    g.menu.back();
    run(g, 1);
    expect(g.menu.page).toBe('main');
    expect(g.menu.z).toBeCloseTo(0);
    expect(g.wavell.alive).toBe(true);
  });

  it('runs the names along the line on the credits page, which stays where it is', () => {
    const g = ready();
    g.menu.go(-1);
    run(g, 1);
    g.menu.choose();
    run(g, 2);
    expect(g.menu.page).toBe('credits');
    run(g, 2);
    expect(g.menu.scroll).toBeGreaterThan(50);
    expect(g.menu.z).toBeCloseTo(0);
  });

  it('takes a new key from the player, and Esc leaves things as they were', () => {
    const g = ready();
    g.menu.capturing = 'pull';
    g.menu.captured({ key: 'Escape' });
    expect(g.menu.capturing).toBeNull();
    expect(g.input.binds.keys.pull[0]).toBe('KeyX');
    g.menu.capturing = 'pull';
    g.menu.captured({ key: 'KeyM' });
    expect(g.menu.capturing).toBe('pull');
    expect(g.menu.note).toContain('M');
    g.menu.captured({ key: 'KeyQ' });
    expect(g.menu.capturing).toBeNull();
    expect(g.input.binds.keys.pull).toEqual(['KeyQ']);
  });

  it('keeps the background lines on going back, until they have become the menu again', () => {
    const g = ready();
    expect(g.menu.backdropShows).toBe(false);
    g.start();
    expect(g.menu.backdropShows).toBe(true);
    g.backToTitle(false);
    expect(g.menu.backdropShows).toBe(true);
    expect(g.menu.showing).toBe(false);
    run(g, 0.5);
    expect(g.menu.showing).toBe(true);
    expect(g.menu.backdropShows).toBe(false);
    expect(g.menu.stack).toBeLessThan(1);
    run(g, 0.6);
    expect(g.menu.stack).toBe(1);
  });

  it('after a game over, waits for the word to start turning into the title', () => {
    const g = ready();
    g.start();
    g.backToTitle(true);
    run(g, 0.5);
    expect(g.menu.backdropShows).toBe(true);
    run(g, MORPH_TIME);
    expect(g.menu.stack).toBe(1);
    expect(g.menu.backdropShows).toBe(false);
  });

  it('forgets where it was on going back to the start screen', () => {
    const g = ready();
    g.menu.go(1);
    run(g, 1);
    g.start();
    g.backToTitle(false);
    expect(g.menu.selected).toBe(0);
    expect(g.menu.ghost).toBeNull();
  });
});

describe('the bindings', () => {
  it('swap when a key or button already has a job, so nothing is left without one', () => {
    const b = defaultBindings();
    expect(bindKey(b, 'pause', 'KeyX')).toBe(true);
    expect(b.keys.pause).toEqual(['KeyX']);
    expect(b.keys.pull).not.toContain('KeyX');
    expect(b.keys.pull.length).toBeGreaterThan(0);
    bindPad(b, 'drag', 2);
    expect(b.pad.drag).toEqual([2]);
    expect(b.pad.pull).toEqual([0]);
  });

  it('refuse the keys with a job of their own', () => {
    const b = defaultBindings();
    expect(bindKey(b, 'drag', 'KeyM')).toBe(false);
    expect(b.keys.drag).toContain('KeyZ');
  });
});

describe('progress', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('Path2D', class { moveTo() {} lineTo() {} quadraticCurveTo() {} arc() {} closePath() {} rect() {} });
  });
  afterEach(() => vi.unstubAllGlobals());
  const score = (g: ReturnType<typeof headlessGame>, pts: number) => (g as unknown as { addScore(p: number, x: number, y: number): void }).addScore(pts, 0, 0);

  it('counts points more the bigger he is', () => {
    const g = headlessGame();
    g.start();
    score(g, 10);
    g.wavell.size = 2;
    score(g, 10);
    expect(g.score).toBe(10 + 10 * (1 + 2 * DIFF.sizePoints));
  });

  it('makes each level cost levelScore more than the last', () => {
    expect([2, 3, 4, 5].map(levelStart)).toEqual([1, 3, 6, 10].map((k) => k * DIFF.levelScore));
  });

  it('goes up a level at each level start, and stops at the last level', () => {
    const g = headlessGame();
    g.start();
    g.score = DIFF.levelScore;
    g.tick(IDLE);
    expect(g.level).toBe(2);
    // A score just past level 4's start leaves him at level 4, however many steps go by.
    g.score = levelStart(4) + 1;
    for (let i = 0; i < 40; i++) g.tick(IDLE);
    expect(g.level).toBe(4);
    for (let i = 0; i < 40; i++) { g.score = levelStart(DIFF.lastLevel + 5); g.tick(IDLE); }
    expect(g.level).toBe(DIFF.lastLevel);
  });
});
