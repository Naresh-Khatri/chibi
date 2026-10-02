import { z } from "zod";
import {
  DEFAULT_MATERIAL_ID,
  assetSchema,
  materialSchema,
  newId,
  nodeSchema,
  type ChibiAsset,
  type ChibiDocument,
  type ChibiMaterial,
  type ChibiNode,
} from "@/runtime/schema";
import { useDoc } from "./document";
import { useUI } from "./ui";
import {
  removeNodes,
  subtreeIds,
  topMostIds,
  transformFromMatrix,
  uniqueName,
  worldMatrixOf,
} from "./commands";
import { requireBaseState } from "./stateCommands";

/** self-contained node subtrees: roots carry baked world transforms, plus every
 * material/asset they reference — enough to paste into any document */
const payloadSchema = z.object({
  chibiClipboard: z.literal(1),
  docId: z.string().nullable(),
  roots: z.array(z.string()),
  nodes: z.record(z.string(), nodeSchema),
  materials: z.record(z.string(), materialSchema),
  assets: z.record(z.string(), assetSchema),
});
export type ClipboardPayload = z.infer<typeof payloadSchema>;

// fallback when the system clipboard is unavailable (or blocked)
let memory: ClipboardPayload | null = null;

function materialAssetIds(m: ChibiMaterial): string[] {
  return Object.values(m.maps).filter((id): id is string => Boolean(id));
}

export function buildClipboard(doc: ChibiDocument, docId: string | null, ids: string[]): ClipboardPayload | null {
  const roots = topMostIds(doc, ids);
  if (roots.length === 0) return null;
  const payload: ClipboardPayload = { chibiClipboard: 1, docId, roots, nodes: {}, materials: {}, assets: {} };
  const addAsset = (id: string) => {
    const asset = doc.assets[id];
    if (asset) payload.assets[id] = structuredClone(asset);
  };
  const addMaterial = (id: string | undefined) => {
    const material = id ? doc.materials[id] : undefined;
    if (!material || payload.materials[material.id]) return;
    payload.materials[material.id] = structuredClone(material);
    materialAssetIds(material).forEach(addAsset);
  };
  for (const rootId of roots) {
    for (const id of subtreeIds(doc, rootId)) {
      const node = structuredClone(doc.nodes[id]) as ChibiNode;
      if (id === rootId) node.transform = transformFromMatrix(worldMatrixOf(doc, id));
      payload.nodes[id] = node;
      if (node.type === "mesh" || node.type === "model") addMaterial(node.materialId);
      if (node.type === "model") addAsset(node.assetId);
    }
  }
  return payload;
}

export function serializeClipboard(payload: ClipboardPayload): string {
  return JSON.stringify(payload);
}

export function parseClipboard(text: string): ClipboardPayload | null {
  if (!text.includes("chibiClipboard")) return null;
  try {
    const result = payloadSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function sameMaterial(a: ChibiMaterial, b: ChibiMaterial): boolean {
  return JSON.stringify({ ...a, id: "" }) === JSON.stringify({ ...b, id: "" });
}

/** inserts the payload at the scene root, selects + returns the new root ids */
export function pasteClipboard(payload: ClipboardPayload): string[] {
  if (!requireBaseState("paste objects")) return [];
  const { doc, docId } = useDoc.getState();
  if (!doc) return [];
  const sameDoc = payload.docId !== null && payload.docId === docId;

  // assets dedupe by content hash; blobs live in a hash-keyed store shared by all docs
  const assetMap = new Map<string, string>();
  const newAssets: ChibiAsset[] = [];
  for (const asset of Object.values(payload.assets)) {
    const existing = Object.values(doc.assets).find(
      (a) => a.hash === asset.hash && a.kind === asset.kind,
    );
    if (existing) {
      assetMap.set(asset.id, existing.id);
    } else {
      const id = doc.assets[asset.id] ? newId("as") : asset.id;
      assetMap.set(asset.id, id);
      newAssets.push({ ...asset, id });
    }
  }

  const materialMap = new Map<string, string>([[DEFAULT_MATERIAL_ID, DEFAULT_MATERIAL_ID]]);
  const newMaterials: ChibiMaterial[] = [];
  for (const material of Object.values(payload.materials)) {
    if (material.id === DEFAULT_MATERIAL_ID) continue;
    const remapped: ChibiMaterial = {
      ...structuredClone(material),
      maps: {
        map: material.maps.map && (assetMap.get(material.maps.map) ?? null),
        normalMap: material.maps.normalMap && (assetMap.get(material.maps.normalMap) ?? null),
        roughnessMap: material.maps.roughnessMap && (assetMap.get(material.maps.roughnessMap) ?? null),
      },
    };
    const existing =
      (sameDoc && doc.materials[material.id]) ||
      Object.values(doc.materials).find((m) => sameMaterial(m, remapped));
    if (existing) {
      materialMap.set(material.id, existing.id);
    } else {
      const id = newId("mt");
      materialMap.set(material.id, id);
      newMaterials.push({ ...remapped, id });
    }
  }

  const idMap = new Map<string, string>();
  for (const id of Object.keys(payload.nodes)) idMap.set(id, newId("nd"));
  const nodes: ChibiNode[] = [];
  for (const [id, original] of Object.entries(payload.nodes)) {
    const node = structuredClone(original) as ChibiNode;
    node.id = idMap.get(id)!;
    node.children = node.children.filter((c) => idMap.has(c)).map((c) => idMap.get(c)!);
    if (node.type === "mesh") {
      node.materialId = materialMap.get(node.materialId) ?? DEFAULT_MATERIAL_ID;
    } else if (node.type === "model") {
      node.assetId = assetMap.get(node.assetId) ?? node.assetId;
      if (node.materialId) node.materialId = materialMap.get(node.materialId);
    }
    nodes.push(node);
  }
  const roots = payload.roots.filter((id) => idMap.has(id)).map((id) => idMap.get(id)!);
  if (roots.length === 0) return [];

  useDoc.getState().dispatch("Paste", (d) => {
    for (const asset of newAssets) d.assets[asset.id] = asset;
    for (const material of newMaterials) {
      material.name = uniqueMaterialName(d, material.name);
      d.materials[material.id] = material;
    }
    // name before insert, else uniqueName sees the pasted node itself
    for (const rootId of roots) {
      const root = nodes.find((n) => n.id === rootId)!;
      root.name = uniqueName(d, root.name.replace(/ \d+$/, ""));
      d.nodes[rootId] = root;
      d.root.push(rootId);
    }
    for (const node of nodes) d.nodes[node.id] = node;
  });
  useUI.getState().selectMany(roots);
  return roots;
}

function uniqueMaterialName(doc: ChibiDocument, base: string): string {
  const names = new Set(Object.values(doc.materials).map((m) => m.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

function currentPayload(): ClipboardPayload | null {
  const { doc, docId } = useDoc.getState();
  const ids = useUI.getState().selectedIds;
  return doc && ids.length > 0 ? buildClipboard(doc, docId, ids) : null;
}

/** returns the serialized payload (for clipboardData), null = nothing selected */
export function copySelection(): string | null {
  const payload = currentPayload();
  if (!payload) return null;
  memory = payload;
  return serializeClipboard(payload);
}

export function cutSelection(): string | null {
  if (!requireBaseState("cut objects")) return null;
  const text = copySelection();
  if (text) removeNodes(useUI.getState().selectedIds);
  return text;
}

/** text = system clipboard contents; undefined = unreadable -> in-memory copy */
export function pasteFromText(text: string | undefined): string[] {
  const payload = text === undefined ? memory : parseClipboard(text);
  return payload ? pasteClipboard(payload) : [];
}
