# Game design

**Every threat is something the line does, and every answer is something Wavell does to the line.**

## The line and the characters

- **The line is physical** (`src/game/line.ts`). It is a vibrating string simulated with the wave equation. Footsteps dent it, and Wavell's attacks act on it.
- **The characters are part of the line.** Wavell (`src/game/actors/wavell.ts`) is a knot: one stroke that leaves the line at his back toe, loops through his arms and head and returns at his front toe. He walks by sliding his feet along the line like a wave, rises out of it when he appears (slowly the first time, out of a flat line, when the game loads), turns inside out through it when he flips under, and comes undone when he dies. Floating, the line loops up and ties off into a bubble that changes colour as time runs out. Landing, the bubble dives back in.
- **Creatures are spliced into the same stroke.** A Sinepede is a stretch of the line itself, bent into a sine wave, and it leaves a ripple as each segment dies.
- **The line has two sides.** Going down through the line leaves Wavell walking upside-down underneath until he goes back up.

## Time is the pressure

The end of the line crumbles in, slowly at first and faster every level, and a lead of at most 240 units can be built up. A gauge under the size counter shows what is left. Every flip, attack or stop costs ground. If the end reaches Wavell he crumbles with it: the break runs along his outline from one foot to the other, and the burnt stroke drifts away in sparks, in every direction. Any creature it reaches burns the same way, along its own contour, and the end of the line jumps to its far side.

## Two attacks

- A **wipe** lifts the line overhead and sends a crest along it the way Wavell faces. It is spent on the first creature it reaches.
- A **pull** grabs the line ahead and hauls it in taut, flattening the nearest creature in view ahead of him. It sends no wave.

A creature is a bulge of the line, so: **pull in what is close on your side, wipe what is on the other.**

The wrong attack feeds it instead. It grows and is thrown back along the line, and each growth takes one more right attack. A Sinepede grows by a segment. A Worm grows a size, with dots over it showing how many attacks are left, and is worth 3 more points per size.

## Opposite waves cancel

Enemies on Wavell's side can hurt him, and the other side is no hiding place. Wavell and an enemy on opposite sides are opposite waves: as they close in, each presses the other down, and if they cross they cancel out and both go flat. A flattened enemy melts into a plain hump of line that rolls on with the wave that hit it and dies away.

## One at a time

Up to level 3, threats come one at a time, with a second of clear line between them. After that, they overlap.

## The threats

| Threat | Where it is | Answer |
| --- | --- | --- |
| **Sinepede** (`sinepede.ts`) | Crawls along the line, as crests above it and troughs below it | The right attack for the segment facing you, one at a time |
| **Worm** (`worm.ts`) | Crawls underneath, sagging the line so you see it coming | Pull it, from either side. A wipe makes it grow and pushes it back. If it reaches you underneath it bites and leaves you dizzy. Walked over from on top, it hurts |
| **Backwave** | Rolls in from behind | Float over it, or face it and answer it (attacking the other way does nothing). A pull cancels it (+10). A wiped one rolls back off the left of the screen (+10), carrying the end of the line back with it, and the end of the line then stops for 2 seconds |
| **Line reflux** | Runs parallel to the line, on one side of it, half Wavell's height away | Be on the other side |
| **Sea Urchin** (`urchin.ts`) | Stays still, on both sides of the line. It starts as a fuzz on the line, then bursts out in spikes for a second | Pull it, or wait it out |
| **Bubble Burst** (`bubble.ts`) | Blisters out of either side of the line, swells and bursts. From level 6, some float off and burst in the air | Pop it early with the right attack, or keep clear |

The rule for opposite sides doesn't apply to the Sea Urchin, which sticks out on both sides of the line: a pull always kills it and a wipe always feeds it. Each wipe bounces it back a little, as the wrong attack does to the other enemies, starts its time over and adds half a second to it, makes it bigger and takes one more pull to undo, with dots showing how many are left. Each size is worth 3 more points.

The Sinepede is the basic enemy, and the Snawave's replacement. Each segment is half a wave. They alternate, so one that starts on a crest is a sine and one that starts on a trough is a cosine. It is one segment at level 1 and gets longer with the level. The right attack cancels the segment facing you. The wrong one throws it back and adds a segment at the far end.

Running into it, you both bounce back, away from each other, and you lose that ground to the end of the line. On your side of the line it gains a segment, at no other cost. On the other side the two waves cancel: it loses one, or flattens if that was its last, and you lose a size, or the game with no size left. A bubble always pops on it.

A Bubble Burst sprays drops that make Wavell dizzy: no moves for a moment and slow walking for two seconds. The wrong attack makes it swell and burst sooner. Walking into one, from either side, pops it but leaves him dizzy too.

From level 6, half of them let go of the line partway and float off, the way his own bubble does. Attacks along the line can't reach them, and a fed one is too heavy to go. When one bursts in the air, the spray pops his bubble, and leaves him dizzy if he is on the line under it.

## Size is armour

Wavell has one life, and his size is all that protects it. This is a trial and may turn out too hard. Every 10 sparkles caught make him bigger and walking faster, up to three sizes, with a bright run of notes. For a second and a half, fine copies of his outline ripple outwards and light runs along him from his feet to his head. The counter at the top left has a circle for each size: every sparkle draws a tenth of the next one. An enemy's hit takes a whole circle and leaves the sparkles towards the next one in place, and he flashes for a moment while nothing can hurt him. A hit with no circle left is game over.

This doesn't apply to the bubble. A bigger Wavell makes a bigger bubble, which lasts longer but is easier to hit, and when it pops the game is over. The end of the line also ends it, whatever his size.

## Sound and shape match

The music is meant to be generated by the game itself, from the sounds of actions and enemies, so there is no recorded soundtrack. Mechanics stay simple and immediate, and an enemy's sound should say the same thing as its shape.

- **Sinepede:** pure sine tones. It announces itself with one note per segment, high for a crest and low for a trough. Its steady tone gets louder as it closes in, and each segment you cancel plays its own note.
- **Sea Urchin:** a low tremble under the fuzz on the line, then a harsh, clipped sound for as long as its jagged spikes are out.

## Sparkles are the bait

Every enemy killed leaves two sparkles behind, one on each side of the line. A few more pop up on their own, as many below the line as above it, often behind Wavell. They drift about at random and blink out after a few seconds. Each one counts towards his next size. Catching them in a quick chain is worth more and more, and gold ones, high up or at the limit of his reach underneath, are worth five times as much. Chasing them means giving ground to the line.

Enemies on the line never overlap. Those that crawl queue up behind whatever is ahead of them, a Sea Urchin or Bubble Burst only appears where there is room, and an enemy thrown back stops at the next one or shoves it along. The Backwave and the Reflux are waves in the line, so they pass through the others, and a bubble in the air is off the line.

## The beat

A music-timing core for the game ([issue #3](https://github.com/matamadio/the-line/issues/3)). It is on by default; the first knob of the Beat group in the difficulty editor turns it off.

- A click on every beat, with a higher one on the first beat of each bar. There is no recorded music: the music is meant to come from the game's own sounds.
- The line lights up on each beat, so the beat can be seen with the sound off.
- The whole world runs at `BPM / 75`, and the tempo rises by 2 BPM per level, changing only at the start of a bar.
- Enemies come in on the beat, one to a beat and never more than two to a bar: on beat 4 only up to level 5, and on beats 2 and 4 from level 6. The kinds take turns, the one furthest past its time going next, so the commonest doesn't take every beat.
- What they do with a sound also waits for the beat: a Sea Urchin's spikes, a Backwave or Reflux setting off, a Bubble Burst letting go or bursting. Warnings and fuses are whole beats.

Sounds that answer the player, like a hit or a cancelled segment, stay immediate, and the player's timing isn't judged.

## Not in yet

These are in the original game and have no version here so far: the Wavehole, the Linesaver bonus and the Flatter. Some of their sounds are already in `public/assets/sounds/`.
