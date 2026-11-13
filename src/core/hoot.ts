// The owl's call on the loading screen: a great horned owl's "hoo, HOOO... hoo, hoo", made
// with Web Audio like the other tones. Browsers may hold sound back until a tap or key press;
// then he hoots at the first one, if the owl is still up.

/** Each hoot: when it starts (s), how long it lasts (s), its pitch (Hz) and how loud. */
const HOOTS = [
  { at: 0, len: 0.22, f: 330, v: 0.6 },
  { at: 0.34, len: 0.62, f: 370, v: 1 },
  { at: 1.18, len: 0.26, f: 320, v: 0.7 },
  { at: 1.58, len: 0.34, f: 300, v: 0.75 },
];
const VOLUME = 0.35;

function call(ctx: AudioContext) {
  const out = ctx.createGain();
  out.gain.value = VOLUME;
  // A soft, woody tone: a lowpass over a sine and a little of its octave.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  // A wood at night: a slow echo, fading.
  const delay = ctx.createDelay(1), back = ctx.createGain();
  delay.delayTime.value = 0.23;
  back.gain.value = 0.28;
  lp.connect(out).connect(ctx.destination);
  out.connect(delay).connect(back).connect(delay);
  back.connect(ctx.destination);
  const t0 = ctx.currentTime + 0.05;
  for (const h of HOOTS) {
    const t = t0 + h.at, end = t + h.len;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(h.v, t + 0.06);
    env.gain.setValueAtTime(h.v, end - 0.1);
    env.gain.exponentialRampToValueAtTime(0.001, end + 0.08);
    env.connect(lp);
    for (const [mult, level] of [[1, 1], [2, 0.12]] as const) {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      // It swells up into the note and sags at the end, like a breath.
      osc.frequency.setValueAtTime(h.f * mult * 0.92, t);
      osc.frequency.linearRampToValueAtTime(h.f * mult, t + 0.07);
      osc.frequency.linearRampToValueAtTime(h.f * mult * 0.94, end + 0.08);
      g.gain.value = level;
      osc.connect(g).connect(env);
      osc.start(t);
      osc.stop(end + 0.1);
    }
    // Breath through the feathers.
    const n = ctx.sampleRate * (h.len + 0.1), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const air = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ag = ctx.createGain();
    air.buffer = buf;
    bp.type = 'bandpass';
    bp.frequency.value = h.f * 2;
    bp.Q.value = 2;
    ag.gain.value = 0.08;
    air.connect(bp).connect(ag).connect(env);
    air.start(t);
  }
  setTimeout(() => void ctx.close(), (t0 - ctx.currentTime + 3) * 1000);
}

export function hoot() {
  if (typeof AudioContext === 'undefined') return;
  const ctx = new AudioContext();
  if (ctx.state === 'running') { call(ctx); return; }
  // Held back: hoot at the first tap or key, while the owl is still showing.
  const go = () => {
    off();
    if (!document.getElementById('boot')) { void ctx.close(); return; }
    void ctx.resume().then(() => call(ctx));
  };
  const off = () => { removeEventListener('pointerdown', go); removeEventListener('keydown', go); };
  addEventListener('pointerdown', go);
  addEventListener('keydown', go);
  setTimeout(() => { if (ctx.state !== 'running') { off(); void ctx.close(); } }, 10000);
}
