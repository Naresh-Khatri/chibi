import { create } from "zustand";
import type { Object3D, PerspectiveCamera, Vector3 } from "three";

const objects = new Map<string, Object3D>();

type RegistryState = {
  version: number;
  register: (id: string, obj: Object3D) => void;
  unregister: (id: string, obj: Object3D) => void;
};

export const useRegistry = create<RegistryState>()((set) => ({
  version: 0,
  register: (id, obj) => {
    objects.set(id, obj);
    set((s) => ({ version: s.version + 1 }));
  },
  unregister: (id, obj) => {
    if (objects.get(id) === obj) {
      objects.delete(id);
      set((s) => ({ version: s.version + 1 }));
    }
  },
}));

export function useSceneObject(id: string | null): Object3D | null {
  useRegistry((s) => s.version);
  return id ? (objects.get(id) ?? null) : null;
}

export function getSceneObject(id: string): Object3D | null {
  return objects.get(id) ?? null;
}

export type GizmoControlsLike = {
  axis: string | null;
  dragging: boolean;
};

let gizmoControls: GizmoControlsLike | null = null;

export function setGizmoControls(controls: GizmoControlsLike | null) {
  gizmoControls = controls;
}

/** True while the pointer hovers or drags a transform-gizmo handle. */
export function isGizmoActive(): boolean {
  return Boolean(gizmoControls && (gizmoControls.axis !== null || gizmoControls.dragging));
}

export type OrbitLike = {
  target: Vector3;
  object: PerspectiveCamera;
  update: () => void;
};

let orbitControls: OrbitLike | null = null;

export function setOrbitControls(controls: OrbitLike | null) {
  orbitControls = controls;
}

export function getOrbitControls(): OrbitLike | null {
  return orbitControls;
}

// Distance (in screen px) a pointer may travel between down and up and
// still count as a click rather than a camera-orbit/pan drag.
const CLICK_SLOP_PX = 6;

let pointerDownAt: { x: number; y: number } | null = null;

export function setPointerDownAt(pos: { x: number; y: number } | null) {
  pointerDownAt = pos;
}

/** Whether (x, y) is close enough to the last pointer-down to count as a click, not a drag. */
export function isClick(x: number, y: number): boolean {
  if (!pointerDownAt) return true;
  return (
    Math.abs(x - pointerDownAt.x) < CLICK_SLOP_PX &&
    Math.abs(y - pointerDownAt.y) < CLICK_SLOP_PX
  );
}
