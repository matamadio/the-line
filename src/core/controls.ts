// Which key or joypad button does what. The player can change them on the CONTROL page,
// and they stay as they were left, from one visit to the next.

export type Action = 'left' | 'right' | 'up' | 'down' | 'drag' | 'pull' | 'pause';
export type Device = 'keyboard' | 'joypad';

export interface Bindings {
  /** Which of the two the CONTROL page and the hints talk about. Both always work. */
  device: Device;
  keys: Record<Action, string[]>;
  pad: Record<Action, number[]>;
}

/** The actions the player can bind, as the CONTROL page lists them. */
export const ACTIONS: readonly { action: Action; label: string }[] = [
  { action: 'left', label: 'WALK LEFT' },
  { action: 'right', label: 'WALK RIGHT' },
  { action: 'up', label: 'UP' },
  { action: 'down', label: 'DOWN' },
  { action: 'drag', label: 'WIPE' },
  { action: 'pull', label: 'PULL' },
  { action: 'pause', label: 'PAUSE' },
];

const DEFAULT_KEYS: Record<Action, string[]> = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  drag: ['KeyZ', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyJ'],
  pull: ['KeyX', 'KeyK', 'ControlLeft', 'ControlRight'],
  pause: ['KeyP'],
};

/**
 * On an LG TV the remote is the keyboard: CH + wipes and CH - pulls (red and green do the
 * same where the remote has them), and OK pauses (in menus it still picks). They are bound
 * everywhere, as not every TV browser says it is one; on a TV they come first, so the hints
 * name them. The arrows are the arrows, and Back pauses too, then goes back (see game.ts).
 */
const TV_KEYS: Partial<Record<Action, string[]>> = {
  drag: ['PageUp', 'ColorRed'], pull: ['PageDown', 'ColorGreen'], pause: ['Enter', 'MediaPlayPause', 'MediaPlay', 'Pause'],
};

/** Buttons in the browser's standard joypad layout. */
const DEFAULT_PAD: Record<Action, number[]> = { left: [14], right: [15], up: [12], down: [13], drag: [0], pull: [2], pause: [9] };

/** Keys with a job of their own, which can't be given another. */
export const RESERVED_KEYS: ReadonlySet<string> = new Set(['Escape', 'Enter', 'NumpadEnter', 'KeyM', 'KeyF', 'KeyN', 'BrowserBack']);

let tvSeen = false;
/** A remote-only button came in: this is a TV, whatever the browser says it is. */
export function markTV() { tvSeen = true; }
/** Running on an LG TV (webOS), in its browser or as the app? */
export const onTV = () => tvSeen || (typeof navigator !== 'undefined' && /Web0S|webOS|SmartTV|NetCast/i.test(navigator.userAgent ?? ''));

/** Buttons only a TV remote has. A key with no name at all, only a keyCode, is one too. */
const REMOTE_ONLY = new Set([461, 403, 404, 405, 406, 415, 413, 412, 417]);
export const fromRemote = (e: { code?: string; keyCode?: number }) =>
  REMOTE_ONLY.has(e.keyCode ?? 0) || ((!e.code || e.code === 'Unidentified') && !!e.keyCode);

/**
 * What an LG remote's buttons send. Its browser often leaves a key's `code` empty and
 * gives only the old `keyCode`, so this names them as a keyboard would.
 */
const REMOTE_CODES: Record<number, string> = {
  13: 'Enter', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown', 33: 'PageUp', 34: 'PageDown',
  461: 'BrowserBack', 403: 'ColorRed', 404: 'ColorGreen', 405: 'ColorYellow', 406: 'ColorBlue',
  415: 'MediaPlay', 19: 'Pause', 413: 'MediaStop', 412: 'MediaRewind', 417: 'MediaFastForward',
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [48 + i, `Digit${i}`])),
};

/** A key's name, as in KeyboardEvent.code, for a remote's buttons too. Any other button is RemoteN, so it can still be bound. */
export function keyCode(e: { code?: string; keyCode?: number }) {
  if (e.code && e.code !== 'Unidentified') return e.code;
  const n = e.keyCode ?? 0;
  return REMOTE_CODES[n] ?? (n ? `Remote${n}` : '');
}

const STORE = 'the-line-controls';

export function defaultBindings(tv = onTV()): Bindings {
  const copy = <T>(table: Record<Action, T[]>) => Object.fromEntries(Object.entries(table).map(([a, v]) => [a, [...v]])) as Record<Action, T[]>;
  const keys = copy(DEFAULT_KEYS);
  for (const { action } of ACTIONS) {
    const remote = TV_KEYS[action] ?? [];
    keys[action] = tv ? [...remote, ...keys[action]] : [...keys[action], ...remote];
  }
  return { device: 'keyboard', keys, pad: copy(DEFAULT_PAD) };
}

/** What was saved last time, with the defaults for anything missing or broken. */
export function loadBindings(): Bindings {
  const b = defaultBindings();
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Partial<Bindings>;
    if (saved.device === 'joypad') b.device = 'joypad';
    for (const { action } of ACTIONS) {
      const keys = saved.keys?.[action], pad = saved.pad?.[action];
      if (Array.isArray(keys) && keys.length && keys.every((k) => typeof k === 'string')) b.keys[action] = keys;
      if (Array.isArray(pad) && pad.length && pad.every((p) => Number.isInteger(p))) b.pad[action] = pad;
    }
  } catch { /* storage blocked, or not what we wrote */ }
  return b;
}

export function saveBindings(b: Bindings) {
  try { localStorage.setItem(STORE, JSON.stringify(b)); } catch { /* storage blocked */ }
}

/**
 * This action now answers to this alone. If another action had it, the two swap, so
 * nothing is ever left without a control.
 */
function rebind<T>(table: Record<Action, T[]>, action: Action, value: T) {
  const old = table[action][0];
  for (const { action: other } of ACTIONS) {
    if (other === action) continue;
    table[other] = table[other].filter((v) => v !== value);
    if (!table[other].length) table[other] = [old];
  }
  table[action] = [value];
}

/** False if the key has a job of its own. */
export function bindKey(b: Bindings, action: Action, code: string) {
  if (RESERVED_KEYS.has(code)) return false;
  rebind(b.keys, action, code);
  return true;
}

export function bindPad(b: Bindings, action: Action, button: number) { rebind(b.pad, action, button); }

const KEY_NAMES: Record<string, string> = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'SPACE', Tab: 'TAB', Backspace: 'BACKSPACE',
  ShiftLeft: 'LEFT SHIFT', ShiftRight: 'RIGHT SHIFT', ControlLeft: 'LEFT CTRL', ControlRight: 'RIGHT CTRL', AltLeft: 'LEFT ALT', AltRight: 'RIGHT ALT',
  PageUp: 'PAGE UP', PageDown: 'PAGE DOWN', BrowserBack: 'BACK', MediaPlayPause: 'PLAY/PAUSE', MediaPlay: 'PLAY',
  ColorRed: 'RED', ColorGreen: 'GREEN', ColorYellow: 'YELLOW', ColorBlue: 'BLUE',
};
/** The same buttons, as the remote names them. */
const TV_NAMES: Record<string, string> = { Enter: 'OK', PageUp: 'CH +', PageDown: 'CH -' };
/** A key's name for the player, on a TV or not. */
export const keyName = (code: string, tv: boolean) =>
  (tv ? TV_NAMES[code] : undefined) ?? KEY_NAMES[code] ?? code.replace(/^(Key|Digit)/, '').replace(/^Remote/, 'REMOTE ').toUpperCase();
export const keyLabel = (code: string) => keyName(code, onTV());

/** The standard layout's names, with the buttons of the d-pad as arrows. */
const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START', 'L3', 'R3', 'PAD ↑', 'PAD ↓', 'PAD ←', 'PAD →', 'HOME'];
export const padLabel = (button: number) => PAD_NAMES[button] ?? `BUTTON ${button}`;

/** What to press for this action, on the device in use. */
export const actionLabel = (b: Bindings, action: Action) => (b.device === 'joypad' ? padLabel(b.pad[action][0]) : keyLabel(b.keys[action][0]));
