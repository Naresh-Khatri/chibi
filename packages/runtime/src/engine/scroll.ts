import { BASE_STATE_ID } from "../schema/create";
import type { ChibiDocument, ScrollBinding } from "../schema/types";
import { EASING } from "./easing";
import { interpolateValue, sampleClip, type SampleMap } from "./sampler";
import { resolveStateValues } from "./state";

/** clamp to the shared [0, 1] progress domain used by triggers and bindings */
export function clampProgress(p: number): number {
  if (Number.isNaN(p)) return 0;
  return Math.min(1, Math.max(0, p));
}

/**
 * Host-page scroll progress for one element: 0 while it hasn't yet entered
 * the viewport from below, 1 once it has fully exited past the top — i.e.
 * the element's whole transit through the viewport maps onto [0, 1],
 * independent of viewport/element height. `SceneHost` feeds this the R3F
 * canvas's `getBoundingClientRect()` against `window.innerHeight`.
 */
export function elementScrollProgress(
  rectTop: number,
  rectHeight: number,
  viewportHeight: number,
): number {
  const span = viewportHeight + rectHeight;
  if (span <= 0) return 0;
  return clampProgress((viewportHeight - rectTop) / span);
}

/** true when a document declares any scroll feature — gates the auto-tracking listener so ambient page scroll never wakes scenes that don't use it */
export function docUsesScroll(doc: ChibiDocument): boolean {
  return (
    doc.scrollBindings.length > 0 ||
    doc.interactions.some((ix) => ix.trigger.type === "scroll")
  );
}

/** map global progress into a binding's local [start,end] window, then ease it */
function localProgress(binding: ScrollBinding, progress: number): number {
  const span = binding.end - binding.start;
  if (span === 0) return progress >= binding.end ? 1 : 0;
  const t = (progress - binding.start) / span;
  return EASING[binding.ease](clampProgress(t));
}

function sampleBindingTarget(
  doc: ChibiDocument,
  binding: ScrollBinding,
  u: number,
): SampleMap {
  const { target } = binding;
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

/**
 * Sample every scroll binding at the given global progress. Bindings are
 * position-driven pure functions of `progress` — unlike Transition/ClipPlayer
 * there is no per-instance stateful player, so scrubbing back and forth just
 * resamples; nothing to advance/reset.
 */
export function sampleScrollBindings(doc: ChibiDocument, progress: number): SampleMap {
  const out: SampleMap = new Map();
  for (const binding of doc.scrollBindings) {
    const u = localProgress(binding, progress);
    for (const [key, value] of sampleBindingTarget(doc, binding, u)) {
      out.set(key, value);
    }
  }
  return out;
}
