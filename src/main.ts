import { initApp } from './core/app';
import { Game } from './game/game';
import { Input } from './core/input';
import { Neon } from './core/neon';

initApp();

const canvas = document.getElementById('view') as HTMLCanvasElement;
const neon = new Neon(canvas);
const game = new Game(neon, new Input(canvas));
game.loadNostalgia();

let last = performance.now();
function loop(now: number) {
  game.frame((now - last) / 1000);
  last = now;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
