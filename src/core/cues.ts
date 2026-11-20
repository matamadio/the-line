// Timings of sounds that the game has to know, kept apart from sfx.ts so the tests (which
// stand in for sfx) still see them.

/** The recorded whiplash (whiplash.mp3) is played slower than recorded, so it is lower: 0.8 is about 4 semitones down. */
export const WHIP_RATE = 0.8;
/** How far into it, as played, its crack comes (s; 0.39 s into the recording): it starts this long before a Whiplash sets off. */
export const WHIP_CRACK_AT = 0.39 / WHIP_RATE;
