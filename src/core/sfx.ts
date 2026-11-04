// The original samples through Web Audio, plus the in-game music. Browsers only
// allow sound after a tap or key press, so everything starts in unlock().

const SAMPLES = {
  appear: 'compare', vanish: 'sparisce', drag: 'colpisce', kill: 'snawave_sparisce',
  flipDown: 'rovescia_in_giu', flipUp: 'rovescia_in_su', offline: 'offline', eaten: 'eated',
  snawave: 'snawave', level: 'levelpass', reflux: 'reflux', pop: 'bollapop', bonus: 'linesaver',
} as const;
export type Sample = keyof typeof SAMPLES;

/** Beats are scheduled this far ahead (s), so a late frame can't make the click stumble. */
const BEAT_AHEAD = 0.03;
/** Further than this (s) from where the next beat was due, the click gives up and catches up. */
const BEAT_SLACK = 0.06;

class Sfx {
  private ctx: AudioContext | null = null;
  private buffers = new Map<Sample, AudioBuffer>();
  private musicEl: HTMLAudioElement | null = null;
  private musicAllowed = true;
  private nextBeat = 0;
  muted = false;

  unlock() {
    if (this.ctx) { void this.ctx.resume(); return; }
    this.ctx = new AudioContext();
    for (const [key, file] of Object.entries(SAMPLES) as [Sample, string][]) {
      fetch(`assets/sounds/${file}.wav`)
        .then((r) => r.arrayBuffer())
        .then((b) => this.ctx!.decodeAudioData(b))
        .then((buf) => this.buffers.set(key, buf))
        .catch(() => {});
    }
    this.musicEl = new Audio('assets/music/varecchina.mp3');
    this.musicEl.loop = true;
    this.musicEl.volume = 0.45;
    this.musicEl.muted = this.muted || !this.musicAllowed;
    void this.musicEl.play().catch(() => {});
  }

  play(name: Sample, volume = 1) {
    const ctx = this.ctx, buf = this.buffers.get(name);
    if (!ctx || !buf || this.muted) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(ctx.destination);
    src.start();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.musicEl) this.musicEl.muted = this.muted || !this.musicAllowed;
  }

  /** The MP3 has its own tempo, so it stays quiet while the beat is on. */
  setMusicAllowed(on: boolean) {
    if (on === this.musicAllowed) return;
    this.musicAllowed = on;
    if (this.musicEl) this.musicEl.muted = this.muted || !on;
  }

  /**
   * The metronome click. Frames arrive unevenly, so each click is placed exactly one
   * beat after the last on the audio clock, as long as the game is roughly there too.
   */
  beat(seconds: number, accent: boolean) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const soon = ctx.currentTime + BEAT_AHEAD;
    const at = Math.abs(this.nextBeat - soon) < BEAT_SLACK ? this.nextBeat : soon;
    this.nextBeat = at + seconds;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.frequency.value = accent ? 1760 : 1175;
    g.gain.setValueAtTime(accent ? 0.4 : 0.25, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    osc.connect(g).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.06);
  }
}

export const sfx = new Sfx();
