// The LG TV remote: its buttons come in with only a keyCode, and Back must never leave the page.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBindings, keyCode, keyName } from '../src/core/controls';
import { Input } from '../src/core/input';

const TV_AGENT = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 WebAppManager';

function onTV() {
  const history = { pushState: vi.fn() };
  vi.stubGlobal('navigator', { userAgent: TV_AGENT });
  vi.stubGlobal('window', Object.assign(new EventTarget(), { innerWidth: 1920, innerHeight: 1080 }));
  vi.stubGlobal('history', history);
  vi.stubGlobal('location', { href: 'https://example.test/the-line/' });
  const el = Object.assign(new EventTarget(), { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }) }) as unknown as HTMLElement;
  const input = new Input(el);
  const press = (keyCode: number, type = 'keydown') => {
    const e = Object.assign(new Event(type, { cancelable: true }), { code: '', keyCode, repeat: false });
    window.dispatchEvent(e);
    return e;
  };
  return { input, press, history };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('remote buttons get names', () => {
  it('uses the code when there is one, and the keyCode when not', () => {
    expect(keyCode({ code: 'KeyZ', keyCode: 90 })).toBe('KeyZ');
    expect(keyCode({ code: '', keyCode: 13 })).toBe('Enter');
    expect(keyCode({ code: 'Unidentified', keyCode: 461 })).toBe('BrowserBack');
    expect(keyCode({ code: '', keyCode: 38 })).toBe('ArrowUp');
  });

  it('gives any other button a name, so it can still be bound', () => {
    expect(keyCode({ code: '', keyCode: 1234 })).toBe('Remote1234');
    expect(keyName('Remote1234', true)).toBe('REMOTE 1234');
  });

  it('names OK and the channel rocker as the remote does, on the TV only', () => {
    expect(keyName('Enter', true)).toBe('OK');
    expect(keyName('PageUp', true)).toBe('CH ↑');
    expect(keyName('PageUp', false)).toBe('PAGE UP');
  });

  it('binds the remote everywhere, as not every TV browser says it is one, but first only on a TV', () => {
    const tv = defaultBindings(true), pc = defaultBindings(false);
    expect(tv.keys.drag[0]).toBe('Enter');
    expect(tv.keys.pull[0]).toBe('PageUp');
    expect(tv.keys.drag).toContain('KeyZ');
    // On a computer the hints still name its own keys.
    expect(pc.keys.drag[0]).toBe('KeyZ');
    expect(pc.keys.pull[0]).toBe('KeyX');
    expect(pc.keys.drag).toContain('Enter');
    expect(pc.keys.pull).toContain('PageUp');
  });
});

describe('a TV browser that says it is a computer', () => {
  function disguised() {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' });
    vi.stubGlobal('window', Object.assign(new EventTarget(), { innerWidth: 1920, innerHeight: 1080 }));
    const history = { pushState: vi.fn() };
    vi.stubGlobal('history', history);
    vi.stubGlobal('location', { href: 'https://example.test/the-line/' });
    const el = Object.assign(new EventTarget(), { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }) }) as unknown as HTMLElement;
    const input = new Input(el);
    const press = (keyCode: number, code = '') => window.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { code, keyCode, repeat: false }));
    return { input, press, history };
  }

  it('still wipes with OK and pulls with the channel rocker', () => {
    const { input, press } = disguised();
    expect(input.tv).toBe(false);
    press(13, 'Enter');
    press(33, 'PageUp');
    input.poll();
    expect(input.dragPressed).toBe(true);
    expect(input.pullPressed).toBe(true);
  });

  it('turns into a TV at the first button only a remote has, and keeps Back from then on', () => {
    const { input, press, history } = disguised();
    press(461);
    expect(input.tv).toBe(true);
    expect(history.pushState).toHaveBeenCalled();
    // The hints now name the remote's buttons.
    expect(input.binds.keys.drag[0]).toBe('Enter');
  });

  it('shows the last key in ?perf', () => {
    const { input, press } = disguised();
    press(33);
    expect(input.lastKey).toBe('33 PageUp');
  });
});

describe('the remote plays', () => {
  it('walks with the arrows, wipes with OK and pulls with the channel rocker', () => {
    const { input, press } = onTV();
    press(39);
    press(13);
    press(33);
    input.poll();
    expect(input.right).toBe(true);
    expect(input.dragPressed).toBe(true);
    expect(input.pullPressed).toBe(true);
    press(39, 'keyup');
    input.poll();
    expect(input.right).toBe(false);
  });

  it('keeps Back for the game, and never lets the browser have it', () => {
    const { input, press, history } = onTV();
    const back = vi.fn();
    input.onKey.set('BrowserBack', back);
    const e = press(461);
    expect(e.defaultPrevented).toBe(true);
    expect(back).toHaveBeenCalledOnce();
    // Back as a key doesn't count as "press any key".
    input.poll();
    expect(input.anyPressed).toBe(false);
    // There is always a page of the game's own to go back to.
    expect(history.pushState).toHaveBeenCalled();
  });

  it('takes a Back that the browser turned into going back a page', () => {
    const { input } = onTV();
    const back = vi.fn();
    input.onKey.set('BrowserBack', back);
    window.dispatchEvent(new Event('popstate'));
    expect(back).toHaveBeenCalledOnce();
  });

  it('counts a Back seen as a key and as going back a page once', () => {
    const { input, press } = onTV();
    const back = vi.fn();
    input.onKey.set('BrowserBack', back);
    press(461);
    window.dispatchEvent(new Event('popstate'));
    expect(back).toHaveBeenCalledOnce();
  });
});
