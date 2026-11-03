// Keyframed animation data: Wavell's skeleton poses and clips, the Snawave's
// outline, and the enemies' motions (rise, bite, sink) as keyed numbers. The numbers live in anim.json, which the animation lab (lab.html) edits
// and saves; the game reads them live from ANIM, so edits show without a reload.
//
// Poses face right with y up, in original pixels, origin between the feet on the
// line. A key's pose is either the name of a shared pose in `poses`, an inline pose,
// or "@from": whatever pose he was in when the clip started.

import data from './anim.json';

export const JOINTS = ['toeB', 'footB', 'kneeB', 'hip', 'kneeF', 'footF', 'toeF',
  'neck', 'elbowB', 'handB', 'elbowF', 'handF', 'head'] as const;
export type Joint = (typeof JOINTS)[number];
export const I = Object.fromEntries(JOINTS.map((j, i) => [j, i * 2])) as Record<Joint, number>;
export const TILT = JOINTS.length * 2;
export const SIZE = TILT + 1;
export type Pose = Float32Array;

/** A pose as stored: every joint's [x, y], and the head's tilt in radians. */
export type PoseData = Record<Joint, [number, number]> & { tilt: number };
/**
 * How a key is reached from the key before it. "spline" passes smoothly through the
 * keys around it (for cycles), "hold" jumps at the key.
 */
export type Ease = 'smooth' | 'linear' | 'in' | 'out' | 'spline' | 'hold';
export interface Key { t: number; pose: string | PoseData; ease?: Ease }
export interface Clip {
  keys: Key[];
  /** Cycles (walking): time wraps at `length`, and the last key leads back to the first. */
  loop?: boolean;
  /** Seconds; defaults to the last key's time. */
  length?: number;
  /** Knees follow the hips and feet with fixed-length legs instead of their keyed places. */
  ik?: boolean;
  /** Named moments the game listens for (when he lets go, when a foot lands...). */
  marks?: Record<string, number>;
}
/**
 * A motion key: values for the creature's channels (g: height or depth, lean,
 * mouth, lunge...). `eases` overrides the key's ease for single channels.
 * `chatter` (per second) makes the mouth snap open and shut on the way to this key.
 */
export interface MotionKey { t: number; v: Record<string, number>; ease?: Ease; eases?: Record<string, Ease>; chatter?: number }
export interface Motion { keys: MotionKey[]; marks?: Record<string, number> }
export interface AnimData {
  poses: Record<string, PoseData>;
  clips: Record<string, Clip>;
  shapes: Record<string, number[]>;
  motions: Record<string, Motion>;
}

/** The live data: the lab edits it in place. */
export const ANIM = data as unknown as AnimData;

if (import.meta.hot) {
  // Saving from the lab rewrites anim.json: take the new numbers without reloading.
  import.meta.hot.accept('./anim.json', (m) => {
    if (!m) return;
    const next = (m as unknown as { default: AnimData }).default;
    Object.assign(ANIM.poses, next.poses);
    Object.assign(ANIM.clips, next.clips);
    Object.assign(ANIM.shapes, next.shapes);
    Object.assign(ANIM.motions, next.motions);
  });
}

export function toPose(d: PoseData, out: Pose = new Float32Array(SIZE)): Pose {
  for (const j of JOINTS) { out[I[j]] = d[j][0]; out[I[j] + 1] = d[j][1]; }
  out[TILT] = d.tilt;
  return out;
}

export function fromPose(p: Pose): PoseData {
  const o = { tilt: round(p[TILT], 1000) } as PoseData;
  for (const j of JOINTS) o[j] = [round(p[I[j]], 100), round(p[I[j] + 1], 100)];
  return o;
}

const round = (v: number, k: number) => Math.round(v * k) / k;

export function namedPose(name: string, out?: Pose): Pose { return toPose(ANIM.poses[name], out); }

export function mix(a: Pose, b: Pose, t: number, out: Pose = new Float32Array(SIZE)): Pose {
  for (let i = 0; i < SIZE; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

export const clipLength = (c: { keys: { t: number }[]; length?: number }) => c.length ?? c.keys[c.keys.length - 1].t;

/** The pose data a key stands for (null for "@from"). */
export function keyPose(k: Key): PoseData | null {
  if (typeof k.pose !== 'string') return k.pose;
  return k.pose === '@from' ? null : ANIM.poses[k.pose];
}

const easeFn: Record<Ease, (u: number) => number> = {
  smooth: (u) => u * u * (3 - 2 * u),
  linear: (u) => u,
  in: (u) => u * u,
  out: (u) => 1 - (1 - u) * (1 - u),
  spline: (u) => u,
  hold: () => 0,
};

const tmp = [new Float32Array(SIZE), new Float32Array(SIZE), new Float32Array(SIZE), new Float32Array(SIZE)];

/** The clip's pose at time t (seconds), into out. `from` is the pose "@from" keys stand for. */
export function sample(c: Clip, t: number, out: Pose, from?: Pose): Pose {
  const keys = c.keys, n = keys.length, len = clipLength(c);
  const get = (i: number, o: Pose): Pose => {
    const d = keyPose(keys[((i % n) + n) % n]);
    if (d) return toPose(d, o);
    if (from) o.set(from); else namedPose('idle', o);
    return o;
  };
  if (c.loop) t = ((t % len) + len) % len;
  else t = Math.max(0, Math.min(len, t));
  // The segment that holds t: keys[i] .. keys[i + 1] (wrapping for loops).
  let i = -1;
  while (i + 1 < n && keys[i + 1].t <= t) i++;
  if (i < 0) {
    if (!c.loop) return get(0, out);
    i = n - 1;
  }
  const j = i + 1;
  if (j >= n && !c.loop) return get(n - 1, out);
  const t0 = keys[i].t, t1 = j < n ? keys[j].t : keys[0].t + len;
  const tt = t < t0 ? t + len : t;
  const u = t1 > t0 ? (tt - t0) / (t1 - t0) : 1;
  const ease = keys[j % n].ease ?? 'smooth';
  if (ease === 'spline') {
    // Catmull-Rom through the keys around the segment.
    const p0 = get(i - 1, tmp[0]), p1 = get(i, tmp[1]), p2 = get(j, tmp[2]), p3 = get(j + 1, tmp[3]);
    const u2 = u * u, u3 = u2 * u;
    for (let k = 0; k < SIZE; k++) {
      out[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
    }
    return out;
  }
  return mix(get(i, tmp[1]), get(j, tmp[2]), easeFn[ease](u), out);
}

export const LEG = 4.8;
/** Two-bone IK: put the knee where a leg of two LEG-long bones from hip to foot bends forward. */
export function ik(p: Pose, hip: number, foot: number, knee: number) {
  const hx = p[hip], hy = p[hip + 1];
  let dx = p[foot] - hx, dy = p[foot + 1] - hy;
  let d = Math.hypot(dx, dy);
  if (d > LEG * 2 - 0.01) { const k = (LEG * 2 - 0.01) / d; dx *= k; dy *= k; d = LEG * 2 - 0.01; }
  const h = Math.sqrt(Math.max(0, LEG * LEG - (d / 2) * (d / 2)));
  let px = -dy / d, py = dx / d;
  if (px < 0) { px = -px; py = -py; }
  p[knee] = hx + dx / 2 + px * h;
  p[knee + 1] = hy + dy / 2 + py * h;
}

/** A clip's pose with its rules applied (IK knees). */
export function pose(clip: string, t: number, out: Pose, from?: Pose): Pose {
  const c = ANIM.clips[clip];
  sample(c, t, out, from);
  if (c.ik) { ik(out, I.hip, I.footF, I.kneeF); ik(out, I.hip, I.footB, I.kneeB); }
  return out;
}

export const mark = (clip: string, name: string) => ANIM.clips[clip].marks?.[name] ?? 0;

/** A motion's channel values at time t (seconds, clamped to the motion), into out. */
export function motion(name: string, t: number, out: Record<string, number> = {}): Record<string, number> {
  const keys = ANIM.motions[name].keys, n = keys.length;
  t = Math.max(0, Math.min(keys[n - 1].t, t));
  let i = 0;
  while (i + 1 < n && keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[Math.min(i + 1, n - 1)];
  const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
  for (const ch of Object.keys(a.v)) {
    const e = b.eases?.[ch] ?? b.ease ?? 'smooth';
    out[ch] = a.v[ch] + ((b.v[ch] ?? a.v[ch]) - a.v[ch]) * easeFn[e === 'spline' ? 'smooth' : e](u);
  }
  if (b.chatter && b !== a && 'mouth' in out) out.mouth *= Math.abs(Math.sin(t * b.chatter));
  return out;
}

export const motionLength = (name: string) => clipLength(ANIM.motions[name]);
export const motionMark = (name: string, m: string) => ANIM.motions[name].marks?.[m] ?? 0;
