import { DoubleSide, MeshStandardMaterial } from "three";
import type { ChibiMaterial } from "@/runtime/schema";

// One three material instance per document material id, mutated in place so
// every mesh referencing it updates without re-rendering.
const cache = new Map<string, MeshStandardMaterial>();

export function getSharedMaterial(def: ChibiMaterial): MeshStandardMaterial {
  let mat = cache.get(def.id);
  if (!mat) {
    mat = new MeshStandardMaterial();
    mat.side = DoubleSide;
    cache.set(def.id, mat);
  }
  mat.color.set(def.color);
  mat.metalness = def.metalness;
  mat.roughness = def.roughness;
  mat.emissive.set(def.emissive);
  mat.emissiveIntensity = def.emissiveIntensity;
  mat.opacity = def.opacity;
  mat.transparent = def.transparent || def.opacity < 1;
  if (mat.flatShading !== def.flatShading) {
    mat.flatShading = def.flatShading;
    mat.needsUpdate = true;
  }
  return mat;
}

export function disposeMaterial(id: string) {
  cache.get(id)?.dispose();
  cache.delete(id);
}
