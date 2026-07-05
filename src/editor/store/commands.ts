import {
  DEFAULT_MATERIAL_ID,
  GEOMETRY_DEFS,
  defaultGeometryParams,
  newId,
  type ChibiDocument,
  type ChibiNode,
  type GeometryKind,
  type GroupNode,
  type LightKind,
  type LightNode,
  type MeshNode,
  type Transform,
  type Vec3,
} from "@/runtime/schema";
import { useDoc, type DispatchOpts } from "./document";
import { useUI } from "./ui";

function dispatch(
  label: string,
  recipe: (draft: ChibiDocument) => void,
  opts?: DispatchOpts,
) {
  useDoc.getState().dispatch(label, recipe, opts);
}

function identityTransform(): Transform {
  return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
}

export function findParentId(doc: ChibiDocument, nodeId: string): string | null {
  for (const node of Object.values(doc.nodes)) {
    if (node.children.includes(nodeId)) return node.id;
  }
  return null;
}

function siblingsOf(doc: ChibiDocument, parentId: string | null): string[] {
  return parentId ? doc.nodes[parentId].children : doc.root;
}

export function isDescendant(
  doc: ChibiDocument,
  ancestorId: string,
  maybeDescendantId: string,
): boolean {
  const stack = [...(doc.nodes[ancestorId]?.children ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === maybeDescendantId) return true;
    stack.push(...(doc.nodes[id]?.children ?? []));
  }
  return false;
}

export function subtreeIds(doc: ChibiDocument, nodeId: string): string[] {
  const ids: string[] = [];
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop()!;
    const node = doc.nodes[id];
    if (!node) continue;
    ids.push(id);
    stack.push(...node.children);
  }
  return ids;
}

function uniqueName(doc: ChibiDocument, base: string): string {
  const names = new Set(Object.values(doc.nodes).map((n) => n.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

export function addMeshNode(kind: GeometryKind) {
  const id = newId("nd");
  dispatch(`Add ${GEOMETRY_DEFS[kind].label}`, (d) => {
    const node: MeshNode = {
      id,
      name: uniqueName(d, GEOMETRY_DEFS[kind].label),
      type: "mesh",
      geometry: { kind, params: defaultGeometryParams(kind) },
      materialId: DEFAULT_MATERIAL_ID,
      transform: identityTransform(),
      visible: true,
      castShadow: true,
      receiveShadow: true,
      children: [],
    };
    d.nodes[id] = node;
    d.root.push(id);
  });
  useUI.getState().select(id);
}

const LIGHT_DEFAULTS: Record<
  LightKind,
  { name: string; position: Vec3; light: LightNode["light"] }
> = {
  directional: {
    name: "Directional light",
    position: [3, 5, 2],
    light: { kind: "directional", color: "#ffffff", intensity: 2, castShadow: true },
  },
  point: {
    name: "Point light",
    position: [0, 2, 0],
    light: { kind: "point", color: "#ffffff", intensity: 8, distance: 0, castShadow: true },
  },
  spot: {
    name: "Spot light",
    position: [0, 3, 0],
    light: {
      kind: "spot",
      color: "#ffffff",
      intensity: 12,
      distance: 0,
      angle: Math.PI / 6,
      penumbra: 0.3,
      castShadow: true,
    },
  },
};

export function addLightNode(kind: LightKind) {
  const id = newId("nd");
  const preset = LIGHT_DEFAULTS[kind];
  dispatch(`Add ${preset.name}`, (d) => {
    const node: LightNode = {
      id,
      name: uniqueName(d, preset.name),
      type: "light",
      light: { ...preset.light },
      transform: { ...identityTransform(), position: [...preset.position] },
      visible: true,
      children: [],
    };
    d.nodes[id] = node;
    d.root.push(id);
  });
  useUI.getState().select(id);
}

export function addGroupNode() {
  const id = newId("nd");
  dispatch("Add Group", (d) => {
    const node: GroupNode = {
      id,
      name: uniqueName(d, "Group"),
      type: "group",
      transform: identityTransform(),
      visible: true,
      children: [],
    };
    d.nodes[id] = node;
    d.root.push(id);
  });
  useUI.getState().select(id);
}

export function removeNode(nodeId: string) {
  const doc = useDoc.getState().doc;
  if (!doc || !doc.nodes[nodeId]) return;
  const removed = new Set(subtreeIds(doc, nodeId));
  dispatch("Delete", (d) => {
    const parentId = findParentId(d, nodeId);
    const siblings = siblingsOf(d, parentId);
    const idx = siblings.indexOf(nodeId);
    if (idx >= 0) siblings.splice(idx, 1);
    for (const id of removed) delete d.nodes[id];
  });
  const ui = useUI.getState();
  if (ui.selectedId && removed.has(ui.selectedId)) ui.select(null);
}

export function setNodeName(nodeId: string, name: string) {
  dispatch("Rename", (d) => {
    const node = d.nodes[nodeId];
    if (node && name.trim()) node.name = name.trim();
  });
}

export function setNodeVisible(nodeId: string, visible: boolean) {
  dispatch("Toggle visibility", (d) => {
    const node = d.nodes[nodeId];
    if (node) node.visible = visible;
  });
}

export function setNodeShadow(
  nodeId: string,
  key: "castShadow" | "receiveShadow",
  value: boolean,
) {
  dispatch("Toggle shadow", (d) => {
    const node = d.nodes[nodeId];
    if (node?.type === "mesh") node[key] = value;
  });
}

const EPSILON = 1e-9;

function vec3Equal(a: Vec3, b: Vec3): boolean {
  return (
    Math.abs(a[0] - b[0]) < EPSILON &&
    Math.abs(a[1] - b[1]) < EPSILON &&
    Math.abs(a[2] - b[2]) < EPSILON
  );
}

export function setTransform(nodeId: string, t: Transform, opts?: DispatchOpts) {
  const doc = useDoc.getState().doc;
  const current = doc?.nodes[nodeId]?.transform;
  if (
    current &&
    vec3Equal(current.position, t.position) &&
    vec3Equal(current.rotation, t.rotation) &&
    vec3Equal(current.scale, t.scale)
  ) {
    return;
  }
  dispatch(
    "Transform",
    (d) => {
      const node = d.nodes[nodeId];
      if (!node) return;
      node.transform = {
        position: [...t.position],
        rotation: [...t.rotation],
        scale: [...t.scale],
      };
    },
    opts,
  );
}

export function setTransformComponent(
  nodeId: string,
  field: "position" | "rotation" | "scale",
  axis: 0 | 1 | 2,
  value: number,
  opts?: DispatchOpts,
) {
  dispatch(
    "Transform",
    (d) => {
      const node = d.nodes[nodeId];
      if (node) node.transform[field][axis] = value;
    },
    opts,
  );
}

export function setGeometryParam(
  nodeId: string,
  key: string,
  value: number | string,
  opts?: DispatchOpts,
) {
  dispatch(
    "Edit geometry",
    (d) => {
      const node = d.nodes[nodeId];
      if (node?.type === "mesh") node.geometry.params[key] = value;
    },
    opts,
  );
}

export function duplicateNode(nodeId: string) {
  const doc = useDoc.getState().doc;
  const src = doc?.nodes[nodeId];
  if (!doc || !src) return;

  const idMap = new Map<string, string>();
  for (const id of subtreeIds(doc, nodeId)) idMap.set(id, newId("nd"));

  const clones: ChibiNode[] = subtreeIds(doc, nodeId).map((id) => {
    const original = doc.nodes[id];
    const clone = structuredClone(original) as ChibiNode;
    clone.id = idMap.get(id)!;
    clone.children = original.children.map((cid) => idMap.get(cid)!);
    return clone;
  });

  const newRootId = idMap.get(nodeId)!;
  const baseName = src.name.replace(/ \d+$/, "");
  dispatch("Duplicate", (d) => {
    for (const clone of clones) d.nodes[clone.id] = clone;
    d.nodes[newRootId].name = uniqueName(d, baseName);
    const parentId = findParentId(d, nodeId);
    const siblings = siblingsOf(d, parentId);
    const idx = siblings.indexOf(nodeId);
    siblings.splice(idx + 1, 0, newRootId);
  });
  useUI.getState().select(newRootId);
}

export function groupNode(nodeId: string) {
  const doc = useDoc.getState().doc;
  if (!doc?.nodes[nodeId]) return;
  const groupId = newId("nd");
  dispatch("Group", (d) => {
    const node = d.nodes[nodeId];
    const group: GroupNode = {
      id: groupId,
      name: uniqueName(d, "Group"),
      type: "group",
      transform: {
        position: [...node.transform.position],
        rotation: [...node.transform.rotation],
        scale: [...node.transform.scale],
      },
      visible: true,
      children: [nodeId],
    };
    node.transform = identityTransform();
    d.nodes[groupId] = group;
    const parentId = findParentId(d, nodeId);
    const siblings = siblingsOf(d, parentId);
    siblings.splice(siblings.indexOf(nodeId), 1, groupId);
  });
  useUI.getState().select(groupId);
}

export function reparentNode(
  nodeId: string,
  newParentId: string | null,
  index: number,
) {
  const doc = useDoc.getState().doc;
  if (!doc || !doc.nodes[nodeId]) return;
  if (nodeId === newParentId) return;
  if (newParentId && !doc.nodes[newParentId]) return;
  if (newParentId && isDescendant(doc, nodeId, newParentId)) return;

  dispatch("Reparent", (d) => {
    const oldParentId = findParentId(d, nodeId);
    const from = siblingsOf(d, oldParentId);
    const oldIdx = from.indexOf(nodeId);
    from.splice(oldIdx, 1);
    const to = siblingsOf(d, newParentId);
    let insertAt = Math.max(0, Math.min(index, to.length));
    if (oldParentId === newParentId && oldIdx < insertAt) insertAt -= 1;
    to.splice(insertAt, 0, nodeId);
  });
}
