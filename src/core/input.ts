// Keyboard and touch input. On touch screens the left part is a floating stick that
// only steers (sideways to walk), and the right part acts: tap to wipe, swipe
// sideways to pull, swipe down to go through the line, swipe up to float (or back
// up through the line).
// Keeping steering and actions on different thumbs stops diagonals from flipping
// by accident. Presses are latched so a tap shorter than one frame is never lost.

export interface Controls {
  left: boolean; right: boolean; up: boolean; down: boolean;
  /** dragPressed is the wipe (a crest on his side), pullPressed the pull (a trough on his side). */
  upPressed: boolean; downPressed: boolean; dragPressed: boolean; pullPressed: boolean;
}

interface Stick { id: number; ox: number; oy: number; x: number; y: number }
interface Swipe { id: number; ox: number; oy: number; t0: number; moved: boolean; dy: number }

const KEYS: Record<string, keyof Held> = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  KeyZ: 'drag', ShiftLeft: 'drag', ShiftRight: 'drag', Space: 'drag', KeyJ: 'drag',
  KeyX: 'pull', KeyK: 'pull', ControlLeft: 'pull', ControlRight: 'pull',
};

interface Held { left: boolean; right: boolean; up: boolean; down: boolean; drag: boolean; pull: boolean }

/** A touch on the right counts as a tap if it barely moves and lifts within this time (ms). */
const TAP_TIME = 300;

export class Input implements Controls {
  left = false; right = false; up = false; down = false;
  upPressed = false; downPressed = false; dragPressed = false; pullPressed = false;
  /** Any key or tap this frame (for menus). */
  anyPressed = false;
  /** Set once a finger has touched the screen: show the on-screen controls. */
  touchUsed = false;
  stick: Stick | null = null;
  swipe: Swipe | null = null;
  dragFlash = 0;
  /** -1 or 1 for a moment after a swipe up or down (for the on-screen hint). */
  swipeFlash = 0;
  /** For a moment after a sideways swipe (a pull). */
  pullFlash = 0;

  private keys: Held = { left: false, right: false, up: false, down: false, drag: false, pull: false };
  private latch = { up: false, down: false, drag: false, pull: false, any: false };
  private stickHeld = { left: false, right: false };
  readonly onKey = new Map<string, () => void>();
  /** On-screen buttons get first refusal on a tap. */
  uiTap: ((x: number, y: number) => boolean) | null = null;

  constructor(el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.onKey.get(e.code)?.();
      const k = KEYS[e.code];
      this.latch.any = true;
      if (!k) return;
      e.preventDefault();
      this.keys[k] = true;
      if (k === 'up' || k === 'down' || k === 'drag' || k === 'pull') this.latch[k] = true;
    });
    window.addEventListener('keyup', (e) => { const k = KEYS[e.code]; if (k) this.keys[k] = false; });
    window.addEventListener('blur', () => { for (const k of Object.keys(this.keys) as (keyof Held)[]) this.keys[k] = false; });

    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      if (e.pointerType !== 'mouse') this.touchUsed = true;
      if (this.uiTap?.(e.clientX, e.clientY)) return;
      this.latch.any = true;
      if (e.clientX < window.innerWidth * 0.45 && !this.stick) {
        this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      } else if (!this.swipe) {
        this.swipe = { id: e.pointerId, ox: e.clientX, oy: e.clientY, t0: performance.now(), moved: false, dy: 0 };
      } else {
        // A second finger on the right while the first is still down: pulse straight away.
        this.pulse();
      }
    });
    el.addEventListener('pointermove', (e) => {
      const s = this.stick;
      if (s && s.id === e.pointerId) {
        s.x = e.clientX; s.y = e.clientY;
        // Let the base follow a thumb that wanders too far.
        const max = this.threshold * 3.2, dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy);
        if (d > max) { s.ox = s.x - (dx / d) * max; s.oy = s.y - (dy / d) * max; }
        this.readStick();
        return;
      }
      const w = this.swipe;
      if (!w || w.id !== e.pointerId) return;
      const dx = e.clientX - w.ox, dy = e.clientY - w.oy, th = this.threshold;
      w.dy = dy;
      if (!w.moved && Math.abs(dy) > th && Math.abs(dy) > Math.abs(dx)) {
        w.moved = true;
        if (dy < 0) this.latch.up = true; else this.latch.down = true;
        this.swipeFlash = dy < 0 ? -1 : 1;
      }
      // Sideways, either way: pull the line in.
      if (!w.moved && Math.abs(dx) > th && Math.abs(dx) > Math.abs(dy)) {
        w.moved = true;
        this.latch.pull = true;
        this.pullFlash = 1;
      }
      if (!w.moved && Math.hypot(dx, dy) > th * 1.5) w.moved = true;
    });
    const end = (e: PointerEvent) => {
      if (this.stick?.id === e.pointerId) { this.stick = null; this.readStick(); }
      const w = this.swipe;
      if (w?.id === e.pointerId) {
        if (!w.moved && performance.now() - w.t0 < TAP_TIME && e.type === 'pointerup') this.pulse();
        this.swipe = null;
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  get threshold() { return Math.min(window.innerWidth, window.innerHeight) * 0.045; }

  private pulse() {
    this.latch.drag = true;
    this.dragFlash = 1;
  }

  private readStick() {
    const s = this.stick, h = this.stickHeld;
    if (!s) { h.left = h.right = false; return; }
    const th = this.threshold, dx = s.x - s.ox;
    h.left = dx < -th; h.right = dx > th;
  }

  /** Call once per frame before reading the controls. */
  poll() {
    const k = this.keys, s = this.stickHeld, w = this.swipe;
    // A swipe held up or down keeps steering the bubble.
    const wy = w && w.moved ? w.dy : 0, th = this.threshold * 0.6;
    this.left = k.left || s.left;
    this.right = k.right || s.right;
    this.up = k.up || wy < -th;
    this.down = k.down || wy > th;
    this.upPressed = this.latch.up;
    this.downPressed = this.latch.down;
    this.dragPressed = this.latch.drag;
    this.pullPressed = this.latch.pull;
    this.anyPressed = this.latch.any;
    this.latch.up = this.latch.down = this.latch.drag = this.latch.pull = this.latch.any = false;
  }
}
