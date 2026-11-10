# Notes for Claude

## Keep the docs in sync

Any change that touches a rule, a number the player feels, or the music has to update the docs in the same commit, without being asked. This covers:

- `src/data/difficulty.json` or `difficulty.ts` (speeds, spawn rates, ramps, sizes, sparkles, levels, beat)
- `src/data/tune.ts` defaults (walk, flip, float, dizzy, death and melt timings)
- `src/game/game.ts` rules or point values, `src/game/beat.ts` cue rules
- enemies in `src/game/actors/`, controls in `src/core/controls.ts` and `input.ts`
- music styles, time signatures and sounds in `src/core/music.ts`, `styles.ts`, `sfx.ts`
- menus, HUD, saving, install or PWA behaviour

What to update:

- `docs/RULES.md`: the rule and its numbers. It is the one reference for every rule; keep its tables right.
- `docs/DESIGN.md`: when the design itself changes (a new threat, a new mechanic, a changed principle).
- `README.md`: when controls, commands, editors or the project layout change.

Pure refactors, tests, tooling and visuals that change no rule need no doc change. If unsure, check `docs/RULES.md` for the thing you changed.

`docs/RULES.md` is the source of truth. The Claude Docs copy of the rules (https://claude.ai/artifact/4PKhM6oAs6oPYihmykPZsQ) is a snapshot from 2026-11-10 and is not kept in sync.
