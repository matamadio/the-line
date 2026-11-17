// The owl's call on the loading screen, from assets/sounds/owl.mp3. Browsers may hold sound
// back until a tap or key press; then he calls at the first one, if the owl is still up.

const VOLUME = 0.8;
/** How long a held-back call waits for a tap or a key before giving up (ms). */
const WAIT = 10000;

function call(ctx: AudioContext, sound: Promise<AudioBuffer | null>) {
  void sound.then((buf) => {
    if (!buf) { void ctx.close(); return; }
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf;
    g.gain.value = VOLUME;
    src.connect(g).connect(ctx.destination);
    src.onended = () => void ctx.close();
    src.start();
  });
}

export function hoot() {
  if (typeof AudioContext === 'undefined') return;
  const ctx = new AudioContext();
  // Fetched and decoded at once, so it is ready by the time it may play.
  const sound = fetch('assets/sounds/owl.mp3')
    .then((r) => r.arrayBuffer())
    .then((b) => ctx.decodeAudioData(b))
    .catch(() => null);
  if (ctx.state === 'running') { call(ctx, sound); return; }
  // Held back: call at the first tap or key, while the owl is still showing.
  const go = () => {
    off();
    if (!document.getElementById('boot')) { void ctx.close(); return; }
    void ctx.resume().then(() => call(ctx, sound));
  };
  const off = () => { removeEventListener('pointerdown', go); removeEventListener('keydown', go); };
  addEventListener('pointerdown', go);
  addEventListener('keydown', go);
  setTimeout(() => { if (ctx.state !== 'running') { off(); void ctx.close(); } }, WAIT);
}
