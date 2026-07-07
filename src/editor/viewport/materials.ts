import { DoubleSide, MeshPhysicalMaterial } from "three";
import type { ChibiMaterial } from "@/runtime/schema";
import { useDoc } from "../store/document";
import { loadTexture } from "./textures";

// One three material instance per document material id, mutated in place so
// every mesh referencing it updates without re-rendering. Physical (not
// standard) so clay-look props (clearcoat/sheen) are available.
const cache = new Map<string, MeshPhysicalMaterial>();

const MAP_SLOTS = [
  ["map", true],
  ["normalMap", false],
  ["roughnessMap", false],
] as const;

export function getSharedMaterial(def: ChibiMaterial): MeshPhysicalMaterial {
  let mat = cache.get(def.id);
  if (!mat) {
    mat = new MeshPhysicalMaterial();
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
  mat.clearcoat = def.clearcoat;
  mat.clearcoatRoughness = def.clearcoatRoughness;
  mat.sheen = def.sheen;
  mat.sheenColor.set(def.sheenColor);
  if (mat.flatShading !== def.flatShading) {
    mat.flatShading = def.flatShading;
    mat.needsUpdate = true;
  }
  syncMaps(mat, def);
  return mat;
}

function syncMaps(mat: MeshPhysicalMaterial, def: ChibiMaterial) {
  const doc = useDoc.getState().doc;
  for (const [slot, srgb] of MAP_SLOTS) {
    const assetId = def.maps[slot];
    const asset = assetId && doc ? doc.assets[assetId] : undefined;
    if (!asset) {
      if (mat[slot]) {
        mat[slot] = null;
        mat.needsUpdate = true;
      }
      continue;
    }
    const entry = loadTexture(asset, srgb);
    if (entry.texture) {
      if (mat[slot] !== entry.texture) {
        mat[slot] = entry.texture;
        mat.needsUpdate = true;
      }
    } else {
      entry.promise
        .then((texture) => {
          // apply only if the document still wants this texture in this slot
          const current = useDoc.getState().doc?.materials[def.id];
          if (current?.maps[slot] === assetId) {
            mat[slot] = texture;
            mat.needsUpdate = true;
          }
        })
        .catch((err) =>
          console.warn(`chibi: texture "${asset.name}" failed to load`, err),
        );
    }
  }
}

/** Cached three material for a document material id (for animation playback). */
export function getCachedMaterial(id: string): MeshPhysicalMaterial | null {
  return cache.get(id) ?? null;
}

export function disposeMaterial(id: string) {
  cache.get(id)?.dispose();
  cache.delete(id);
}
