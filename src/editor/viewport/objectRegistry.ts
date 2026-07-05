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
