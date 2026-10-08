import {
  CanvasTexture,
  SRGBColorSpace,
  type MeshPhysicalMaterial,
  type Texture,
} from "three";
import type { ChibiDocument } from "../schema";

/** host-driven material tweak (`ChibiSceneApi.setMaterial`). never written to
 * the document — lives only for the mounted scene */
export type MaterialPatch = {
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
  opacity?: number;
  /** image URL (png/jpg/webp/svg) replacing the albedo map; null removes it.
   * a patch carrying a URL lands as a whole once the image has loaded */
  map?: string | null;
  /** Fit the image inside a square decal with transparent padding. Used with `map`. */
  mapFit?: "stretch" | "contain";
  /** Replace image RGB with a solid color, preserving its alpha. Used with `map`. */
  mapColor?: string;
};

type ScalarPatch = Omit<MaterialPatch, "map" | "mapFit" | "mapColor">;

export type MaterialOverrideStore = {
  scalars: Map<string, ScalarPatch>;
  /** runtime-owned albedo per material id; null = map removed */
  maps: Map<string, Texture | null>;
  /** latest map request per material id — stale loads are dropped */
  tokens: Map<string, number>;
};

export function createOverrideStore(): MaterialOverrideStore {
  return { scalars: new Map(), maps: new Map(), tokens: new Map() };
}

/** frees gpu copies only — entries stay, so a StrictMode effect replay (same
 * ctx, no re-render) keeps its overrides; three re-uploads on next use */
export function disposeOverrideStore(store: MaterialOverrideStore): void {
  for (const texture of store.maps.values()) texture?.dispose();
}

/** material id, else every material carrying that name */
export function resolveMaterialIds(doc: ChibiDocument, target: string): string[] {
  if (doc.materials[target]) return [target];
  return Object.values(doc.materials)
    .filter((m) => m.name === target)
    .map((m) => m.id);
}

/** re-applied on (lazy) material creation, so calls made before a mesh mounts stick */
export function applyOverrides(
  store: MaterialOverrideStore,
  id: string,
  mat: MeshPhysicalMaterial,
  baseTransparent: boolean,
): void {
  const patch = store.scalars.get(id);
  if (patch) {
    if (patch.color !== undefined) mat.color.set(patch.color);
    if (patch.emissive !== undefined) mat.emissive.set(patch.emissive);
    if (patch.emissiveIntensity !== undefined) {
      mat.emissiveIntensity = patch.emissiveIntensity;
    }
    if (patch.metalness !== undefined) mat.metalness = patch.metalness;
    if (patch.roughness !== undefined) mat.roughness = patch.roughness;
    if (patch.opacity !== undefined) {
      mat.opacity = patch.opacity;
      const transparent = baseTransparent || patch.opacity < 1;
      if (mat.transparent !== transparent) {
        mat.transparent = transparent;
        mat.needsUpdate = true;
      }
    }
  }
  if (store.maps.has(id)) {
    const texture = store.maps.get(id) ?? null;
    if (mat.map !== texture) {
      mat.map = texture;
      mat.needsUpdate = true;
    }
  }
}

const SVG_URL = /\.svg(?:[?#]|$)|^data:image\/svg/i;
const SVG_RASTER_SIZE = 512;

/** albedo texture from a host URL. svgs are rasterized through a canvas:
 * viewBox-only files have no intrinsic size and would upload tiny or blank */
export function loadOverrideTexture(
  url: string,
  fit: MaterialPatch["mapFit"] = "stretch",
  color?: string,
): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const svg = SVG_URL.test(url);
      const w = img.naturalWidth || 1;
      const h = img.naturalHeight || 1;
      const k = svg ? SVG_RASTER_SIZE / Math.max(w, h) : 1;
      const imageWidth = Math.max(1, Math.round(w * k));
      const imageHeight = Math.max(1, Math.round(h * k));
      const side = Math.max(imageWidth, imageHeight);
      const canvas = document.createElement("canvas");
      canvas.width = fit === "contain" ? side : imageWidth;
      canvas.height = fit === "contain" ? side : imageHeight;
      const g = canvas.getContext("2d");
      if (!g) {
        reject(new Error("2d canvas unavailable"));
        return;
      }
      g.drawImage(img, (canvas.width - imageWidth) / 2, (canvas.height - imageHeight) / 2, imageWidth, imageHeight);
      if (color !== undefined) {
        g.globalCompositeOperation = "source-in";
        g.fillStyle = color;
        g.fillRect(0, 0, canvas.width, canvas.height);
      }
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 8; // logos sit on glancing surfaces
      resolve(texture);
    };
    img.onerror = () => reject(new Error(`image failed to load: ${url}`));
    img.src = url;
  });
}

function splitPatch(patch: MaterialPatch): ScalarPatch {
  const scalars: MaterialPatch = { ...patch };
  delete scalars.map;
  delete scalars.mapFit;
  delete scalars.mapColor;
  return scalars;
}

/**
 * record a patch for every material matching `target` and push it onto the
 * live three materials. false = nothing matched.
 */
export function setMaterialOverride(
  host: {
    doc: ChibiDocument;
    materials: Map<string, MeshPhysicalMaterial>;
    overrides: MaterialOverrideStore;
    invalidate: () => void;
  },
  target: string,
  patch: MaterialPatch,
): boolean {
  const ids = resolveMaterialIds(host.doc, target);
  if (ids.length === 0) return false;
  const store = host.overrides;
  const scalars = splitPatch(patch);

  const commit = (id: string, texture?: Texture | null) => {
    store.scalars.set(id, { ...store.scalars.get(id), ...scalars });
    if (texture !== undefined) {
      const prev = store.maps.get(id);
      if (prev && prev !== texture) prev.dispose();
      store.maps.set(id, texture);
    }
    const mat = host.materials.get(id);
    const def = host.doc.materials[id];
    if (mat && def) applyOverrides(store, id, mat, def.transparent);
  };

  for (const id of ids) {
    if (patch.map === undefined) {
      commit(id);
      continue;
    }
    const token = (store.tokens.get(id) ?? 0) + 1;
    store.tokens.set(id, token);
    if (patch.map === null) {
      commit(id, null);
      continue;
    }
    // one texture per material: each owns + disposes its own
    loadOverrideTexture(patch.map, patch.mapFit, patch.mapColor)
      .then((texture) => {
        if (store.tokens.get(id) !== token) {
          texture.dispose();
          return;
        }
        commit(id, texture);
        host.invalidate();
      })
      .catch((err) =>
        console.warn(`chibi: setMaterial map for "${target}" failed`, err),
      );
  }
  host.invalidate();
  return true;
}
