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

  it('puts the remote first on the TV, so the hints name it, and leaves computers alone', () => {
    const tv = defaultBindings(true), pc = defaultBindings(false);
    expect(tv.keys.drag[0]).toBe('Enter');
    expect(tv.keys.pull[0]).toBe('PageUp');
    expect(tv.keys.drag).toContain('KeyZ');
    expect(pc.keys.drag).not.toContain('Enter');
    expect(pc.keys.pull).not.toContain('PageUp');
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
