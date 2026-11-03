// The original samples through Web Audio, plus the in-game music. Browsers only
// allow sound after a tap or key press, so everything starts in unlock().

const SAMPLES = {
  appear: 'compare', vanish: 'sparisce', drag: 'colpisce', kill: 'snawave_sparisce',
  flipDown: 'rovescia_in_giu', flipUp: 'rovescia_in_su', offline: 'offline', eaten: 'eated',
  snawave: 'snawave', level: 'levelpass', reflux: 'reflux', pop: 'bollapop', bonus: 'linesaver',
} as const;
export type Sample = keyof typeof SAMPLES;

class Sfx {
  private ctx: AudioContext | null = null;
  private buffers = new Map<Sample, AudioBuffer>();
  private musicEl: HTMLAudioElement | null = null;
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
    this.musicEl.muted = this.muted;
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
    if (this.musicEl) this.musicEl.muted = this.muted;
  }
}

export const sfx = new Sfx();
