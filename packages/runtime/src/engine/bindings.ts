import { BASE_STATE_ID } from "../schema/create";
import type { BindingTarget, ChibiDocument, Easing } from "../schema/types";
import { EASING } from "./easing";
import { interpolateValue, sampleClip, type SampleMap } from "./sampler";
import { resolveStateValues } from "./state";

// shared core for continuous bindings (scroll + pointer): both map a [0,1]
// progress source through a [start,end] window + ease onto the same targets

/** clamp to the shared [0, 1] progress domain used by triggers and bindings */
export function clampProgress(p: number): number {
  if (Number.isNaN(p)) return 0;
  return Math.min(1, Math.max(0, p));
}

export type BindingWindow = { start: number; end: number; ease: Easing };

/** map global progress into a binding's local [start,end] window, then ease it */
export function windowedProgress(binding: BindingWindow, progress: number): number {
  const span = binding.end - binding.start;
  if (span === 0) return progress >= binding.end ? 1 : 0;
  const t = (progress - binding.start) / span;
  return EASING[binding.ease](clampProgress(t));
}

export function sampleBindingTarget(
  doc: ChibiDocument,
  target: BindingTarget,
  u: number,
): SampleMap {
  if (target.type === "animation") {
    const clip = doc.animations[target.animationId];
    return clip ? sampleClip(clip, u * clip.duration) : new Map();
  }
  const { nodeId, stateId } = target;
  if (doc.states[stateId]?.nodeId !== nodeId) return new Map();
  const from = resolveStateValues(doc, nodeId, BASE_STATE_ID);
  const to = resolveStateValues(doc, nodeId, stateId);
  const out: SampleMap = new Map();
  for (const [key, toValue] of to) {
    const fromValue = from.get(key);
    out.set(key, fromValue === undefined ? toValue : interpolateValue(fromValue, toValue, u));
  }
  return out;
}
