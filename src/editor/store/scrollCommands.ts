import {
  newId,
  type ChibiDocument,
  type Easing,
  type ScrollBindingTarget,
} from "@/runtime/schema";
import { useDoc, type DispatchOpts } from "./document";

function dispatch(
  label: string,
  recipe: (draft: ChibiDocument) => void,
  opts?: DispatchOpts,
) {
  useDoc.getState().dispatch(label, recipe, opts);
}

export function addScrollBinding(target: ScrollBindingTarget): string {
  const id = newId("sb");
  dispatch("Add scroll binding", (d) => {
    d.scrollBindings.push({ id, target, start: 0, end: 1, ease: "linear" });
  });
  return id;
}

export function removeScrollBinding(id: string) {
  dispatch("Delete scroll binding", (d) => {
    const idx = d.scrollBindings.findIndex((b) => b.id === id);
    if (idx >= 0) d.scrollBindings.splice(idx, 1);
  });
}

export function setScrollBindingTarget(id: string, target: ScrollBindingTarget) {
  dispatch("Edit scroll binding", (d) => {
    const binding = d.scrollBindings.find((b) => b.id === id);
    if (binding) binding.target = target;
  });
}

export function setScrollBindingRange(
  id: string,
  range: { start?: number; end?: number },
  opts?: DispatchOpts,
) {
  dispatch(
    "Edit scroll binding",
    (d) => {
      const binding = d.scrollBindings.find((b) => b.id === id);
      if (!binding) return;
      if (range.start !== undefined) binding.start = range.start;
      if (range.end !== undefined) binding.end = range.end;
    },
    opts,
  );
}

export function setScrollBindingEase(id: string, ease: Easing) {
  dispatch("Edit scroll binding", (d) => {
    const binding = d.scrollBindings.find((b) => b.id === id);
    if (binding) binding.ease = ease;
  });
}
