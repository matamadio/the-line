# The Line: game rules reference

Every rule the game follows, with its numbers, as of 10 November 2026. It is taken from [DESIGN.md](DESIGN.md), [`src/data/difficulty.json`](../src/data/difficulty.json), [`src/data/tune.ts`](../src/data/tune.ts) and [`src/game/game.ts`](../src/game/game.ts). Where the design notes and the code disagree, the shipped numbers in `difficulty.json` win. When you change a rule or a number, update this page too.

## Contents

- [Overview](#overview)
- [Controls](#controls)
- [Wavell, the line and dying](#wavell-the-line-and-dying)
- [Enemies and hazards](#enemies-and-hazards)
- [Sparkles and power-ups](#sparkles-and-power-ups)
- [Scoring and levels](#scoring-and-levels)
- [Music, beat and sound](#music-beat-and-sound)
- [Visuals and screens](#visuals-and-screens)
- [Platform and saving](#platform-and-saving)
- [Where the rules live](#where-the-rules-live)

## Overview

Wavell walks right along a line while its end crumbles in behind him. He has to keep moving and deal with whatever the line throws at him.

- **One design rule.** Every threat is something the line does. Every answer is something Wavell does to the line.
- **The line is physical.** It is a vibrating string simulated with the wave equation (`src/game/line.ts`). Footsteps dent it and attacks act on it.
- **Everything is one stroke.** Wavell is a knot in the line. Creatures are stretches of the line bent into shape. Nothing is a sprite.
- **Two sides.** Wavell can walk on top of the line or upside down underneath it. All rules work the same from either side.
- **Time is the pressure.** Stopping, flipping or attacking all cost ground to the end of the line.
- **Play area.** Every screen shows the same 16:9 area, 356 × 200 world units, so nobody sees further ahead.

## Controls

The player can change keys and joypad buttons under CONTROL in the menu. These are the defaults.

| Action | Keyboard | Joypad | Touch |
| --- | --- | --- | --- |
| Walk | ← → or A D | D-pad or left stick | Left thumb, sideways |
| Go through the line | Towards it: ↓/S on top, ↑/W underneath | Towards it | Left thumb, towards the line |
| Float in a bubble | Away from it: ↑/W on top, ↓/S underneath | Away from it | Left thumb, away from the line |
| Pull | X or Ctrl | X | Right thumb, swipe sideways |
| Wipe | Z, Shift or Space | A | Right thumb, swipe up or down |
| Mute | M | | Speaker icon |
| Fullscreen | F | | Corners icon |
| Nostalgia (low-resolution look) | N | | Checkerboard icon |
| Pause | P | Start | |
| Back to the start screen | Esc | Back | |

- **Directions are relative to the line.** "Towards" goes through it and "away" floats off, on whichever side Wavell is.
- **Menu.** ↑ and ↓ cycle the entries (START, CONTROL, CREDITS). Enter, a wipe, a pull or joypad A picks the front one: Wavell pulls it in to open it. On a phone, swipe up or down and tap.
- **First-time hints.** Each enemy and each mistake (such as a wrong attack) shows a hint the first time, for 3.5 s, worded for keys or touch depending on the input in use.
- **Saved.** Key bindings are saved in the browser.

## Wavell, the line and dying

Wavell has one life, and his size is his armour. The game ends when he is hit with no size left, when his bubble pops, or when the end of the line reaches him.

### The end of the line

- It crumbles in at 40 u/s at level 1, +4 u/s per level, up to 80 u/s.
- Wavell can build a lead of at most 240 u. A gauge under the size counter shows what is left.
- After (re)spawning, the end waits 1.6 s before it moves.
- If it reaches Wavell he burns away along his outline, whatever his size. A creature it reaches burns the same way, and the end jumps to that creature's far side.

### Moving

- Walk speed is 100 u/s, plus 8% per size.
- **Flip** (go through the line) takes 0.34 s. Afterwards he walks on the other side until he flips back.
- **Float**: his head fills into a bubble (0.45 s) and he leaves the line. The bubble stays on its side of the line and changes colour as its time runs out. Landing takes 0.4 s.
- A bigger Wavell makes a bigger bubble: it lasts 35% longer per size but is easier to hit. **If the bubble pops, the game is over**, whatever his size.

### The two attacks

| Attack | What it does | Use it on |
| --- | --- | --- |
| **Pull** | Grabs the line ahead and hauls it taut. Flattens the nearest creature in view ahead. Sends no wave | A creature close by on **his own side** |
| **Wipe** | Lifts the line overhead and sends a crest along it the way he faces. Spent on the first creature it reaches | A creature on the **other side** |

The rule to remember: **pull in what is close on your side, wipe what is on the other.** The Disturchin and the Worm are exceptions (see [Enemies](#enemies-and-hazards)).

**The wrong attack feeds a creature.** It grows and is knocked back along the line (knockback 650). Each growth needs one more right attack. A creature can grow at most 3 sizes; a Sinepede at most 8 segments.

### Opposite waves cancel

- Wavell and an enemy on opposite sides are opposite waves. As they close in (from 80 u, over 57 u), the enemy is pressed down to 20% while Wavell keeps his shape.
- If they cross, they cancel. The flattened enemy melts into a plain hump that rolls on and dies away (0.5 s).
- Wavell loses a size. With no size left, he sinks into the line and the game ends.

### Size

- Every 10 sparkles caught make him one size bigger, up to 3 sizes. Each size makes him 30% bigger and 8% faster.
- Growing plays a bright run of notes, and copies of his outline ripple out for 1.5 s.
- The counter at the top left has one circle per size; each sparkle draws a tenth of the next one.
- A hit takes one whole circle and keeps the sparkles towards the next. He is then safe for 1.2 s and flashes.
- **Dizzy** (from Worm bites and Bubble Burst spray): no moves for 0.9 s, slow walking for 2 s.

## Enemies and hazards

There are six threats. Each has one clear rule and one sound that matches its shape.

| Threat | Where it is | Answer | First appears | How often (level 1 → limit) |
| --- | --- | --- | --- | --- |
| **Sinepede** | Crawls along the line as crests above and troughs below | The right attack for the segment facing you, one segment at a time | After 1.75 s | Every 4.25 s → 1.8 s (−0.35 s/level) |
| **Worm** | Crawls underneath, sagging the line | Pull it, from either side | After 10 s of play | Every 6.6 s → 2.6 s (−0.4 s/level) |
| **Bubble Burst** | Blisters out of either side, swells and bursts | Pop it early with the right attack, or keep clear | After 6 s of play | Every 5.15 s → 2.4 s (−0.35 s/level) |
| **Disturchin** | Stays still, on both sides of the line | Pull it, or wait it out | After 14 s of play | Every 7 s → 3.5 s (−0.4 s/level) |
| **Line reflux** | Runs parallel to the line on one side, half Wavell's height away | Be on the other side | After 5 s of play | 29% chance every 3 s, +4%/level |
| **Backwave** | Rolls in from behind | Float over it, or turn and answer it | After 22 s of play | 35% chance every 4 s, +5%/level |

### Sinepede

- The basic enemy. Each segment is half a wave; segments alternate crest and trough.
- Length: 1 segment at level 1, +0.5 per level (rounded down), up to 6. Wrong attacks can grow it to 8.
- Speed 100 u/s. Its clock runs at 40% while Wavell is not walking.
- The right attack cancels the facing segment and sends a ripple on. The wrong one throws it back and adds a segment at the far end.
- **Running into it**: both bounce apart (his knockback 300) and he loses that ground. On his side it gains a segment. On the other side the waves cancel: it loses a segment, or flattens if it was the last, and he loses a size. A bubble always pops on it.

### Worm

- Speed 70 u/s. Its clock runs 1.6× faster while Wavell is under the line.
- A pull kills it from either side. A wipe makes it grow a size and pushes it back. Dots over it show how many pulls are left.
- If it reaches him underneath, it bites and leaves him dizzy. Walked over from on top, it hurts.

### Bubble Burst

- It appears on Wavell's side 65% of the time. Time to burst: 1.74 s at level 1, −0.06 s per level, down to 1.1 s.
- Its spray makes him dizzy. The wrong attack makes it swell and burst sooner. Walking into it pops it but still leaves him dizzy.
- **From level 6**, half of them float off the line partway and burst after 1.6 s in the air. Attacks along the line can't reach those, and a fed one is too heavy to fly. The spray pops his bubble, and leaves him dizzy if he is on the line under it.

### Disturchin

- It starts as a fuzz on the line (warning 0.9 s at level 1, −0.03 s per level, down to 0.5 s), then bursts out in spikes for 1 s.
- The opposite-sides rule doesn't apply: **a pull always kills it and a wipe always feeds it.**
- Each wipe bounces it back (knockback 250), restarts its time with 0.5 s more, makes it bigger and takes one more pull. Dots show how many are left.

### Line reflux

- Speed 175 u/s. It hits him on the line if he is on its side, or his bubble if it passes through it.

### Backwave

- Height 22 u, speed 220 u/s, growing 15% of its height per second.
- Only an attack facing it works; attacking the other way does nothing.
- A pull cancels it. A wipe throws it back off the left of the screen, carrying the end of the line back with it, and the end then stops for 2 s.

### Order on the line

- **Up to level 3**, threats come one at a time, with 1 s of clear line between them. From level 4 they overlap.
- Enemies on the line never overlap. Crawlers queue behind whatever is ahead; a Disturchin or Bubble Burst only appears where there is room. A thrown-back enemy stops at the next one or shoves it along.
- The Backwave and Reflux are waves in the line, so they pass through the others. A bubble in the air is off the line.

## Sparkles and power-ups

Sparkles are the only pickup in the game today. They are the bait: chasing them gives ground to the line.

- Every enemy killed leaves 2 sparkles, one on each side of the line.
- More appear on their own about every 3 s, at most 6 at a time, as many below the line as above, often behind Wavell.
- They drift at random and blink out after a few seconds.
- 12% are **gold**. Gold ones sit 45–65 u off the line, where only his bubble reaches, and are worth 5×. Normal ones sit 6–40 u off.
- Each sparkle counts towards his next size (10 per size).
- Catching them in a chain within 2.2 s of each other scores 1, 2, 3… up to 8 points each (see [Scoring](#scoring-and-levels)).

**Planned power-ups (not built yet):** RAGE and KILLERWAVE, collected and then used once. Their look and behaviour are still to be decided.

## Scoring and levels

Every score is multiplied by 1 + half Wavell's size: ×1 at no size, ×1.5, ×2, up to ×2.5 at full size (rounded to whole points). A hit lowers the multiplier along with the size. The multiplier shows left of the score. Levels go by the score, so staying big brings the levels on faster.

| Event | Base points |
| --- | --- |
| Sinepede segment cancelled | 4 |
| Worm killed | 5 + 3 per size it grew |
| Disturchin killed | 4 + 3 per size it grew |
| Bubble Burst popped | 3 |
| Backwave pulled flat | 10 |
| Backwave wiped back | 10 |
| Backwave floated over | 6 |
| Line reflux passed safely | 6 |
| Sparkle | Chain position (1–8), ×5 if gold |

### Levels

- There are 10 levels. Each level costs 50 points more than the one before: level 2 starts at 50 points, level 3 at 150, level 4 at 300, level 5 at 500, level 6 at 750, level 7 at 1050, level 8 at 1400, level 9 at 1800 and level 10 at 2250.
- A level-up shows a banner, shakes the screen and plays the level sound.
- Level 10 is the last and will be a boss fight. Until that is built, level 10 simply goes on.
- The best score is saved in the browser.

### What changes with the level

Anything that gets harder is a ramp: a value at level 1, a change per level and a limit.

| Ramp | Level 1 | Per level | Limit |
| --- | --- | --- | --- |
| End of the line speed | 40 u/s | +4 | 80 u/s |
| Tempo | 75 BPM | +2 | 120 BPM |
| Sinepede segments | 1 | +0.5 | 6 |
| Disturchin warning | 0.9 s | −0.03 | 0.5 s |
| Bubble Burst time to burst | 1.74 s | −0.06 | 1.1 s |
| Backwave chance per roll | 35% | +5% | 100% |
| Reflux chance per roll | 29% | +4% | 100% |
| Music layers (one instrument per level) | 1 | +1 | 5 |

Spawn intervals are in the [Enemies](#enemies-and-hazards) table. Other level gates: threats overlap from level 4, enemies come on two beats per bar from level 6, and Bubble Bursts float off from level 6.

## Music, beat and sound

The game has no recorded soundtrack. Web Audio synthesizes every note as the game plays, so the music follows any tempo and time signature exactly.

### The beat

- The beat is on by default (first knob of the Beat group in the difficulty editor).
- The whole world runs at BPM / 75, so everything stays the same length in beats. At 75 BPM the walk cycle is exactly half a beat.
- The tempo starts at 75 BPM, rises 2 BPM per level up to 120, and only changes at the start of a bar.
- The beat is counted in simulation steps (96 steps of 1/120 s per beat), never on a clock, so replays are exact.
- The line lights up on each beat, brighter on the first beat of a bar, so the beat can be seen with the sound off.
- **Enemies come in on the beat**: on the last beat of the bar, and from level 6 also on the beat half a bar before it. That is never more than two per bar. Kinds take turns: the one furthest past its due time goes next.
- **Enemy actions wait for the beat**: a Disturchin's spikes, a Backwave or Reflux setting off, a Bubble Burst letting go or bursting. Warnings and fuses last whole beats.
- **Time signature** (2/4, 3/4, 4/4, 5/4, 6/8 or 7/8, from the audio menu) sets the beats per bar. A change waits for the next bar.

### Music styles

| Style | Sound | Swing |
| --- | --- | --- |
| Vibe | Swung lo-fi, electric piano | 0.22 |
| Chill | Pads and bells | none |
| Trip | Trip-hop: heavy lazy beat, vinyl crackle, Rhodes, strings, sliding theremin-like lead, over B Em7 A B | 0.3 |
| Lotus | Shakuhachi-like flutes, koto, temple woods, in the yo scale (A B D E F♯) | none |
| Tekno | Four-on-the-floor kick, offbeat bass, acid line, rave stabs, over Am7 Dm7 Fmaj7 E7 | none |
| Chiptune | Square waves and noise | none |
| Bluegrass | Upright-style bass, guitar strum, banjo rolls (Karplus-Strong plucks) | 0.08 |

- **One key.** Every style is in A, the key of the Sinepede's two notes, so game tones always fit. With Lotus on, Wavell's tones move to the nearest note of the yo scale.
- **The style dresses every sound.** A lowpass and an echo timed in beats go over all game sounds, and Wavell's tones use the style's waveform.
- **Building up.** Every style has five instruments. Level 1 plays the first, and each level adds one, until all five play from level 5.
- **Chords by name.** Tekno's and Trip's progressions are one line each (`TEK_CHORDS`, `TRIP_CHORDS` in `src/core/styles.ts`), and their bass and leads follow each chord's scale.
- **Levels.** Sound effects play at 0.55 and music at 0.5, so the effects sit under the music.
- Each style plays on the strong beats and backbeats of the chosen time signature, not a fixed count of four.
- **Nostalgia mode** bitcrushes the music to match the low-resolution look: 8,000 samples a second at 8 bits, filtered at 6.5 kHz before and 4.5 kHz after.

### Sound matches shape

- **Sinepede:** pure sine tones whatever the style. It announces itself with one note per segment, high for a crest, low for a trough. Its steady hum gets louder as the nearest one closes in. Each cancelled segment plays its own note.
- **Disturchin:** a low tremble under the fuzz, then a harsh, clipped sound while its spikes are out.
- **Wavell:** a bright run of notes when he grows, a falling one when he shrinks.
- **Samples** from the original 2003 game cover the rest: appearing, vanishing, flipping down and up, hits, kills, being eaten, Reflux, bubble pop, level pass and the Backwave bonus.

### Audio menu

- The speaker button at the top right opens it: sound on or off, music style, time signature.
- The game pauses while it is open, and the music keeps playing so a choice can be heard at once.
- M mutes in one press. Audio choices are saved in the browser.

### Start screen

- The start screen plays the chosen style, all five instruments, once the title has formed and Wavell has risen out of the line. Browsers only allow sound after the first tap or key, so on a first visit it starts then.
- It keeps the game's own beat clock, so it keeps playing through the audio menu without going back to the first bar.
- Picking START doesn't restart it: the same beat and bar carry on, and the music thins to level 1's one instrument while the other four fade away over a second or two. Each level then adds one back.

## Visuals and screens

Everything is drawn as glowing vector strokes at the screen's native resolution. Nothing is a sprite.

- **One stroke.** Wavell leaves the line at his back toe, loops through his arms and head, and returns at his front toe. Creatures are spliced into the same stroke. Nothing crosses his face.
- **Appearing.** He climbs out of the line hands first, then head, then a press-up and his legs. On first load the line stays flat for 0.8 s and he rises slowly over 3 s; after that, appearing takes 1 s.
- **Dying.** Killed by an enemy, he sinks back into the line looking up (0.6 s) until one raised hand is the last of him. Burnt by the end of the line, the break runs along his outline from foot to foot (1.25 s) and drifts away in sparks.
- **Enemy deaths.** A killed creature melts into a hump that rolls on with the wave that hit it. A Sinepede leaves a ripple as each segment dies.
- **Screens.** The title is one unbroken stroke. Starting a game breaks it apart. At game over, FLATLINED appears and turns back into the title.
- **HUD.** Top left: size circles, with the lead gauge under them. Score with its multiplier to the left. Points pop up where they are earned. A banner shows each new level.
- **Nostalgia mode** (N or the checkerboard icon) gives a low-resolution look and is saved in the browser.

## Platform and saving

The game runs in the browser at <https://matamadio.github.io/the-line/> and installs as an app (PWA), which also lets it play offline.

- **Saved in the browser:** best score, key bindings, audio choices (mute, style, time signature) and Nostalgia mode. Nothing is saved online.
- **Phones:** play held sideways. The corners icon goes fullscreen, except on iPhone. Install from the start screen's install button; on iPhone, from the Share menu.
- **Shared origin:** several apps live on matamadio.github.io, so the manifest needs its own explicit id (`/the-line/`).
- **Sound** only starts after the first tap or key press, as browsers require.

## Where the rules live

| To change | File | Edited with |
| --- | --- | --- |
| Difficulty: speeds, spawn rates, ramps, scoring, sizes, beat | `src/data/difficulty.json` (defaults in `difficulty.ts`) | Difficulty editor, `npm run difficulty` |
| Feel: walk, flip, float, wave, death and melt timings | `src/data/tune.ts` | Animation lab sliders, `npm run lab` (copy values back by hand) |
| Animation keyframes | `src/data/anim.json` | Keyframe editor in the lab |
| Rules and point values | `src/game/game.ts` | Code |
| Beat and cue beats | `src/game/beat.ts` | Code |
| Music styles | `src/core/styles.ts`, `src/core/music.ts` | Code |
| Sound effects | `src/core/sfx.ts` | Code |
| Design intent | [`docs/DESIGN.md`](DESIGN.md) | Text |

**Open question:** Wavell has one life and size as armour. The design notes call this a trial that may prove too hard.
