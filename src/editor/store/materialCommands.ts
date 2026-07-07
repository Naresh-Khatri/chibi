import {
  DEFAULT_MATERIAL_ID,
  createMaterial,
  newId,
  type CameraDef,
  type ChibiDocument,
  type ChibiMaterial,
  type ChibiNode,
  type Environment,
  type LightNode,
  type PropertyValue,
} from "@/runtime/schema";
import { useDoc, type DispatchOpts } from "./document";
import {
  activeOverrideState,
  requireBaseState,
  writeOverrides,
} from "./stateCommands";

function dispatch(
  label: string,
  recipe: (draft: ChibiDocument) => void,
  opts?: DispatchOpts,
) {
  useDoc.getState().dispatch(label, recipe, opts);
}

export function addMaterial(assignToNodeId?: string): string {
  if (!requireBaseState("add materials")) return DEFAULT_MATERIAL_ID;
  const id = newId("mt");
  dispatch("New material", (d) => {
    const names = new Set(Object.values(d.materials).map((m) => m.name));
    let name = "Material";
    for (let i = 2; names.has(name); i++) name = `Material ${i}`;
    d.materials[id] = createMaterial(id, name);
    if (assignToNodeId) {
      const node = d.nodes[assignToNodeId];
      if (node?.type === "mesh" || isModelPart(node)) node.materialId = id;
    }
  });
  return id;
}

export function setMaterialProp(
  materialId: string,
  updates: Partial<Omit<ChibiMaterial, "id" | "type" | "maps">>,
  opts?: DispatchOpts,
) {
  const active = activeOverrideState();
  const owner = active ? useDoc.getState().doc?.nodes[active.nodeId] : undefined;
  // material edits record into the active state only when its owner node uses
  // this material; color/opacity are the overridable props, rest stays base
  if (
    active &&
    (owner?.type === "mesh" || owner?.type === "model") &&
    owner.materialId === materialId
  ) {
    const { color, opacity, ...rest } = updates;
    const entries: Record<string, PropertyValue> = {};
    if (color !== undefined) entries.color = color;
    if (opacity !== undefined) entries.opacity = opacity;
    if (Object.keys(entries).length > 0) {
      writeOverrides(active.stateId, materialId, entries, opts, "Edit material");
    }
    if (Object.keys(rest).length === 0) return;
    updates = rest;
  }
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

// split model part: the only model nodes that take a chibi material override
function isModelPart(
  node: ChibiNode | undefined,
): node is ChibiNode & { type: "model" } {
  return node?.type === "model" && node.path !== undefined;
}

/** `materialId: null` clears a model part's override back to the GLB material. */
export function assignMaterial(nodeId: string, materialId: string | null) {
  if (!requireBaseState("assign materials")) return;
  dispatch("Assign material", (d) => {
    const node = d.nodes[nodeId];
    if (node?.type === "mesh" && materialId && d.materials[materialId]) {
      node.materialId = materialId;
    } else if (isModelPart(node)) {
      if (materialId === null) delete node.materialId;
      else if (d.materials[materialId]) node.materialId = materialId;
    }
  });
}

export function materialUsageCount(materialId: string): number {
  const doc = useDoc.getState().doc;
  if (!doc) return 0;
  return Object.values(doc.nodes).filter(
    (n) =>
      (n.type === "mesh" || n.type === "model") && n.materialId === materialId,
  ).length;
}

/** Deletes a material; meshes fall back to default, model parts to embedded. */
export function deleteMaterial(materialId: string) {
  if (materialId === DEFAULT_MATERIAL_ID) return;
  if (!requireBaseState("delete materials")) return;
  dispatch("Delete material", (d) => {
    if (!d.materials[materialId]) return;
    for (const node of Object.values(d.nodes)) {
      if (node.type === "mesh" && node.materialId === materialId) {
        node.materialId = DEFAULT_MATERIAL_ID;
      } else if (node.type === "model" && node.materialId === materialId) {
        delete node.materialId;
      }
    }
    delete d.materials[materialId];
    for (const state of Object.values(d.states)) {
      delete state.overrides[materialId];
    }
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

/** "Set camera from view": persist the orbit camera into doc.camera */
export function setDocCamera(camera: CameraDef) {
  dispatch("Set camera", (d) => {
    d.camera = {
      position: [...camera.position],
      target: [...camera.target],
      fov: camera.fov,
    };
  });
}
