import { initApp } from './core/app';
import { DIFF } from './data/difficulty';
import { Game } from './game/game';
import { Input } from './core/input';
import { Neon } from './core/neon';

initApp();

// ?level=10 starts every game at that level (the boss, for trying him out), without saving it.
const startAt = Number(new URLSearchParams(location.search).get('level'));
if (startAt >= 1) DIFF.startLevel = Math.floor(startAt);

const canvas = document.getElementById('view') as HTMLCanvasElement;
const neon = new Neon(canvas);
const game = new Game(neon, new Input(canvas));
game.loadNostalgia();
game.loadControls();

let last = performance.now();
function loop(now: number) {
  game.frame((now - last) / 1000);
  last = now;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
