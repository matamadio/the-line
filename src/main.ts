import { initApp } from './core/app';
import { DIFF } from './data/difficulty';
import { Game } from './game/game';
import { Input } from './core/input';
import { Neon } from './core/neon';
import { Pacing } from './core/pacing';
import { hoot } from './core/hoot';
import { audioPrefs } from './core/audioPrefs';
import { sfx } from './core/sfx';

initApp();

// ?level=10 starts every game at that level (the boss, for trying him out), without saving it.
const startAt = Number(new URLSearchParams(location.search).get('level'));
if (startAt >= 1) DIFF.startLevel = Math.floor(startAt);

const canvas = document.getElementById('view') as HTMLCanvasElement;
const neon = new Neon(canvas);
const game = new Game(neon, new Input(canvas));
game.loadNostalgia();
game.loadControls();

// A slow device draws every other refresh, then at a lower resolution: see pacing.ts.
const pacing = new Pacing(0.5);
pacing.onChange = () => { neon.quality = pacing.scale; neon.resize(); };
document.addEventListener('visibilitychange', () => pacing.pause());

// ?perf shows the frame rate and what pacing chose, for testers to report.
const perf = new URLSearchParams(location.search).has('perf');
let fps = 0, frames = 0, fpsFrom = performance.now();

// The loading screen: black until the game is ready. If loading took a while (and always in
// the installed app) the owl has come out of the black, see index.html: then he hoots, stays
// a moment, and fades slowly into the game. The game's clock only starts once the black or the
// owl has gone, so the title and the menu begin in full view.
/** How long the owl takes to come out of the black (as in index.html), stays, and fades into the game (ms). */
const OWL_IN = 1600, OWL_STAY = 200, OWL_OUT = 1600;
/** Without the owl, the black just lifts (ms). */
const QUICK_OUT = 300;
/** The longest wait for the font before going on without it (ms). */
const FONT_WAIT = 3000;
let booting = true;
// Where the browser lets sound start by itself, the title music needn't wait for a tap.
sfx.autoplay();
const boot = document.getElementById('boot');
const owlAt = () => (window as unknown as { owlAt?: number }).owlAt;
if (!audioPrefs.muted) {
  if (owlAt() !== undefined) hoot();
  else window.addEventListener('owl', () => hoot(), { once: true });
}
void Promise.race([
  document.fonts?.load('16px Audiowide').catch(() => null),
  new Promise((r) => setTimeout(r, FONT_WAIT)),
]).then(async () => {
  const at = owlAt();
  const out = at === undefined ? QUICK_OUT : OWL_OUT;
  if (at !== undefined) await new Promise((r) => setTimeout(r, Math.max(0, at + OWL_IN + OWL_STAY - performance.now())));
  if (!boot) { booting = false; return; }
  boot.style.transition = `opacity ${out}ms ease-out`;
  boot.classList.add('gone');
  setTimeout(() => { booting = false; boot.remove(); }, out);
});

let last = performance.now();
function loop(now: number) {
  requestAnimationFrame(loop);
  if (booting) { last = now; return; }
  if (!pacing.tick(now)) return;
  game.frame((now - last) / 1000);
  last = now;
  if (!perf) return;
  frames++;
  if (now - fpsFrom >= 1000) { fps = (frames * 1000) / (now - fpsFrom); frames = 0; fpsFrom = now; }
  neon.overlay();
  neon.ctx.font = '12px monospace';
  neon.ctx.fillStyle = '#7f7';
  neon.ctx.globalAlpha = 1;
  neon.ctx.globalCompositeOperation = 'source-over';
  neon.ctx.textAlign = 'left';
  neon.ctx.textBaseline = 'top';
  neon.ctx.fillText(`${fps.toFixed(0)} fps  1/${pacing.skip}  dpr ${neon.dpr.toFixed(2)} of ${devicePixelRatio.toFixed(2)}  ${neon.canvas.width}x${neon.canvas.height}`, 4, 4);
}
requestAnimationFrame(loop);

if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
