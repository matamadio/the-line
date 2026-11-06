// Keyboard and touch input. On touch screens the left part is a floating stick that
// moves Wavell: sideways to walk, up to float (or back up through the line), down to go
// through the line. The right part attacks: swipe sideways to pull, up or down to wipe.
// Walking and moving through the line now share a thumb, so going up or down takes a
// longer push than walking, and has to be mostly vertical. That stops a walking thumb
// that drifts from flipping him by accident.
// Presses are latched so a gesture shorter than one frame is never lost.

export interface Controls {
  left: boolean; right: boolean; up: boolean; down: boolean;
  /** dragPressed is the wipe (a crest on his side), pullPressed the pull (a trough on his side). */
  upPressed: boolean; downPressed: boolean; dragPressed: boolean; pullPressed: boolean;
}

interface Stick { id: number; ox: number; oy: number; x: number; y: number }
interface Swipe { id: number; ox: number; oy: number; fired: boolean }

const KEYS: Record<string, keyof Held> = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  KeyZ: 'drag', ShiftLeft: 'drag', ShiftRight: 'drag', Space: 'drag', KeyJ: 'drag',
  KeyX: 'pull', KeyK: 'pull', ControlLeft: 'pull', ControlRight: 'pull',
};

interface Held { left: boolean; right: boolean; up: boolean; down: boolean; drag: boolean; pull: boolean }

/** The part of the screen, from the left, where a touch becomes the stick. */
const STICK_ZONE = 0.45;
/** How much further than walking the stick must go up or down, as a multiple of the threshold. */
const STICK_VERTICAL = 1.7;
/** How far back it can come before up or down lets go, so steering the bubble doesn't flicker. */
const STICK_RELEASE = 0.6;
/** How far a swipe must travel, as a multiple of the threshold: attacks should feel instant. */
const SWIPE_TRAVEL = 0.8;

export class Input implements Controls {
  left = false; right = false; up = false; down = false;
  upPressed = false; downPressed = false; dragPressed = false; pullPressed = false;
  /** Any key or touch this frame (for menus). */
  anyPressed = false;
  /** Where the mouse is on the canvas (for hovering over on-screen buttons). */
  mouseX = -1;
  mouseY = -1;
  /** Set once a finger has touched the screen: show the on-screen controls. */
  touchUsed = false;
  /** Positions are in CSS pixels from the canvas's top left corner. */
  stick: Stick | null = null;
  swipe: Swipe | null = null;
  /** For a moment after a wipe (a vertical swipe). */
  dragFlash = 0;
  /** For a moment after a pull (a sideways swipe). */
  pullFlash = 0;
  /** -1 or 1 for a moment after the stick goes up or down. */
  stickFlash = 0;

  private keys: Held = { left: false, right: false, up: false, down: false, drag: false, pull: false };
  private latch = { up: false, down: false, drag: false, pull: false, any: false };
  private stickHeld = { left: false, right: false, up: false, down: false };
  private ui: { id: number; run: () => void } | null = null;
  readonly onKey = new Map<string, () => void>();
  /**
   * On-screen buttons get first refusal on a touch: this returns what the button does, or null.
   * It runs when the finger lifts: browsers only allow fullscreen, installing and sound
   * from there, not from the moment a finger lands.
   */
  uiTap: ((x: number, y: number) => (() => void) | null) | null = null;
  /** Every lifted finger or pressed key, the moments a browser lets a page start sound. */
  onGesture: (() => void) | null = null;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.onGesture?.();
      const own = this.onKey.get(e.code);
      own?.();
      const k = KEYS[e.code];
      // A key with a job of its own (mute, pause) doesn't count as "press any key".
      if (!own) this.latch.any = true;
      if (!k) return;
      e.preventDefault();
      this.keys[k] = true;
      if (k === 'up' || k === 'down' || k === 'drag' || k === 'pull') this.latch[k] = true;
    });
    window.addEventListener('mousemove', (e) => { [this.mouseX, this.mouseY] = this.pos(e); });
    window.addEventListener('keyup', (e) => { const k = KEYS[e.code]; if (k) this.keys[k] = false; });
    window.addEventListener('blur', () => { for (const k of Object.keys(this.keys) as (keyof Held)[]) this.keys[k] = false; });

    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      if (e.pointerType !== 'mouse') this.touchUsed = true;
      const [x, y] = this.pos(e);
      const run = this.uiTap?.(x, y);
      if (run) { this.ui = { id: e.pointerId, run }; return; }
      this.latch.any = true;
      if (x < el.getBoundingClientRect().width * STICK_ZONE && !this.stick) {
        this.stick = { id: e.pointerId, ox: x, oy: y, x, y };
      } else {
        // The latest finger on the right is the one that counts, so attacks can overlap.
        this.swipe = { id: e.pointerId, ox: x, oy: y, fired: false };
      }
    });
    el.addEventListener('pointermove', (e) => {
      const [x, y] = this.pos(e), s = this.stick;
      if (s && s.id === e.pointerId) {
        s.x = x; s.y = y;
        // Let the base follow a thumb that wanders too far.
        const max = this.threshold * 3.2, dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy);
        if (d > max) { s.ox = s.x - (dx / d) * max; s.oy = s.y - (dy / d) * max; }
        this.readStick();
        return;
      }
      if (this.swipe?.id === e.pointerId) this.readSwipe(x, y);
    });
    const end = (e: PointerEvent) => {
      if (e.type === 'pointerup') this.onGesture?.();
      if (this.ui?.id === e.pointerId) {
        const run = this.ui.run;
        this.ui = null;
        if (e.type === 'pointerup') run();
        return;
      }
      if (this.stick?.id === e.pointerId) { this.stick = null; this.readStick(); }
      if (this.swipe?.id === e.pointerId) {
        // A flick can lift before a move event reports how far it went.
        if (e.type === 'pointerup') this.readSwipe(...this.pos(e));
        this.swipe = null;
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  get threshold() { return Math.min(window.innerWidth, window.innerHeight) * 0.045; }

  /** An event's position on the canvas. */
  private pos(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  /** One attack per swipe, as soon as it has gone far enough to tell which way. */
  private readSwipe(x: number, y: number) {
    const w = this.swipe;
    if (!w || w.fired) return;
    const dx = x - w.ox, dy = y - w.oy;
    if (Math.hypot(dx, dy) <= this.threshold * SWIPE_TRAVEL) return;
    w.fired = true;
    if (Math.abs(dx) > Math.abs(dy)) { this.latch.pull = true; this.pullFlash = 1; }
    else { this.latch.drag = true; this.dragFlash = 1; }
  }

  private readStick() {
    const s = this.stick, h = this.stickHeld;
    if (!s) { h.left = h.right = h.up = h.down = false; return; }
    const th = this.threshold, dx = s.x - s.ox, dy = s.y - s.oy;
    h.left = dx < -th; h.right = dx > th;
    const go = th * STICK_VERTICAL, keep = go * STICK_RELEASE;
    const up = h.up ? dy < -keep : dy < -go && -dy > Math.abs(dx);
    const down = h.down ? dy > keep : dy > go && dy > Math.abs(dx);
    if (up && !h.up) { this.latch.up = true; this.stickFlash = -1; }
    if (down && !h.down) { this.latch.down = true; this.stickFlash = 1; }
    h.up = up; h.down = down;
  }

  /** Call once per frame before reading the controls. */
  poll() {
    const k = this.keys, s = this.stickHeld;
    this.left = k.left || s.left;
    this.right = k.right || s.right;
    this.up = k.up || s.up;
    this.down = k.down || s.down;
    this.upPressed = this.latch.up;
    this.downPressed = this.latch.down;
    this.dragPressed = this.latch.drag;
    this.pullPressed = this.latch.pull;
    this.anyPressed = this.latch.any;
    this.latch.up = this.latch.down = this.latch.drag = this.latch.pull = this.latch.any = false;
  }
}
