import type { ChibiDocument } from "../schema/types";
import { sampleBindingTarget, windowedProgress } from "./bindings";
import type { SampleMap } from "./sampler";

/** resting pointer progress per axis — canvas center; pointerleave eases back here */
export const POINTER_REST = 0.5;

/** exponential smoothing rate (per second) for the damped pointer progress */
export const POINTER_DAMPING = 6;

/** vertical camera-parallax swing as a fraction of the horizontal angle — full-strength pitch reads seasick */
export const CAMERA_PARALLAX_VERTICAL = 0.5;

/** true when a document declares any pointer feature — gates the canvas pointermove listener so cursor movement never wakes scenes that don't use it */
export function docUsesPointer(doc: ChibiDocument): boolean {
  return doc.pointerBindings.length > 0 || doc.camera.parallax > 0;
}

/** frame-rate-independent exponential approach; snaps when within 1e-4 */
export function dampProgress(current: number, target: number, delta: number): number {
  const next = current + (target - current) * (1 - Math.exp(-POINTER_DAMPING * delta));
  return Math.abs(target - next) < 1e-4 ? target : next;
}

/**
 * Sample every pointer binding at the given damped pointer position
 * ([0,1] per axis, y = 0 at top). Pure position-driven functions like
 * scroll bindings — nothing to advance or reset.
 */
export function samplePointerBindings(
  doc: ChibiDocument,
  x: number,
  y: number,
): SampleMap {
  const out: SampleMap = new Map();
  for (const binding of doc.pointerBindings) {
    const u = windowedProgress(binding, binding.axis === "x" ? x : y);
    for (const [key, value] of sampleBindingTarget(doc, binding.target, u)) {
      out.set(key, value);
    }
  }
  return out;
}
