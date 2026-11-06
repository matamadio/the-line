// The page as an app: fullscreen, installing to the home screen, and working offline.

/** Chrome's offer to install the page, which it fires when the page qualifies. */
interface InstallOffer extends Event {
  prompt(): Promise<unknown>;
  userChoice: Promise<unknown>;
}

let offer: InstallOffer | null = null;
let ready = false;

/** Only the game page calls this: the editors can go fullscreen but are not the app. */
export function initApp() {
  ready = true;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); offer = e as InstallOffer; });
  window.addEventListener('appinstalled', () => { offer = null; });
  // Not in development: a cached copy would hide the edits being worked on.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => { /* just no offline play */ });
}

/** Running from the home screen, rather than in a browser tab? */
function installed() {
  return (navigator as unknown as { standalone?: boolean }).standalone === true
    || matchMedia('(display-mode: standalone)').matches
    // A tab that has gone fullscreen matches this too.
    || (matchMedia('(display-mode: fullscreen)').matches && !document.fullscreenElement);
}

/** iPhones and iPads never offer to install: it has to be done by hand from the Share menu. */
function isIos() {
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function canInstall() { return ready && !installed() && (offer !== null || isIos()); }

/** Show the browser's install dialog. False if it has to be done by hand instead. */
export async function promptInstall() {
  if (!offer) return false;
  const o = offer;
  offer = null; // An offer only works once.
  await o.prompt();
  await o.userChoice;
  return true;
}

/** iPhones have no fullscreen for pages, and an installed game already is. */
export function canFullscreen() { return !!document.fullscreenEnabled && !installed(); }

export function isFullscreen() { return !!document.fullscreenElement; }

export async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) { await document.exitFullscreen(); return; }
    if (!document.fullscreenEnabled) return;
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    // Phones only allow locking the rotation while fullscreen. Lock is not in the DOM types yet.
    await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape');
  } catch { /* refused, or the browser can't lock: the game still plays */ }
}
