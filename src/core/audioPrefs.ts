// What the player chose in the audio menu. It stays as it was left, from one visit to the next.

const STORE = 'the-line-audio';

export interface AudioPrefs {
  muted: boolean;
  /** A style's id (see styles.ts) and a time signature's (see METERS in music.ts). */
  style: string;
  meter: string;
}

function load(): AudioPrefs {
  const prefs: AudioPrefs = { muted: false, style: 'vibe', meter: '4/4' };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Partial<AudioPrefs>;
    if (typeof saved.muted === 'boolean') prefs.muted = saved.muted;
    if (typeof saved.style === 'string') prefs.style = saved.style;
    if (typeof saved.meter === 'string') prefs.meter = saved.meter;
  } catch { /* storage blocked, or nothing saved */ }
  return prefs;
}

export const audioPrefs = load();

export function saveAudioPrefs() {
  try { localStorage.setItem(STORE, JSON.stringify(audioPrefs)); } catch { /* storage blocked */ }
}
