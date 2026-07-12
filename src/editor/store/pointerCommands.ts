import {
  newId,
  type BindingTarget,
  type ChibiDocument,
  type Easing,
  type PointerAxis,
} from "@/runtime/schema";
import { useDoc, type DispatchOpts } from "./document";

function dispatch(
  label: string,
  recipe: (draft: ChibiDocument) => void,
  opts?: DispatchOpts,
) {
  useDoc.getState().dispatch(label, recipe, opts);
}

export function addPointerBinding(target: BindingTarget, axis: PointerAxis = "x"): string {
  const id = newId("pb");
  dispatch("Add pointer binding", (d) => {
    d.pointerBindings.push({ id, axis, target, start: 0, end: 1, ease: "linear" });
  });
  return id;
}

export function removePointerBinding(id: string) {
  dispatch("Delete pointer binding", (d) => {
    const idx = d.pointerBindings.findIndex((b) => b.id === id);
    if (idx >= 0) d.pointerBindings.splice(idx, 1);
  });
}

export function setPointerBindingAxis(id: string, axis: PointerAxis) {
  dispatch("Edit pointer binding", (d) => {
    const binding = d.pointerBindings.find((b) => b.id === id);
    if (binding) binding.axis = axis;
  });
}

export function setPointerBindingTarget(id: string, target: BindingTarget) {
  dispatch("Edit pointer binding", (d) => {
    const binding = d.pointerBindings.find((b) => b.id === id);
    if (binding) binding.target = target;
  });
}

export function setPointerBindingRange(
  id: string,
  range: { start?: number; end?: number },
  opts?: DispatchOpts,
) {
  dispatch(
    "Edit pointer binding",
    (d) => {
      const binding = d.pointerBindings.find((b) => b.id === id);
      if (!binding) return;
      if (range.start !== undefined) binding.start = range.start;
      if (range.end !== undefined) binding.end = range.end;
    },
    opts,
  );
}

export function setPointerBindingEase(id: string, ease: Easing) {
  dispatch("Edit pointer binding", (d) => {
    const binding = d.pointerBindings.find((b) => b.id === id);
    if (binding) binding.ease = ease;
  });
}

/** camera parallax: max pointer-driven orbit drift in radians; 0 = off */
export function setCameraParallax(value: number, opts?: DispatchOpts) {
  dispatch(
    "Set camera parallax",
    (d) => {
      d.camera.parallax = Math.max(0, value);
    },
    opts,
  );
}
