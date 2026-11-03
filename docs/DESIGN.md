# Game design

**Every threat is something the line does, and every answer is something Wavell does to the line.**

## The line and the characters

- **The line is physical** (`src/game/line.ts`). It is a vibrating string simulated with the wave equation. Footsteps dent it, and Wavell's attacks act on it.
- **The characters are part of the line.** Wavell (`src/game/actors/wavell.ts`) is a knot: one stroke that leaves the line at his back toe, loops through his arms and head and returns at his front toe. He walks by sliding his feet along the line like a wave, rises out of it when he appears, turns inside out through it when he flips under, and comes undone when he dies. Floating, the line loops up and ties off into a bubble that changes colour as time runs out. Landing, the bubble dives back in.
- **Creatures are spliced into the same stroke.** Snawaves grow out of the line, push a bow wave ahead of them, and leave a ripple when they die.
- **The line has two sides.** Going down through the line leaves Wavell walking upside-down underneath until he goes back up.

## Time is the pressure

The end of the line crumbles in at nearly walking speed, faster every level, and a lead of at most 240 units can be built up. A gauge under the lives shows what is left. Every flip, attack or stop costs ground. If the end reaches Wavell he crumbles with it: the break runs along his outline from one foot to the other, and the burnt stroke falls away in pieces.

## Two attacks

- A **wipe** lifts the line overhead and sends a crest along it the way Wavell faces. It is spent on the first creature it reaches.
- A **pull** grabs the line ahead and hauls it in taut, flattening the nearest creature within about 120 units. It sends no wave.

A creature is a bulge of the line, so: **pull in what is close on your side, wipe what is on the other.**

The wrong attack feeds it instead. It grows a size and is thrown back along the line, and each size takes one more right attack. Dots over a grown creature show how many are left, and it is worth 3 more points per size.

## Opposite waves cancel

Enemies on Wavell's side can hurt him, and the other side is no hiding place. Wavell and an enemy on opposite sides are opposite waves: as they close in, each presses the other down, and if they cross they cancel out and both go flat. A flattened enemy melts into a plain hump of line that rolls on with the wave that hit it and dies away.

## The threats

| Threat | Where it is | Answer |
| --- | --- | --- |
| **Snawave** (`snawave.ts`) | Rides on top of the line | Pull it from on top, or wipe it from underneath |
| **Worm** (`worm.ts`) | Crawls underneath, sagging the line so you see it coming | Wipe it from on top, or pull it from underneath |
| **Backwave** | Rolls in from behind | Float over it, or attack just as it hits, which pins the line and bounces it back (+10) |
| **Line reflux** | Runs along one side of the line | Be on the other side |
| **Bubble Burst** (`bubble.ts`) | Blisters out of either side of the line, swells and bursts | Pop it early with the right attack, or keep clear |

A Bubble Burst sprays drops that make Wavell dizzy: no moves for a moment and slow walking for two seconds. The wrong attack swells it closer to bursting. Crossing one from the other side cancels it but leaves him dizzy too.

## Sparkles are the bait

Sparkles pop up all around, often behind Wavell or off the line, drift about at random and blink out after a few seconds. Catching them in a quick chain is worth more and more, and gold ones, high up, are worth five times as much. Chasing them means giving ground to the line.

## Not in yet

These are in the original game and have no version here so far: the Wavehole, the Linesaver bonus and the Flatter. Some of their sounds are already in `public/assets/sounds/`.
