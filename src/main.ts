import { initApp } from './core/app';
import { DIFF } from './data/difficulty';
import { Game } from './game/game';
import { Input } from './core/input';
import { Neon } from './core/neon';
import { Pacing } from './core/pacing';

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

let last = performance.now();
function loop(now: number) {
  requestAnimationFrame(loop);
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
