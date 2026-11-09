// The font of nostalgia mode: capitals three pixels wide and five high, which stay sharp
// at a resolution that turns any drawn font to mush. Lowercase is shown as capitals.

/** Each glyph's five rows, top to bottom, as a digit whose bits are the row's pixels. */
const GLYPHS: Record<string, string> = {
  A: '25755', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644', G: '34553', H: '55755', I: '72227',
  J: '11152', K: '55655', L: '44447', M: '57755', N: '65555', O: '25552', P: '65644', Q: '25563', R: '65655',
  S: '34216', T: '72222', U: '55557', V: '55552', W: '55775', X: '55255', Y: '55222', Z: '71247',
  0: '75557', 1: '26227', 2: '61247', 3: '61216', 4: '55711', 5: '74616', 6: '34652', 7: '71222', 8: '25252', 9: '25316',
  '.': '00002', ',': '00024', ':': '02020', ';': '02024', '!': '22202', '?': '61202', '-': '00700', '+': '02720', '=': '07070',
  '/': '11244', "'": '22000', '(': '12221', ')': '42224', '<': '12421', '>': '42124', '%': '51245', '*': '05250', '×': '05250',
  '·': '00200', '…': '00005', '←': '12721', '→': '42724', '↑': '27222', '↓': '22272', '↔': '25752', '↕': '27072',
};

export const GLYPH_H = 5;
/** Pixels from the start of a character to the start of the next, and for a space. */
const ADVANCE = 4, SPACE = 3;

/** Whether the font can show this character. */
export const hasGlyph = (ch: string) => ch === ' ' || ch.toUpperCase() in GLYPHS;

/** How wide a string is, in pixels, without its last gap. */
export function pixelTextWidth(s: string) {
  let w = 0;
  for (const ch of s) w += ch === ' ' ? SPACE : ADVANCE;
  return Math.max(0, w - 1);
}

/** Adds a string's pixels to a path, each one `scale` wide, with its top left corner at (x, y). */
export function pixelText(path: Path2D, s: string, x: number, y: number, scale: number) {
  for (const ch of s) {
    const rows = GLYPHS[ch.toUpperCase()];
    if (rows) {
      for (let r = 0; r < GLYPH_H; r++) {
        const bits = Number(rows[r]);
        for (let c = 0; c < 3; c++) if (bits & (4 >> c)) path.rect(x + c * scale, y + r * scale, scale, scale);
      }
    }
    x += (ch === ' ' ? SPACE : ADVANCE) * scale;
  }
}
