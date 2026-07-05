import type {
  AnimationClip,
  Keyframe,
  PropertyValue,
  Vec3,
} from "../schema/types";
import { DEFAULT_EASE, EASING } from "./easing";

/** `${targetId}:${property}` — ids never contain ":" (nanoid alphabet). */
export type TargetKey = string;

export type SampleMap = Map<TargetKey, PropertyValue>;

export function makeTargetKey(targetId: string, property: string): TargetKey {
  return `${targetId}:${property}`;
}

export function parseTargetKey(key: TargetKey): {
  targetId: string;
  property: string;
} {
  const i = key.indexOf(":");
  return { targetId: key.slice(0, i), property: key.slice(i + 1) };
}

/**
 * Sample every track of a clip at time `t` (seconds).
 * `t` wraps by duration when the clip loops; each track clamps before its
 * first and after its last keyframe. Empty tracks produce no entry.
 */
export function sampleClip(clip: AnimationClip, t: number): SampleMap {
  let time = t;
  if (clip.loop && clip.duration > 0) {
    time = t % clip.duration;
    if (time < 0) time += clip.duration;
  }
  const out: SampleMap = new Map();
  for (const track of clip.tracks) {
    if (track.keyframes.length === 0) continue;
    out.set(
      makeTargetKey(track.targetId, track.property),
      sampleKeyframes(track.keyframes, time),
    );
  }
  return out;
}

/** Keyframes must be sorted by `t` ascending (commands maintain this). */
export function sampleKeyframes(
  keyframes: Keyframe[],
  time: number,
): PropertyValue {
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (time <= first.t) return first.v;
  if (time >= last.t) return last.v;

  // binary search: greatest index i with keyframes[i].t <= time
  let lo = 0;
  let hi = keyframes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (keyframes[mid].t <= time) lo = mid;
    else hi = mid - 1;
  }
  const a = keyframes[lo];
  const b = keyframes[lo + 1];
  const span = b.t - a.t;
  if (span <= 0) return b.v;
  const u = EASING[a.ease ?? DEFAULT_EASE]((time - a.t) / span);
  return interpolate(a.v, b.v, u);
}

function interpolate(
  a: PropertyValue,
  b: PropertyValue,
  u: number,
): PropertyValue {
  if (typeof a === "number" && typeof b === "number") return lerp(a, b, u);
  if (typeof a === "boolean") return a; // step: hold until the next keyframe
  if (Array.isArray(a) && Array.isArray(b)) {
    return [
      lerp(a[0], b[0], u),
      lerp(a[1], b[1], u),
      lerp(a[2], b[2], u),
    ] as Vec3;
  }
  if (typeof a === "string" && typeof b === "string") {
    return lerpHexColor(a, b, u);
  }
  return a;
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

/** Component-wise sRGB lerp of "#rrggbb" (or "#rgb") colors. */
export function lerpHexColor(a: string, b: string, u: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  return rgbToHex(
    Math.round(lerp(ar, br, u)),
    Math.round(lerp(ag, bg, u)),
    Math.round(lerp(ab, bb, u)),
  );
}

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
