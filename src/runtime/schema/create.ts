import { nanoid } from "nanoid";
import { defaultGeometryParams } from "./geometry";
import type {
  ChibiDocument,
  ChibiMaterial,
  LightNode,
  MeshNode,
} from "./types";

export function newId(prefix: string): string {
  return `${prefix}_${nanoid(8)}`;
}

export const DEFAULT_MATERIAL_ID = "mt_default";

/** virtual per-object state (never in doc.states) — base values ARE the document */
export const BASE_STATE_ID = "base";

export function createMaterial(id: string, name: string): ChibiMaterial {
  return {
    id,
    name,
    type: "standard",
    color: "#b8b8c4",
    metalness: 0.1,
    roughness: 0.45,
    emissive: "#000000",
    emissiveIntensity: 0,
    opacity: 1,
    transparent: false,
    flatShading: false,
    maps: { map: null, normalMap: null, roughnessMap: null },
  };
}

export function createDocument(name = "Untitled"): ChibiDocument {
  const box: MeshNode = {
    id: newId("nd"),
    name: "Box",
    type: "mesh",
    geometry: { kind: "box", params: defaultGeometryParams("box") },
    materialId: DEFAULT_MATERIAL_ID,
    transform: { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    visible: true,
    castShadow: true,
    receiveShadow: true,
    children: [],
  };
  const keyLight: LightNode = {
    id: newId("nd"),
    name: "Key light",
    type: "light",
    light: { kind: "directional", color: "#ffffff", intensity: 2.5, castShadow: true },
    transform: { position: [3, 5, 2], rotation: [0, 0, 0], scale: [1, 1, 1] },
    visible: true,
    children: [],
  };
  return {
    chibi: 1,
    name,
    root: [box.id, keyLight.id],
    nodes: { [box.id]: box, [keyLight.id]: keyLight },
    materials: {
      [DEFAULT_MATERIAL_ID]: createMaterial(DEFAULT_MATERIAL_ID, "Default"),
    },
    assets: {},
    animations: {},
    states: {},
    interactions: [],
    environment: { background: "#0b0b0f", preset: "city", fog: null, shadows: true },
    camera: { position: [4, 3, 6], target: [0, 0.5, 0], fov: 45 },
    editor: { grid: true },
  };
}
