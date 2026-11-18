# The Line: game rules reference

Every rule the game follows, with its numbers, as of 10 November 2026. It is taken from [DESIGN.md](DESIGN.md), [`src/data/difficulty.json`](../src/data/difficulty.json), [`src/data/tune.ts`](../src/data/tune.ts) and [`src/game/game.ts`](../src/game/game.ts). Where the design notes and the code disagree, the shipped numbers in `difficulty.json` win. When you change a rule or a number, update this page too.

## Contents

- [Overview](#overview)
- [Controls](#controls)
- [Wavell, the line and dying](#wavell-the-line-and-dying)
- [Enemies and hazards](#enemies-and-hazards)
- [The boss: THE SILENCER](#the-boss-the-silencer)
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

| Action | Keyboard | Joypad | Touch | LG TV remote |
| --- | --- | --- | --- | --- |
| Walk | ← → or A D | D-pad or left stick | Left thumb, sideways | ← → |
| Go through the line | Towards it: ↓/S on top, ↑/W underneath | Towards it | Left thumb, towards the line | Towards it (↑ ↓) |
| Float in a bubble | Away from it: ↑/W on top, ↓/S underneath | Away from it | Left thumb, away from the line | Away from it (↑ ↓) |
| Pull | X or Ctrl | X | Right thumb, swipe sideways | CH − (or green) |
| Wipe | Z, Shift or Space | A | Right thumb, swipe up or down | CH + (or red) |
| Mute | M | | Speaker icon | |
| Fullscreen | F (also in the installed app on a computer) | | Corners icon, under the audio icon (not in the installed app on a phone, which is fullscreen already) | |
| Nostalgia (low-resolution look) | N | | Checkerboard icon | |
| Pause | P | Start | | OK or Play, or Back |
| Back to the start screen | Esc | Back | | Back, while paused |

- **LG TV.** On webOS the remote's buttons are keys like any other, and can be bound under CONTROL (one the game has no name for shows as REMOTE and its number). CH + wipes, CH − pulls and OK pauses (in menus OK still picks, and on the game-over screen it carries on). CH +/−, red, green, OK and Play are bound on every device, after its own keys, so Enter also pauses on a computer, since a TV's browser may not say it is one. The game takes itself for a TV when the browser says so, or at the first button only a remote has (Back, a colour, a media button, or a key that comes with no name). The remote's buttons then come first, so the hints name them, unless the player has bound keys of their own. Back never leaves the page: in a game it pauses, and pressed again while paused it goes back to the start screen; OK carries on. Anywhere else Back does what Esc does. On a TV, CONTROL shows a drawing of the remote with what each button does, instead of the list of keys; ← → there switches to the joypad, whose buttons can be changed. A TV never counts as a touch screen, even if its browser takes the Magic Remote's pointer for a finger: no thumb controls, and hints name the remote's buttons. In the TV app there is no fullscreen icon: it is always fullscreen.
- **Android TV app.** It turns the joypad into keys: the d-pad and the left stick are the arrows, A wipes, X pulls, Start pauses and carries on, and B (or Back) goes back to the start screen from the pause; in a game it does nothing, and anywhere else it does what Esc does. It opens the game with `?pad`, so the hints and CONTROL name the joypad's buttons (A, X, START, B) and CONTROL can't change them; picking one says THE APP SETS THESE BUTTONS.
- **Directions are relative to the line.** "Towards" goes through it and "away" floats off, on whichever side Wavell is.
- **Menu.** ↑ and ↓ cycle the entries (START, CONTROL, CREDITS, FLATTEN). Enter, a wipe, a pull or joypad A picks the front one: Wavell pulls it in to open it. On a phone, swipe up or down and tap.
- **FLATTEN** quits: the screen goes dark over 1.2 s and the game closes (the installed app's window, the LG TV app, and the Android TV app, which closes itself when the page asks, since its web view ignores the browser's close). A browser tab the page did not open itself may stay open: then it says so, and after 0.5 s any key or tap brings the menu back.
- **First-time hints.** Each enemy and each mistake (such as a wrong attack) shows a hint the first time, for 3.5 s, worded for keys or touch depending on the input in use. Once the levels start over after the boss, no hints show again.
- **Saved.** Key bindings are saved in the browser.

## Wavell, the line and dying

Wavell has one life, and his size is his armour. The game ends when he is hit with no size left, when his bubble pops, or when the end of the line reaches him. Nothing else ends it: beating the boss starts the levels over.

### The end of the line

- It crumbles in at 40 u/s at level 1, +3 u/s per level, up to 80 u/s. During the boss fight it crumbles at 60 u/s.
- Wavell can build a lead of at most 240 u. A gauge under the size counter shows what is left; it reads full while a wiped Whiplash holds the end off the screen.
- After (re)spawning, the end waits 1.6 s before it moves.
- If it reaches Wavell he burns away along his outline, whatever his size. A creature it reaches burns the same way: the break crosses it at the speed the end crumbles in, and the end carries on from its far side.

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
| **Sinepede** | Crawls along the line as crests above and troughs below | The right attack for the segment facing you, one segment at a time | From level 2, 1.75 s into it | Every 4.25 s → 1.8 s (−0.26 s/level) |
| **Worm** | Crawls underneath, sagging the line | Pull it, from either side | After 10 s of play | Every 6.6 s → 2.6 s (−0.3 s/level) |
| **Bubble Burst** | Blisters out of either side, swells and bursts | Pop it early with the right attack, or keep clear | After 6 s of play | Every 5.15 s → 2.4 s (−0.26 s/level) |
| **Disturchin** | Stays still, on both sides of the line | Pull it, or wait it out | After 14 s of play | Every 7 s → 3.5 s (−0.3 s/level) |
| **Line reflux** | Runs parallel to the line on one side, half Wavell's height away | Be on the other side | After 5 s of play | 29% chance every 3 s, +3%/level |
| **Whiplash** | Rolls in from behind | Float over it, or turn and answer it | From level 3, after 22 s of play | 35% chance every 4 s, +4%/level |

### Sinepede

- The basic enemy. Each segment is half a wave; segments alternate crest and trough.
- It comes from level 2 on: level 1 has none. Its clock only starts then, so the first one comes 1.75 s into level 2.
- Length: 1 segment at level 1, +0.25 per level (rounded down), up to 4: 1 segment on levels 2–4, 2 on levels 5–8, 3 on level 9. Wrong attacks can grow it to 8.
- Speed 90 u/s. Its clock runs at 40% while Wavell is not walking.
- **Heard before it is seen**: it is called 2 beats before it comes in, and its hum starts then, fading in. With the beat on, it is called 2 beats before a cue beat it may take, and it takes that beat. With the beat off, it comes in 1.6 s after it is called. On the levels where threats come one at a time, nothing else comes in while one is on its way.
- The right attack cancels the facing segment and sends a ripple on, and what is left of it is set back a little (knockback 150, about 30 u), so even a long one can be worn down. The wrong one throws it back (knockback 650) and adds a segment at the far end.
- **Running into it**: both bounce apart (his knockback 300) and he loses that ground. On his side it gains a segment. On the other side the waves cancel: it loses a segment, or flattens if it was the last, and he loses a size. A bubble always pops on it.
- **Sparkles:** every segment flattened, by the right attack or by running into it on the other side, leaves 2 sparkles there and then, one on each side of the line.

### Worm

- Speed 70 u/s. Its clock runs 1.6× faster while Wavell is under the line.
- A pull kills it from either side. A wipe makes it grow a size and pushes it back. Dots over it show how many pulls are left.
- If it reaches him underneath, it bites and leaves him dizzy. Walked over from on top, it hurts.

### Bubble Burst

- It appears on Wavell's side 65% of the time. Time to burst: 1.74 s at level 1, −0.045 s per level, down to 1.1 s.
- Its spray makes him dizzy. The wrong attack makes it swell and burst sooner. Walking into it pops it but still leaves him dizzy.
- **From level 6**, half of them float off the line partway and burst after 1.6 s in the air. Attacks along the line can't reach those, and a fed one is too heavy to fly. The spray pops his bubble, and leaves him dizzy if he is on the line under it.

### Disturchin

- It comes up 25–80 u further ahead of Wavell than he can walk in its warning, always to the right of him, even when he has turned round: never behind him, where the end of the line is.
- It starts as a fuzz on the line (warning 0.9 s at level 1, −0.02 s per level, down to 0.5 s), then bursts out in spikes for 1 s.
- The opposite-sides rule doesn't apply: **a pull always kills it and a wipe always feeds it.**
- Each wipe bounces it back (knockback 250), restarts its time with 0.5 s more, makes it bigger and takes one more pull. Dots show how many are left.
- **Walking into its spikes**, on either side of the line, hits him (he loses a size, or the game with none left) and throws him back out of them (knockback 300), the way he came.

### Line reflux

- Speed 175 u/s. It hits him on the line if he is on its side, or his bubble if it passes through it.

### Whiplash

- It used to be called the Backwave. That name survives in the difficulty settings' keys (`backSpeed`, `backLevel` and so on) and in `docs/original-events.txt`, the original game's events.
- It only comes from level 3 on, so the first two levels have none.
- Height 22 u, speed 180 u/s, growing 15% of its height per second.
- Only an attack facing it works; attacking the other way does nothing.
- A pull cancels it. A wipe throws it back off the left of the screen, carrying the end of the line back with it, all the way to the left of the screen even when that is more than the 240 u lead. The end then stays just off the left of the screen for 2 s, even if he walks back towards it, before it crumbles in again. The lead gauge fills up for that pause.

### Order on the line

- **Up to level 3**, threats come one at a time, with 1 s of clear line between them. From level 4 they overlap.
- Enemies on the line never overlap. Crawlers queue behind whatever is ahead; a Disturchin or Bubble Burst only appears where there is room. A thrown-back enemy stops at the next one or shoves it along. One on its way out (fading, sinking, melting, or a Disturchin pulling its spikes in) keeps its room until it has gone.
- The Whiplash and Reflux are waves in the line, so they pass through the others. A bubble in the air is off the line.

## The boss: THE SILENCER

Level 10 is the boss fight. On reaching it, every enemy on the line sinks, and THE SILENCER climbs out of the line ahead of Wavell (2.2 s), with the screen shaking hard (no title). No other threat comes while he is there.

- **He is a shape-shifter.** He is a stretch of the line on top of it, and he takes a different shape for each power. His outline flows from one shape to the next (0.35 s for most). His shapes and the steps of each power are in `src/data/boss.json`, edited in the lab (Edit boss); the times below are its current numbers.
- **Idle**, he is a wobbly blob that never holds its shape, with two eyes floating in it, staring at Wavell.
- **He walks on to the right**, about 150 u ahead and always in view (the knob says how far, but never past the edge of the view), at 60 u/s, faster (up to 170 u/s) when Wavell closes in. He waits at the edge of the view if Wavell stops. Walking into him hurts and throws Wavell back.
- **The end of the line** crumbles at a steady 60 u/s during the fight.
- **Only his own front wave, Tide-Al, hurts him**, sent back at him while he is in his place (not while he is rolling as a saw).
- **His sizes are his armour**: 3 hits flatten him. Each hit takes a size, throws him back, and he is safe for 1.1 s. The circles next to his name at the top show what is left. He is a little bigger for each size he has.

| Power | His shape | Telegraph | Answer |
| --- | --- | --- | --- |
| **Front wave: Tide-Al** | A breaking wave with a face: a long back slope, a curling lip dripping fingers of foam, angry eyes and a toothy mouth under the lip | From his blob he flows straight into the wave (1.5 s), glowing, with spray blowing off its crest, and holds it, rearing up, until a beat (at least 0.3 s). On that beat it leans over, its head forward and down (0.1 s), and comes down (0.1 s), landing as a dome over its crushed face. Its lean, crash and mound are the wave's own points moved, teeth and eyes included, so it flows from one to the next. A deep bass builds up all the while, heard from the moment the wave starts to rise: a sub and a driven, detuned bass rising a fifth, its filter opening, louder and throbbing faster (3 to 16 times a second), held until the crash. Landing, it crashes with a crash cymbal ringing out over 2 s, the slap of the water and a deep boom, and bursts into a splash along its front: 18 tall jets of water and about 90 drops thrown up, fanning out, that fall back and vanish into the line, while it sinks into a low mound (0.1 s) and flat (0.4 s) | **Wipe facing the wave** (its crest, or the line held up as it comes, +10): it rolls back at 260 u/s and hits him. Or pull it flat facing it (+10), or float over it (+6) |
| **Cat** | A chunky cat, rear at Wavell, shooting **three** line refluxes from its rear, the three moves **in a random order** each time | Once it has reached each pose, it charges: sparks are drawn into its rear and a ball of light swells there, more and faster as the charge fills. Low: crouches and meows, charges 0.4 s, shoots on the beat. High: rises with its rear up and meows, charges 0.4 s, shoots on the beat. Under: rolls on its back (0.3 s) and on over to under the line (0.55 s), like a barrel turning over round the line, its body never going flat; crouches there hanging upside down, meows, charges 0.4 s, shoots on the beat, and rolls back up the same way (0.3 s, then on into its next shape, or 0.6 s back to the blob). Its moves flow into each other without stopping | Low: along the **top** of the line at 14 u (half Wavell's smallest height): be under the line. High: along the top at 49 u (1.75 times his smallest height): it clears him on the line unless he is at full size (size 3, 53 u tall), and it pops his bubble if it meets it. Under: along the **bottom** at 14 u: be on top. +6 for each that passes |
| **Saw** | A sawblade through the line, both sides (the line doesn't show inside it) | Spins up for 1 s, then rolls at Wavell on the next beat, at 150 u/s | **Float over it** (+6). It cuts Wavell anywhere on the line, on either side, and pops a bubble that is too low. It flattens out 40 u before the end of the line, and he grows back out of the line in his place (0.8 s) |
| **Toad** | A squat toad, which sinks until only its eyes show | Croaks and squats (0.6 s), sinks (0.6 s) | For 3.5 s, a Bubble Burst blisters up every 0.45 s, anywhere in view on top of the line but never within 18 u of Wavell. Each sits on the line for a beat, then floats off and bursts in the air 1.6 s later. Keep clear: walking into one, or its spray, leaves him dizzy, and the spray pops his bubble. Under the line, the spray can't reach him |

- **Front wave**: 30 u high, 120 u/s towards Wavell, its crest on top of the line, spilling water as it rolls: about 40 a second of the crash's jets and drops, thrown off its crest forward and down the way it goes (bottom left as it comes in), at about 1.6 times its speed so they run out ahead of the crest, sized to its height and gone within 0.5 s, with spray blowing off it. It hits him on the line from either side.
- **Saw**: 16 u radius, plus 8% for each size he has left, with 12 teeth.
- **His size**: every shape is drawn 8% bigger for each size he has left.
- **Phases**: each hit makes him angrier.

| Phase | Sizes left | Powers | Front wave after | Rest between powers |
| --- | --- | --- | --- | --- |
| 1 | 3 | Front wave, cat, saw | every 2 other powers | 2.4 s |
| 2 | 2 | (same) | every 3 other powers | 1.95 s |
| 3 | 1 | + Toad; 30% chance of a power straight after another | every 4 other powers | 1.5 s |

- **His choices**: he never uses the same power twice in a row. He never opens with the front wave (the one that can be sent back at him): he opens with 2 other powers, picked from all of them (cat, saw, or the toad, even though it otherwise only comes in phase 3), and only then sends the front wave. After it come exactly as many other powers as his phase says (2, 3, then 4: he gets harder to hurt as he shrinks), then the front wave again. The others are picked by weight (cat 4, saw 4, toad 4), from the phase each comes in.
- **Powers on the beat**: he picks a power on a beat, and Tide-Al's lean, the shot and the saw's roll land on the beat.
- **Sparkles** keep coming during the fight, at most 3 at a time. Each hit leaves 2 by him.

### Beating him

- He melts flat into the line (1.4 s), and one huge hump rolls away to the right, with 250 base points. No text shows.
- After 3.5 s of quiet line, the levels start over at level 1 on the next loop, with a screen shake and no banner: THE LINE CONTINUES is written in the title's hand by the nearest of the two lines behind the game, going by from right to left at 40 u/s (its letters about 20 u high). The letters are that line itself, as faint as the rest of it. The score carries on, and levels go by what is scored since the loop started.
- **Each loop counts 2 levels harder** for every ramp (crumble speed, spawn rates, tempo and so on): loop 2's level 1 plays like level 3. The level gates (Whiplashes, threats overlapping, two enemies a bar, floating bubbles) use the same harder level.
- The music keeps going with all five layers: from the second loop on, every level plays them all.
- **The time signature changes at random**: each new loop picks another one of the six (2/4, 3/4, 4/4, 5/4, 6/8, 7/8), different from the one playing, from the next bar. The audio menu can still change it. A new game starts in the one picked in the audio menu.
- The HUD shows the loop: LOOP 2 · LEVEL 1.

## Sparkles and power-ups

Sparkles are the bait: chasing them gives ground to the line. The power-ups are the Rage knot and the Killerwave, an enemy you can ride.

- Every enemy killed leaves 2 sparkles, one on each side of the line. A Sinepede leaves 2 for each segment flattened, as it goes.
- More appear on their own about every 3 s, at most 6 at a time, as many below the line as above, often behind Wavell.
- They drift at random and blink out after a few seconds.
- 12% are **gold**. Gold ones sit 45–65 u off the line, where only his bubble reaches, and are worth 5×. Normal ones sit 6–40 u off.
- Each sparkle counts towards his next size (10 per size).
- Catching them in a chain within 2.2 s of each other scores 1, 2, 3… up to 8 points each (see [Scoring](#scoring-and-levels)).

### Rage

A small scribble of loops tangled into the line (24 u long, up to 15 u off it on each side). It throbs fast and keeps changing shape and colour. It is the original game's Nuke, used the moment it is picked.

- **When:** at most one a level, from level 4 on, 10 s into the level; never during the boss fight. A level passed in under 10 s has none. It sits 100–160 u ahead of Wavell, swells from a small tangle to full size in 0.3 s, and stays 12 s, blinking for the last 2 s. The end of the line eats it if it gets there first.
- **Picking it:** walk into it from either side of the line, or touch it with the bubble. The bubble then heads straight back to the line (160 u/s) and lands whatever the keys say; he ties back in and takes the knot once he is standing. Nothing can hurt him on the way down, the bubble's time stands still, and the knot waits for him.
- **Untying it:** sparks of every colour burst out of it, and his outline takes on its changing colours until the last wave is gone. For 0.55 s he tugs the loops apart, shaking, as they pull out into his hands. From then until the last wave is gone, Wavell holds still on a flat stretch of line, nothing can hurt him,. The end of the line stops while he unties it.
- **Making the waves:** he shouts YEEEEH! and the screen shakes; no word comes up. His eyes go red and look up. He crouches and grabs the line with both hands, 13 u out on each side (0.2 s), and heaves it up over his head (to 0.45 s). The line in his hands follows them, down to rest 17 u further out, while the stretch under his feet stays flat. Then he beats it down and up, one stroke every 0.36 s. A huge wave (50 u tall) goes out each way at the end of each stroke: a crest with his arms up, a trough with them down, a crest again: three each way, at 130 u/s. Then he lowers the line back to rest over 0.6 s.
- **Clearing:** the waves end every creature they pass, and once they reach the edge of the screen, everything beyond it on that side. That covers Sinepedes, Worms, Disturchins, Bubble Bursts (in the air too), Whiplashes, Line refluxes and spray. Each creature cleared scores 5 and leaves its 2 sparkles. A Sinepede still on its way in is called off.
- **The line:** the waves going left carry the end of the line back off the screen, and it then stops for 2 s, as after a wiped Whiplash. The lead gauge fills.
- **After it:** no new enemy comes until all the waves are gone.

### Killerwave

An orca made of the line (a killer whale: a killer wave). It is an enemy, and a power-up for whoever rides it.

- **When:** from level 5, one every 35 s, never during the boss fight or Rage. It needs Wavell on the line with at least 220 u of line behind him. It comes up as far back as that line allows (its head up to 140 u behind him, its tail at least 15 u clear of the end), and the end of the line waits until it charges.
- **Coming up:** first only its fin cuts up out of the line, growing from a low bulge to the full fin over 1 s on an otherwise flat line, and comes after him at 1.15× his walking speed (his speed at his size), so he can't outwalk it. Its head never comes closer than 8 u behind him while only the fin shows. Once its head is as far behind him as it goes in a third of its rise (about 50 u), or after 2 s of chasing, the rest of it comes up (1.2 s) and it opens its jaws (0.5 s), keeping its pace all the while: it does not slow down for him, and once it is nearly all out it clears every creature along its body. Then it charges off to the right at 240 u/s, faster than he walks or floats.
- **On the line, he is hit:** if it reaches him, or he walks into it, while he is on the line (either side), it hits him once (while only the fin is out, only the fin hits), like any enemy: he loses a size, or it is game over at no size.
- **Up in the bubble, it goes by:** under the bubble it does nothing to him. It clears every creature along its body as it goes, as Rage does (5 points each, and their sparkles), and leaves at the right of the screen.
- **Ridden:** if his bubble comes down on the back of its fin (touching the fin, no further forward than its tip), he grabs the tip and rides it. If it was still coming up, it carries on coming up at its own pace with him on it. He hangs from it by one hand, his body streaming out behind like a flag. He shouts YEE-HAA!, and it races to the right at 340 u/s for 4 s, clearing every creature along its body. Meanwhile the controls do nothing and nothing can hurt him. Then it slows down (0.6 s) and sinks back into the line (1.1 s). As it goes down he hangs straight, and once his feet reach the line he lets go, standing, and the controls are his again.
- Attacks do nothing to it.

## Scoring and levels

Every score is multiplied by 1 + half Wavell's size: ×1 at no size, ×1.5, ×2, up to ×2.5 at full size (rounded to whole points). A hit lowers the multiplier along with the size. The multiplier shows left of the score. Levels go by the score, so staying big brings the levels on faster.

| Event | Base points |
| --- | --- |
| Sinepede segment cancelled | 4 |
| Worm killed | 5 + 3 per size it grew |
| Disturchin killed | 4 + 3 per size it grew |
| Bubble Burst popped | 3 |
| Whiplash pulled flat | 10 |
| Whiplash wiped back | 10 |
| Whiplash floated over | 6 |
| Line reflux passed safely | 6 |
| Boss's front wave floated over | 6 |
| Boss's front wave pulled flat, or sent back | 10 |
| Boss's saw floated over | 6 |
| Boss hit | 50 |
| Boss flattened | 250 |
| Sparkle | Chain position (1–8), ×5 if gold |
| Creature cleared by Rage | 5 |
| Creature cleared by the Killerwave | 5 |

### Levels

- There are 10 levels. Each level costs 50 points more than the one before: level 2 starts at 50 points, level 3 at 150, level 4 at 300, level 5 at 500, level 6 at 750, level 7 at 1050, level 8 at 1400, level 9 at 1800 and level 10 at 2250. On later loops these count from the score the loop started at.
- A level-up shakes the screen and plays the level sound. There is no banner: the nearest of the two lines behind the game writes LEVEL 2, LEVEL 3 and so on (at level 10, the boss fight: THE SILENCER) in the title's hand, going by from right to left at 40 u/s, the same way as THE LINE CONTINUES after the boss. A new word replaces one still going by.
- Level 10 is the last: the boss fight (see [The boss](#the-boss-the-silencer)). Beating him starts the levels over on the next loop, 2 levels harder.
- The best score is saved in the browser.

### What changes with the level

Anything that gets harder is a ramp: a value at level 1, a change per level and a limit. The steps are small enough that level 9, the last before the boss, is still fair; most limits are only reached in later loops.

| Ramp | Level 1 | Per level | Limit |
| --- | --- | --- | --- |
| End of the line speed | 40 u/s | +3 | 80 u/s |
| Tempo | 75 BPM | +2 | 120 BPM |
| Sinepede segments | 1 | +0.25 | 4 |
| Disturchin warning | 0.9 s | −0.02 | 0.5 s |
| Bubble Burst time to burst | 1.74 s | −0.045 | 1.1 s |
| Whiplash chance per roll | 35% | +4% | 100% |
| Reflux chance per roll | 29% | +3% | 100% |
| Music layers (one instrument per level; all 5 from loop 2 on) | 1 | +1 | 5 |

Spawn intervals are in the [Enemies](#enemies-and-hazards) table. Other level gates: Sinepedes come from level 2, Whiplashes from level 3, threats overlap from level 4, enemies come on two beats per bar from level 6, and Bubble Bursts float off from level 6.

## Music, beat and sound

The game has no recorded soundtrack. Web Audio synthesizes every note as the game plays, so the music follows any tempo and time signature exactly.

### The beat

- The beat is on by default (first knob of the Beat group in the difficulty editor).
- The whole world runs at BPM / 75, so everything stays the same length in beats. At 75 BPM the walk cycle is exactly half a beat.
- The tempo starts at 75 BPM, rises 2 BPM per level up to 120, and only changes at the start of a bar. After the boss, each loop switches to another time signature at random.
- The beat is counted in simulation steps (96 steps of 1/120 s per beat), never on a clock, so replays are exact.
- The line lights up on each beat, brighter on the first beat of a bar, so the beat can be seen with the sound off.
- **Enemies come in on the beat**: on the last beat of the bar, and from level 6 also on the beat half a bar before it. That is never more than two per bar. Kinds take turns: the one furthest past its due time goes next. A Sinepede is called 2 beats ahead of its cue beat, so its hum is heard first.
- **Enemy actions wait for the beat**: a Disturchin's spikes, a Whiplash or Reflux setting off, a Bubble Burst letting go or bursting. Warnings and fuses last whole beats.
- **Time signature** (2/4, 3/4, 4/4, 5/4, 6/8 or 7/8, from the audio menu) sets the beats per bar. A change waits for the next bar.

### Music styles

| Style | Sound | Swing |
| --- | --- | --- |
| Vibe | Swung lo-fi, electric piano | 0.22 |
| Chill | Pads and bells | none |
| Trip | Trip-hop: heavy lazy beat, vinyl crackle, Rhodes, strings, sliding theremin-like lead, over B Em7 A B | 0.3 |
| Lotus | Temple woods alone at level 1, then a koto arpeggio, then shakuhachi-like flutes, then a soft drone, then taiko and koto sweeps; in the yo scale (A B D E F♯) | none |
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

- **The Silencer:** a low tremble as he rises and as he rears up, a deep bass building up as his wave rears and a crash cymbal, a slap of water and a boom when it crashes, a meow for the cat (a buzzy tone through a vowel-like filter), a whine that spins up for the saw, a low three-rasp croak for the toad, a tone rising away when his wave is sent back at him, and a big falling groan when it hits.
- **Sinepede:** pure sine tones whatever the style. It announces itself with one note per segment, high for a crest, low for a trough. Each cancelled segment plays its own note. The nearest one also hums: a sine at 220 Hz for one segment and 110 Hz more for each segment after it (330 Hz for 2, 440 Hz for 3), slightly saturated and with a little reverb. The hum starts 2 beats before a Sinepede comes in and gets louder as it closes in.
- **Disturchin:** a low tremble under the fuzz, then a harsh, clipped sound while its spikes are out.
- **Wavell:** a bright run of notes when he grows, a falling one when he shrinks, and recorded shouts: YEEEEH! when he strikes the Rage pose (`yeah.mp3`) and YEE-HAW! when he mounts the Killerwave (`yeehaa.mp3`).
- **Killerwave:** an orca's whistle as it starts to come up, a quick rise then a long, shivering fall with a few clicks under it, and the same call higher as it charges.
- **Samples** from the original 2003 game cover the rest: appearing, vanishing, flipping down and up, hits, kills, being eaten, Reflux, bubble pop, level pass, the Whiplash bonus and the Rage knot appearing (the original's bonus sound).

### Audio menu

- The speaker button at the top right opens it: sound on or off, music style, time signature.
- The game pauses while it is open, and the music keeps playing so a choice can be heard at once.
- M mutes in one press. Audio choices are saved in the browser.

### Start screen

- The start screen plays the chosen style, all five instruments, once the title has formed and Wavell has risen out of the line. Browsers only allow sound after the first tap or key, so on a first visit it starts then.
- It keeps the game's own beat clock, so it keeps playing through the audio menu without going back to the first bar.
- Under the menu, hints take turns, 5 s each, fading in and out. They start from the first once Wavell has climbed out of the line, and start over each time the start screen comes back. The "↑ ↓ choose, Enter select" prompt is gone: how to use the menu is under Menu, in the controls.
- Picking START doesn't restart it: the same beat and bar carry on, and the music thins to level 1's one instrument while the other four fade away over a second or two. Each level then adds one back.

## Visuals and screens

Everything is drawn as glowing vector strokes at the screen's native resolution. Nothing is a sprite.

- **Resolution and frame rate.** The canvas uses up to 2 pixels per CSS pixel, and at most about 4.1 million pixels in all (roughly 2560 x 1600). On a big tablet that lowers it, but never below 1 per CSS pixel. When more than 15% of the frames come over 1.5 times late in two 60-frame windows in a row, the game makes drawing lighter, one step at a time. The refresh rate it measures against is the shortest 20% of the last 120 gaps between refreshes, not the single shortest one, so a stray early frame can't make every frame look late. On a screen of 100 Hz or more it first draws on every other refresh, so 120 Hz runs at an even 60. After that, each step cuts the resolution by 20%, down to half. It goes below 1 pixel per CSS pixel only on a screen tall enough to keep at least 720 canvas pixels (a TV or a big monitor, where the browser's stretching hardly shows), so a phone stops at 1 per CSS pixel. The last step is lite mode: text and the title lose their blurred shadows (text gets a wide faint stroke instead), the title loses the haze behind it, every line loses its widest, faintest halo, and lines out of focus behind the menu take 3 strokes instead of 6. A device far too slow, with more than half its frames slower than 1/16 s in a window, goes straight to the lowest resolution and lite mode in one step. A window is 60 frames or 1.5 s, whichever comes first, after 30 frames or 0.5 s of settling, so a slow TV gets there within about 2 s. Only a gap of over 1 s counts as a pause rather than slowness. It never steps back up while the page is open. A steady throttle, such as a battery saver's 30 fps, doesn't count as slow. Faded-out lines aren't drawn at all, and the sky and the haze along the line are drawn once and reused.
- **Slow frames.** The game catches up on up to 0.1 s per frame, so it keeps real time down to 10 fps; below that it slows down. Beats are scheduled 30 ms ahead on the audio clock, or a little more than the longest recent frame (up to 0.25 s) on a slow device, so the music keeps time when frames come late.
- **Testing performance.** Add `?perf` to the address to see the frame rate, what was chosen, whether the browser is taken for a TV, and the last key pressed (its keyCode and name). `?lite` starts at the lowest resolution in lite mode. `?cpu` draws without the GPU, as a TV's browser may, for finding what costs the most on a computer.

- **One stroke.** Wavell leaves the line at his back toe, loops through his arms and head, and returns at his front toe. Creatures are spliced into the same stroke. Nothing crosses his face.
- **Appearing.** He climbs out of the line hands first, then head, then a press-up and his legs. On first load the line stays flat for 0.8 s and he rises slowly over 3 s; after that, appearing takes 1 s.
- **Dying.** Killed by an enemy, he sinks back into the line looking up (0.6 s) until one raised hand is the last of him. Burnt by the end of the line, the break runs along his outline from foot to foot (1.25 s) and drifts away in sparks.
- **Enemy deaths.** A killed creature melts into a hump that rolls on with the wave that hit it. A Sinepede leaves a ripple as each segment dies.
- **Screens.** The title is one unbroken stroke. Starting a game breaks it apart. At game over, FLATLINED appears and turns back into the title.
- **HUD.** Top left: size circles, with the lead gauge under them. Score with its multiplier to the left. Points pop up where they are earned. Each new level is written along the line behind (see above), not shown as a banner. During the boss fight, THE SILENCER and a circle for each size he has left sit under the level.
- **Nostalgia mode** (N or the checkerboard icon) gives a low-resolution look and is saved in the browser.

## Platform and saving

The game runs in the browser at <https://skepticowl.github.io/the-line/> and installs as an app (PWA), which also lets it play offline.

- **Saved in the browser:** best score, key bindings, audio choices (mute, style, time signature) and Nostalgia mode. Nothing is saved online.
- **Phones:** best held sideways. Held upright, the play area is the same and the view grows taller around it: more sky and two more far lines above and below, the HUD at the top of the screen, the thumb controls at the bottom; nothing changes in play. The screen is not locked sideways, in fullscreen or in the installed app. The corners icon goes fullscreen, except on iPhone. Install from the start screen's install button; on iPhone, from the Share menu.
- **Old address:** the game used to live at matamadio.github.io/the-line/. That address now forwards here (with the same query, so the TV apps still open in TV mode), and retires the old offline copy of an app installed from it. Best scores and settings saved there stay there: they are kept per address.
- **Own id:** the game lives under skepticowl.github.io, where other apps may join it, so the manifest has its own explicit id (`/the-line/`).
- **Loading screen:** black until the game is ready. When there is loading to cover (always in the installed app; in a browser tab only if the game is not up within 0.5 s) the owl picture (`public/loading.webp`) fades in from black over 1.6 s and calls (the owl recording, `public/assets/sounds/owl.mp3`, not when muted), stays 0.2 s, then fades into the game over 1.6 s. If the browser holds the sound back, he calls at the first tap or key while still showing. The game waits for the font (at most 3 s), and the title and menu animations start only once the screen has fully faded. The picture is in the offline cache.
- **Sound** starts at once where the browser allows it (as the installed app often does), so the title music needs no tap; otherwise it starts after the first tap or key press.

## Where the rules live

| To change | File | Edited with |
| --- | --- | --- |
| Difficulty: speeds, spawn rates, ramps, scoring, sizes, beat | `src/data/difficulty.json` (defaults in `difficulty.ts`) | Difficulty editor, `npm run difficulty` |
| Feel: walk, flip, float, wave, death and melt timings, and the look of Tide-Al's wave | `src/data/tune.ts` | Animation lab sliders, `npm run lab` (copy values back by hand) |
| Animation keyframes | `src/data/anim.json` | Keyframe editor in the lab |
| Rules and point values | `src/game/game.ts` | Code |
| The boss's shape, powers and phases | `src/game/actors/flattener.ts` (his numbers in `difficulty.json`, Boss group) | Code, difficulty editor |
| Beat and cue beats | `src/game/beat.ts` | Code |
| Music styles | `src/core/styles.ts`, `src/core/music.ts` | Code |
| Sound effects | `src/core/sfx.ts` | Code |
| Design intent | [`docs/DESIGN.md`](DESIGN.md) | Text |

**Open question:** Wavell has one life and size as armour. The design notes call this a trial that may prove too hard.
