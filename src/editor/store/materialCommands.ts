import {
  DEFAULT_MATERIAL_ID,
  createMaterial,
  newId,
  type ChibiDocument,
  type ChibiMaterial,
  type Environment,
  type LightNode,
} from "@/runtime/schema";
import { useDoc, type DispatchOpts } from "./document";

function dispatch(
  label: string,
  recipe: (draft: ChibiDocument) => void,
  opts?: DispatchOpts,
) {
  useDoc.getState().dispatch(label, recipe, opts);
}

export function addMaterial(assignToNodeId?: string): string {
  const id = newId("mt");
  dispatch("New material", (d) => {
    const names = new Set(Object.values(d.materials).map((m) => m.name));
    let name = "Material";
    for (let i = 2; names.has(name); i++) name = `Material ${i}`;
    d.materials[id] = createMaterial(id, name);
    if (assignToNodeId) {
      const node = d.nodes[assignToNodeId];
      if (node?.type === "mesh") node.materialId = id;
    }
  });
  return id;
}

export function setMaterialProp(
  materialId: string,
  updates: Partial<Omit<ChibiMaterial, "id" | "type" | "maps">>,
  opts?: DispatchOpts,
) {
  dispatch(
    "Edit material",
    (d) => {
      const material = d.materials[materialId];
      if (material) Object.assign(material, updates);
    },
    opts,
  );
}

export function renameMaterial(materialId: string, name: string) {
  if (!name.trim()) return;
  setMaterialProp(materialId, { name: name.trim() });
}

export function assignMaterial(nodeId: string, materialId: string) {
  dispatch("Assign material", (d) => {
    const node = d.nodes[nodeId];
    if (node?.type === "mesh" && d.materials[materialId]) {
      node.materialId = materialId;
    }
  });
}

export function materialUsageCount(materialId: string): number {
  const doc = useDoc.getState().doc;
  if (!doc) return 0;
  return Object.values(doc.nodes).filter(
    (n) => n.type === "mesh" && n.materialId === materialId,
  ).length;
}

/** Deletes a material, reassigning any meshes that used it to the default. */
export function deleteMaterial(materialId: string) {
  if (materialId === DEFAULT_MATERIAL_ID) return;
  dispatch("Delete material", (d) => {
    if (!d.materials[materialId]) return;
    for (const node of Object.values(d.nodes)) {
      if (node.type === "mesh" && node.materialId === materialId) {
        node.materialId = DEFAULT_MATERIAL_ID;
      }
    }
    delete d.materials[materialId];
  });
}

export function setMaterialMap(
  materialId: string,
  slot: keyof ChibiMaterial["maps"],
  assetId: string | null,
) {
  dispatch("Edit material texture", (d) => {
    const material = d.materials[materialId];
    if (material) material.maps[slot] = assetId;
  });
}

export function setLightProp(
  nodeId: string,
  updates: Partial<LightNode["light"]>,
  opts?: DispatchOpts,
) {
  dispatch(
    "Edit light",
    (d) => {
      const node = d.nodes[nodeId];
      if (node?.type === "light") Object.assign(node.light, updates);
    },
    opts,
  );
}

export function setEnvironment(updates: Partial<Environment>, opts?: DispatchOpts) {
  dispatch(
    "Edit environment",
    (d) => {
      Object.assign(d.environment, updates);
    },
    opts,
  );
}

export function setGridVisible(visible: boolean) {
  dispatch("Toggle grid", (d) => {
    d.editor.grid = visible;
  });
}

export function setDocumentName(name: string) {
  if (!name.trim()) return;
  dispatch("Rename scene", (d) => {
    d.name = name.trim();
  });
}
