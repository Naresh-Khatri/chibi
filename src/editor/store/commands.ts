import { Euler, Matrix4, Quaternion, Vector3, type Mesh, type Object3D } from "three";
import {
  BASE_STATE_ID,
  DEFAULT_MATERIAL_ID,
  GEOMETRY_DEFS,
  defaultGeometryParams,
  newId,
  type BindingTarget,
  type ChibiAsset,
  type ChibiDocument,
  type ChibiNode,
  type GeometryKind,
  type GroupNode,
  type LightKind,
  type LightNode,
  type MeshNode,
  type ModelNode,
  type PropertyValue,
  type Transform,
  type Vec3,
} from "@/runtime/schema";
import { resolveValue } from "@/runtime/engine";
import { useDoc, type DispatchOpts } from "./document";
import { useUI } from "./ui";
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

export function identityTransform(): Transform {
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

/** nodes with no selected ancestor (deduped, unknown ids dropped) — multi-node ops act on these so a subtree isn't applied twice via parent + child */
export function topMostIds(doc: ChibiDocument, ids: string[]): string[] {
  const set = new Set(ids.filter((id) => doc.nodes[id]));
  return [...set].filter((id) => {
    for (let p = findParentId(doc, id); p; p = findParentId(doc, p)) {
      if (set.has(p)) return false;
    }
    return true;
  });
}

export function uniqueName(doc: ChibiDocument, base: string): string {
  const names = new Set(Object.values(doc.nodes).map((n) => n.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

export function addMeshNode(kind: GeometryKind): string | null {
  if (!requireBaseState("add objects")) return null;
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
  return id;
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

export function addLightNode(kind: LightKind): string | null {
  if (!requireBaseState("add lights")) return null;
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
  return id;
}

export function addGroupNode(): string | null {
  if (!requireBaseState("add groups")) return null;
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
  return id;
}

export function addModelNode(asset: ChibiAsset) {
  if (!requireBaseState("add models")) return;
  const id = newId("nd");
  const baseName = asset.name.replace(/\.(glb|gltf)$/i, "");
  dispatch(`Add ${baseName}`, (d) => {
    const node: ModelNode = {
      id,
      name: uniqueName(d, baseName),
      type: "model",
      assetId: asset.id,
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

const MAX_SPLIT_PARTS = 500;

function objectTransform(obj: Object3D): Transform {
  // read rotation via the quaternion so any Euler order maps to chibi's XYZ
  const rot = new Euler().setFromQuaternion(obj.quaternion, "XYZ");
  return {
    position: [obj.position.x, obj.position.y, obj.position.z],
    rotation: [rot.x, rot.y, rot.z],
    scale: [obj.scale.x, obj.scale.y, obj.scale.z],
  };
}

function isIdentityTransform(t: Transform): boolean {
  return (
    vec3Equal(t.position, [0, 0, 0]) &&
    vec3Equal(t.rotation, [0, 0, 0]) &&
    vec3Equal(t.scale, [1, 1, 1])
  );
}

/**
 * Converts a model node into a group whose children mirror the GLB's
 * internal scene graph: one model node with a child-index `path` per
 * internal mesh (renders just that mesh) and one group per plain
 * transform, so every part can be selected, transformed, animated,
 * hidden, or deleted individually. `gltfScene` is the original loaded
 * gltf.scene for the node's asset (see retainGltfScene).
 */
export function splitModelNode(nodeId: string, gltfScene: Object3D): boolean {
  if (!requireBaseState("split models")) return false;
  const doc = useDoc.getState().doc;
  const src = doc?.nodes[nodeId];
  if (!doc || src?.type !== "model" || src.path !== undefined) return false;
  const { showToast } = useUI.getState();
  if (gltfScene.children.length === 0) {
    showToast("Model has no internal objects to split");
    return false;
  }
  let count = 0;
  gltfScene.traverse(() => count++);
  if (count - 1 > MAX_SPLIT_PARTS) {
    showToast(`Model has over ${MAX_SPLIT_PARTS} internal objects — not split`);
    return false;
  }

  const parts: ChibiNode[] = [];
  const build = (obj: Object3D, path: string): string => {
    const id = newId("nd");
    const isMesh = (obj as Mesh).isMesh === true;
    const base = {
      id,
      name: obj.name || (isMesh ? "Mesh" : "Group"),
      visible: true,
      transform: objectTransform(obj),
      children: obj.children.map((c, i) => build(c, `${path}/${i}`)),
    };
    parts.push(
      isMesh
        ? {
            ...base,
            type: "model",
            assetId: src.assetId,
            path,
            castShadow: src.castShadow,
            receiveShadow: src.receiveShadow,
          }
        : { ...base, type: "group" },
    );
    return id;
  };
  let childIds = gltfScene.children.map((c, i) => build(c, String(i)));

  // gltf.scene itself can carry a transform (rare) — preserve it in a wrapper
  const sceneTransform = objectTransform(gltfScene);
  if (!isIdentityTransform(sceneTransform)) {
    const wrapperId = newId("nd");
    parts.push({
      id: wrapperId,
      name: gltfScene.name || "Scene",
      type: "group",
      visible: true,
      transform: sceneTransform,
      children: childIds,
    });
    childIds = [wrapperId];
  }

  dispatch("Split model", (d) => {
    for (const part of parts) d.nodes[part.id] = part;
    const old = d.nodes[nodeId];
    // same id keeps states/interactions/animation tracks on the node valid
    const group: GroupNode = {
      id: nodeId,
      name: old.name,
      type: "group",
      transform: {
        position: [...old.transform.position],
        rotation: [...old.transform.rotation],
        scale: [...old.transform.scale],
      },
      visible: old.visible,
      children: [...childIds, ...old.children],
    };
    d.nodes[nodeId] = group;
  });
  return true;
}

export function removeNode(nodeId: string) {
  removeNodes([nodeId]);
}

export function removeNodes(nodeIds: string[]) {
  if (!requireBaseState("delete objects")) return;
  const doc = useDoc.getState().doc;
  if (!doc) return;
  const roots = topMostIds(doc, nodeIds);
  if (roots.length === 0) return;
  const removed = new Set(roots.flatMap((id) => subtreeIds(doc, id)));
  dispatch("Delete", (d) => {
    for (const nodeId of roots) {
      const parentId = findParentId(d, nodeId);
      const siblings = siblingsOf(d, parentId);
      const idx = siblings.indexOf(nodeId);
      if (idx >= 0) siblings.splice(idx, 1);
    }
    for (const id of removed) delete d.nodes[id];
    // drop states owned by removed nodes, and orphaned overrides/interactions
    for (const [stateId, state] of Object.entries(d.states)) {
      if (removed.has(state.nodeId)) {
        delete d.states[stateId];
        continue;
      }
      for (const id of removed) delete state.overrides[id];
    }
    d.interactions = d.interactions.filter((ix) => {
      if (
        ix.trigger.type !== "start" &&
        ix.trigger.type !== "scroll" &&
        removed.has(ix.trigger.nodeId)
      ) {
        return false;
      }
      // state actions on a removed owner (covers refs to its deleted states)
      return ix.action.type === "playAnimation" || !removed.has(ix.action.nodeId);
    });
    // scroll/pointer bindings targeting a removed node's (now-deleted) state
    const targetsLiveState = (b: { target: BindingTarget }) => {
      if (b.target.type !== "state") return true;
      return !removed.has(b.target.nodeId) && Boolean(d.states[b.target.stateId]);
    };
    d.scrollBindings = d.scrollBindings.filter(targetsLiveState);
    d.pointerBindings = d.pointerBindings.filter(targetsLiveState);
  });
  const ui = useUI.getState();
  if (ui.selectedIds.some((id) => removed.has(id))) {
    ui.selectMany(ui.selectedIds.filter((id) => !removed.has(id)));
  }
  if (
    ui.activeStateId !== BASE_STATE_ID &&
    !useDoc.getState().doc?.states[ui.activeStateId]
  ) {
    ui.setActiveState(BASE_STATE_ID);
  }
}

export function setNodeName(nodeId: string, name: string) {
  dispatch("Rename", (d) => {
    const node = d.nodes[nodeId];
    if (node && name.trim()) node.name = name.trim();
  });
}

export function setNodeVisible(nodeId: string, visible: boolean) {
  const active = activeOverrideState();
  if (active?.nodeId === nodeId) {
    writeOverrides(active.stateId, nodeId, { visible }, undefined, "Toggle visibility");
    return;
  }
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
    if (node?.type === "mesh" || node?.type === "model") node[key] = value;
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

const TRANSFORM_FIELDS = ["position", "rotation", "scale"] as const;

/** state-resolved transform field — what the viewport currently shows */
function effectiveTransformField(
  doc: ChibiDocument,
  stateId: string,
  nodeId: string,
  field: (typeof TRANSFORM_FIELDS)[number],
): Vec3 | undefined {
  return resolveValue(doc, stateId, nodeId, `transform.${field}`) as
    | Vec3
    | undefined;
}

export function setTransform(nodeId: string, t: Transform, opts?: DispatchOpts) {
  const doc = useDoc.getState().doc;
  const active = activeOverrideState();
  // edits to the active state's owner record overrides; other nodes edit base
  if (doc && active?.nodeId === nodeId) {
    // record only the fields that actually moved as state overrides
    const entries: Record<string, PropertyValue> = {};
    for (const field of TRANSFORM_FIELDS) {
      const current = effectiveTransformField(doc, active.stateId, nodeId, field);
      if (current && !vec3Equal(current, t[field])) {
        entries[`transform.${field}`] = [...t[field]];
      }
    }
    if (Object.keys(entries).length > 0) {
      writeOverrides(active.stateId, nodeId, entries, opts, "Transform");
    }
    return;
  }
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
  const doc = useDoc.getState().doc;
  const active = activeOverrideState();
  if (doc && active?.nodeId === nodeId) {
    const current = effectiveTransformField(doc, active.stateId, nodeId, field);
    if (!current) return;
    const next: Vec3 = [...current];
    next[axis] = value;
    writeOverrides(
      active.stateId,
      nodeId,
      { [`transform.${field}`]: next },
      opts,
      "Transform",
    );
    return;
  }
  dispatch(
    "Transform",
    (d) => {
      const node = d.nodes[nodeId];
      if (node) node.transform[field][axis] = value;
    },
    opts,
  );
}

/** all nodes in one undo entry; active-state owner (at most one — states are per-object) routes via setTransform's override path as its own entry */
export function setTransforms(
  entries: { nodeId: string; t: Transform }[],
  opts?: DispatchOpts,
) {
  const active = activeOverrideState();
  const owner = active ? entries.find((e) => e.nodeId === active.nodeId) : undefined;
  if (owner) setTransform(owner.nodeId, owner.t, opts);
  const base = entries.filter((e) => e !== owner);
  if (base.length === 0) return;
  dispatch(
    "Transform",
    (d) => {
      for (const { nodeId, t } of base) {
        const node = d.nodes[nodeId];
        if (!node) continue;
        node.transform = {
          position: [...t.position],
          rotation: [...t.rotation],
          scale: [...t.scale],
        };
      }
    },
    opts,
  );
}

/** setTransformComponent across many nodes, one undo entry (same owner-state split as setTransforms) */
export function setTransformComponentMany(
  nodeIds: string[],
  field: "position" | "rotation" | "scale",
  axis: 0 | 1 | 2,
  value: number,
  opts?: DispatchOpts,
) {
  const active = activeOverrideState();
  const ownerId = active && nodeIds.includes(active.nodeId) ? active.nodeId : null;
  if (ownerId) setTransformComponent(ownerId, field, axis, value, opts);
  const base = nodeIds.filter((id) => id !== ownerId);
  if (base.length === 0) return;
  dispatch(
    "Transform",
    (d) => {
      for (const id of base) {
        const node = d.nodes[id];
        if (node) node.transform[field][axis] = value;
      }
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
      // editable-mesh cages have no .params — nothing to set (phase 2: cage editing)
      if (node?.type === "mesh" && node.geometry.kind !== "editableMesh")
        node.geometry.params[key] = value;
    },
    opts,
  );
}

export function duplicateNode(nodeId: string): string | null {
  return duplicateNodes([nodeId])[0] ?? null;
}

export function duplicateNodes(nodeIds: string[]): string[] {
  if (!requireBaseState("duplicate objects")) return [];
  const doc = useDoc.getState().doc;
  if (!doc) return [];
  const roots = topMostIds(doc, nodeIds);
  if (roots.length === 0) return [];

  const sets = roots.map((nodeId) => {
    const idMap = new Map<string, string>();
    for (const id of subtreeIds(doc, nodeId)) idMap.set(id, newId("nd"));
    const clones: ChibiNode[] = subtreeIds(doc, nodeId).map((id) => {
      const original = doc.nodes[id];
      const clone = structuredClone(original) as ChibiNode;
      clone.id = idMap.get(id)!;
      clone.children = original.children.map((cid) => idMap.get(cid)!);
      return clone;
    });
    return {
      srcId: nodeId,
      rootId: idMap.get(nodeId)!,
      baseName: doc.nodes[nodeId].name.replace(/ \d+$/, ""),
      clones,
    };
  });

  dispatch("Duplicate", (d) => {
    for (const { srcId, rootId, baseName, clones } of sets) {
      for (const clone of clones) d.nodes[clone.id] = clone;
      d.nodes[rootId].name = uniqueName(d, baseName);
      const parentId = findParentId(d, srcId);
      const siblings = siblingsOf(d, parentId);
      const idx = siblings.indexOf(srcId);
      siblings.splice(idx + 1, 0, rootId);
    }
  });
  useUI.getState().selectMany(sets.map((s) => s.rootId));
  return sets.map((s) => s.rootId);
}

function localMatrixOf(node: ChibiNode): Matrix4 {
  const t = node.transform;
  return new Matrix4().compose(
    new Vector3(...t.position),
    new Quaternion().setFromEuler(new Euler(...t.rotation, "XYZ")),
    new Vector3(...t.scale),
  );
}

/** base-transform world matrix composed from the document tree (no state overrides) */
function worldMatrixOf(doc: ChibiDocument, nodeId: string): Matrix4 {
  const m = localMatrixOf(doc.nodes[nodeId]);
  for (let p = findParentId(doc, nodeId); p; p = findParentId(doc, p)) {
    m.premultiply(localMatrixOf(doc.nodes[p]));
  }
  return m;
}

function transformFromMatrix(m: Matrix4): Transform {
  const p = new Vector3();
  const q = new Quaternion();
  const s = new Vector3();
  m.decompose(p, q, s);
  const e = new Euler().setFromQuaternion(q, "XYZ");
  return {
    position: [p.x, p.y, p.z],
    rotation: [e.x, e.y, e.z],
    scale: [s.x, s.y, s.z],
  };
}

/** root-first ancestors (excluding the node itself) */
function ancestorPath(doc: ChibiDocument, nodeId: string): string[] {
  const path: string[] = [];
  for (let p = findParentId(doc, nodeId); p; p = findParentId(doc, p)) {
    path.unshift(p);
  }
  return path;
}

function commonAncestorId(doc: ChibiDocument, ids: string[]): string | null {
  const paths = ids.map((id) => ancestorPath(doc, id));
  let common: string | null = null;
  for (let i = 0; ; i++) {
    const candidate = paths[0][i];
    if (candidate === undefined) break;
    if (paths.some((p) => p[i] !== candidate)) break;
    common = candidate;
  }
  return common;
}

/**
 * Wraps top-most selected nodes in one group under their deepest common
 * ancestor; pivot = world centroid, member transforms recomputed so nothing
 * moves (TRS decompose can't express shear -> rotated non-uniform-scaled
 * parents may drift slightly, same limit as every TRS editor).
 */
export function groupNodes(nodeIds: string[]): string | null {
  const doc = useDoc.getState().doc;
  if (!doc) return null;
  const roots = topMostIds(doc, nodeIds);
  if (roots.length === 0) return null;
  if (roots.length === 1) return groupNode(roots[0]);
  if (!requireBaseState("group objects")) return null;

  const parentId = commonAncestorId(doc, roots);
  const parentWorld = parentId ? worldMatrixOf(doc, parentId) : new Matrix4();
  const worlds = new Map(roots.map((id) => [id, worldMatrixOf(doc, id)]));
  const centroid = new Vector3();
  for (const m of worlds.values()) {
    centroid.add(new Vector3().setFromMatrixPosition(m));
  }
  centroid.divideScalar(roots.length);
  const localPos = centroid.clone().applyMatrix4(parentWorld.clone().invert());
  const groupWorldInverse = parentWorld
    .clone()
    .multiply(new Matrix4().makeTranslation(localPos.x, localPos.y, localPos.z))
    .invert();
  const childTransforms = new Map(
    roots.map((id) => [
      id,
      transformFromMatrix(groupWorldInverse.clone().multiply(worlds.get(id)!)),
    ]),
  );

  const groupId = newId("nd");
  dispatch("Group", (d) => {
    // group lands in first root's slot if direct child of common parent, else appended
    const firstIdx = siblingsOf(d, parentId).indexOf(roots[0]);
    for (const id of roots) {
      const sibs = siblingsOf(d, findParentId(d, id));
      const i = sibs.indexOf(id);
      if (i >= 0) sibs.splice(i, 1);
    }
    const group: GroupNode = {
      id: groupId,
      name: uniqueName(d, "Group"),
      type: "group",
      transform: {
        position: [localPos.x, localPos.y, localPos.z],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      visible: true,
      children: [...roots],
    };
    d.nodes[groupId] = group;
    for (const id of roots) d.nodes[id].transform = childTransforms.get(id)!;
    const target = siblingsOf(d, parentId);
    target.splice(firstIdx >= 0 ? Math.min(firstIdx, target.length) : target.length, 0, groupId);
  });
  useUI.getState().select(groupId);
  return groupId;
}

export function groupNode(nodeId: string): string | null {
  if (!requireBaseState("group objects")) return null;
  const doc = useDoc.getState().doc;
  if (!doc?.nodes[nodeId]) return null;
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
  return groupId;
}

export function reparentNode(
  nodeId: string,
  newParentId: string | null,
  index: number,
) {
  if (!requireBaseState("reparent objects")) return;
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
