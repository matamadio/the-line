import { Game } from './game/game';
import { Input } from './core/input';
import { Neon } from './core/neon';
import { DIFF } from './data/difficulty';

// The beat prototype (see game/beat.ts) is off unless the address asks for it.
if (new URLSearchParams(location.search).has('beat')) DIFF.beatOn = 1;

const canvas = document.getElementById('view') as HTMLCanvasElement;
const neon = new Neon(canvas);
const game = new Game(neon, new Input(canvas));

let last = performance.now();
function loop(now: number) {
  game.frame((now - last) / 1000);
  last = now;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
