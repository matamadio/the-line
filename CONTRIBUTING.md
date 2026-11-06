# Contributing to The Line

## Ways to help

- **Play and report.** Open an [issue](https://github.com/matamadio/the-line/issues/new/choose): a bug, or what felt unfair, confusing or great.
- **Tune it.** Use the [editors](README.md#the-editors) on the hosted version and paste the numbers into a playtest issue, or save them in your checkout and open a pull request.
- **Change the game.** Read on.

## Workflow

1. Create a branch from `main`.
2. Make your change. `npm start` gives you the game with live reload.
3. Run `npm run check`, which type-checks and runs the tests.
4. Open a pull request. CI runs the same check and a build, and merged changes go live on the hosted version.

Keep a pull request to one change. Editor saves rewrite whole data files, so a tuning change is easiest to review, and to merge, on its own. If two branches touch the same data file, re-save from the editor after merging rather than resolving the conflict number by number.

## How the code fits together

The [project layout](README.md#project-layout) shows where things live. A few rules keep it working:

**`core/` knows nothing about the game.** `game/` may import `core/` and `data/`, and `editors/` may import all three. Nothing in `game/` imports from `editors/`.

**The simulation runs in fixed steps.** `Game.step` advances the world by exactly 1/120 s, however fast the screen refreshes. Anything that affects play belongs there.

**The simulation has to stay exact.** The animation lab scrubs backwards by replaying from the start, so the same seed and keys must always give the same game. In simulation code:

- Use `Math.random()`, or `rand()` from `core/neon.ts`. The lab swaps in a seeded generator around each step.
- Don't read the clock (`Date.now`, `performance.now`).
- Don't let drawing change the game's state. `render.ts` and `hud.ts` run at the screen's rate, and in the lab they don't run during a replay.

A test plays the game twice and fails if the two runs differ.

**The numbers belong in `data/`.** Tuning values go where the editors can reach them, not inline in the code:

| Kind of number | Where it goes |
| --- | --- |
| How hard the game is (speeds, how often, level ramps) | `src/data/difficulty.ts`, which adds a row to the difficulty editor |
| How things feel (timings, heights) | `src/data/tune.ts`, which adds a slider to the lab |
| Poses and motions | `src/data/anim.json`, through the keyframe editor |

**World units are the original game's pixels.** Every screen shows the same `VIEW_W` x `VIEW_H` of them (`src/core/neon.ts`), y = 0 is the line at rest, and negative y is up. `n.w` and `n.h` are the play area, not the canvas: draw outside it only after `n.overlay()`.

## Recipes

**Add a difficulty number.** Add a knob to `DIFF_KNOBS` in `src/data/difficulty.ts`, and read it through `DIFF.yourKnob`. For one that changes with level, add `x`, `xPer` and `xCap`, and read it with `at('x', level)`. The editor builds its row and curve by itself. Save once from the editor to record the value in `difficulty.json`.

**Add a lab scene.** Add an entry to `SCENES` in `src/editors/lab/scenes.ts`: a name, a duration, a script of keys and a setup that puts things in place. Keep "Free play" last.

**Add an enemy.**

1. Write the actor in `src/game/actors/`. `worm.ts` is a compact example: it updates itself, gives its outline to the line's stroke, and has states for rising, moving, biting and dying.
2. Spawn and update it from `game.ts`, using `updateWorms` as a model. Add it to `targets()` if attacks can hit it.
3. Splice its outline into the line in `drawLine` in `render.ts`.
4. Add its numbers to `difficulty.ts`, a scene to the lab, and its rules to `docs/DESIGN.md`.

The game's design rule applies: **every threat is something the line does, and every answer is something Wavell does to the line.** See [docs/DESIGN.md](docs/DESIGN.md).

## Style

There is no formatter or linter yet. Match the code around you: two spaces, single quotes, short names for things used constantly (`W` for Wavell, `L` for the line, `n` for the renderer). Comments say why something is the way it is, in plain sentences.

The original game's event list is in [docs/original-events.txt](docs/original-events.txt). Check it when you want to know how the 2003 game timed something.
