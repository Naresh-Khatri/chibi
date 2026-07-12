import type { ChibiDocument } from "../schema/types";
import { clampProgress, sampleBindingTarget, windowedProgress } from "./bindings";
import type { SampleMap } from "./sampler";

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

/**
 * Sample every scroll binding at the given global progress. Bindings are
 * position-driven pure functions of `progress` — unlike Transition/ClipPlayer
 * there is no per-instance stateful player, so scrubbing back and forth just
 * resamples; nothing to advance/reset.
 */
export function sampleScrollBindings(doc: ChibiDocument, progress: number): SampleMap {
  const out: SampleMap = new Map();
  for (const binding of doc.scrollBindings) {
    const u = windowedProgress(binding, progress);
    for (const [key, value] of sampleBindingTarget(doc, binding.target, u)) {
      out.set(key, value);
    }
  }
  return out;
}
