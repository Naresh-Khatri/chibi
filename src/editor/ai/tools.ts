import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  BASE_STATE_ID,
  GEOMETRY_KINDS,
  LIGHT_KINDS,
  ENVIRONMENT_PRESETS,
  TONE_MAPPINGS,
  type ChibiDocument,
  type Transform,
  type Vec3,
} from "@/runtime/schema";
import { useDoc, withLabelPrefix } from "../store/document";
import { useUI } from "../store/ui";
import {
  addGroupNode,
  addLightNode,
  addMeshNode,
  duplicateNode,
  groupNode,
  removeNode,
  reparentNode,
  setGeometryParam,
  setNodeName,
  setNodeShadow,
  setNodeVisible,
  setTransform,
} from "../store/commands";
import {
  addEditableMeshNode,
  convertToEditableMesh,
  setSubdivisions,
} from "../store/meshCommands";
import {
  addMaterial,
  assignMaterial,
  setDocumentName,
  setEnvironment,
  setLightProp,
  setMaterialProp,
} from "../store/materialCommands";
import { buildSceneContext, partHint } from "./context";

const AI_LABEL_PREFIX = "AI: ";

/** run a command with AI-labeled undo entries */
function ai<T>(fn: () => T): T {
  return withLabelPrefix(AI_LABEL_PREFIX, fn);
}

function getDoc(): ChibiDocument {
  const doc = useDoc.getState().doc;
  if (!doc) throw new Error("No document loaded");
  return doc;
}

function getNodeOrThrow(doc: ChibiDocument, nodeId: string) {
  const node = doc.nodes[nodeId];
  if (!node) throw new Error(`No node with id "${nodeId}"`);
  return node;
}

// meshes and split model parts (model nodes with `path`) take chibi
// materials; whole GLB models render their embedded materials until split
function assertMaterialTarget(doc: ChibiDocument, nodeId: string) {
  const node = getNodeOrThrow(doc, nodeId);
  if (node.type === "mesh") return;
  if (node.type === "model" && node.path !== undefined) return;
  throw new Error(
    node.type === "model"
      ? `${nodeId} is a whole GLB model — its embedded materials render as-is. The user must split it first (Inspector → "Split into objects"); the resulting parts accept materials.`
      : `${nodeId} is a ${node.type} — only meshes and split model parts take materials`,
  );
}

// mirror of requireBaseState that raises instead of toasting, so refusals
// come back to the model as is_error tool results it can self-correct on
function assertBaseState(what: string) {
  const ui = useUI.getState();
  if (ui.activeStateId === BASE_STATE_ID) return;
  const state = useDoc.getState().doc?.states[ui.activeStateId];
  throw new Error(
    `Cannot ${what} while object state "${state?.name ?? ui.activeStateId}" is active — structural edits require the Base state. Ask the user to return to Base (the chip in the toolbar), or explain this limitation.`,
  );
}

const vec3 = z
  .array(z.number())
  .length(3)
  .describe("[x, y, z]");

const asVec3 = (v: number[]): Vec3 => [v[0], v[1], v[2]];

const transformInput = z.object({
  position: vec3.optional(),
  rotation: vec3.optional().describe("Euler XYZ radians"),
  scale: vec3.optional(),
});

type TransformInput = z.infer<typeof transformInput>;

function mergedTransform(current: Transform, t: TransformInput): Transform {
  return {
    position: t.position ? asVec3(t.position) : current.position,
    rotation: t.rotation ? asVec3(t.rotation) : current.rotation,
    scale: t.scale ? asVec3(t.scale) : current.scale,
  };
}

function applyTransform(nodeId: string, t: TransformInput) {
  const node = getNodeOrThrow(getDoc(), nodeId);
  ai(() => setTransform(nodeId, mergedTransform(node.transform, t)));
}

const materialProps = z.object({
  name: z.string().optional(),
  color: z.string().optional().describe("hex, e.g. #ff3311"),
  metalness: z.number().min(0).max(1).optional(),
  roughness: z.number().min(0).max(1).optional(),
  emissive: z.string().optional().describe("hex emissive color"),
  emissiveIntensity: z.number().min(0).optional(),
  opacity: z.number().min(0).max(1).optional(),
  transparent: z.boolean().optional(),
  flatShading: z.boolean().optional(),
  clearcoat: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("soft plastic/clay sheen layer"),
  clearcoatRoughness: z.number().min(0).max(1).optional(),
  sheen: z.number().min(0).max(1).optional().describe("fabric-like rim softness"),
  sheenColor: z.string().optional().describe("hex sheen tint"),
});

/** strip zod-undefined keys so partial updates stay partial */
function defined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

export function buildTools(): ToolSet {
  return {
    // ---- read tools (no dispatch) ----
    get_scene: tool({
      description:
        "Fresh compact snapshot of the whole document (nodes, materials, states, selection). Use after several edits or when unsure of current values.",
      inputSchema: z.object({}),
      execute: async () => buildSceneContext(),
    }),

    get_node: tool({
      description:
        "Full JSON for one node. Split model parts include a partHint (embedded material name/color, size) to identify generically named parts.",
      inputSchema: z.object({ nodeId: z.string() }),
      execute: async ({ nodeId }) => {
        const node = getNodeOrThrow(getDoc(), nodeId);
        if (node.type === "model" && node.path !== undefined) {
          const hint = partHint(node);
          if (hint) return { ...node, partHint: hint };
        }
        return node;
      },
    }),

    get_material: tool({
      description: "Full JSON for one material.",
      inputSchema: z.object({ materialId: z.string() }),
      execute: async ({ materialId }) => {
        const material = getDoc().materials[materialId];
        if (!material) throw new Error(`No material with id "${materialId}"`);
        return material;
      },
    }),

    find_nodes: tool({
      description:
        "Find nodes by name substring and/or type. Returns id/name/type list; split model parts include a hint (embedded material name/color, size) to identify generically named parts.",
      inputSchema: z.object({
        query: z.string().optional().describe("case-insensitive name substring"),
        type: z.enum(["mesh", "group", "light", "model"]).optional(),
      }),
      execute: async ({ query, type }) => {
        const q = query?.toLowerCase();
        return Object.values(getDoc().nodes)
          .filter(
            (n) =>
              (!q || n.name.toLowerCase().includes(q)) &&
              (!type || n.type === type),
          )
          .map((n) => {
            const hint =
              n.type === "model" && n.path !== undefined ? partHint(n) : undefined;
            return { id: n.id, name: n.name, type: n.type, ...(hint && { hint }) };
          });
      },
    }),

    select_nodes: tool({
      description:
        "Highlight nodes in the editor (viewport + hierarchy). UI-only: not undoable, does not change the document.",
      inputSchema: z.object({ nodeIds: z.array(z.string()) }),
      execute: async ({ nodeIds }) => {
        const doc = getDoc();
        const valid = nodeIds.filter((id) => doc.nodes[id]);
        useUI.getState().selectMany(valid);
        return {
          selected: valid,
          summary: `selected ${valid.length} node(s)`,
        };
      },
    }),

    // ---- write tools (1:1 over commands) ----
    add_mesh: tool({
      description:
        "Add a mesh node with default geometry and the shared default material, then optionally name/place/assign it.",
      inputSchema: z.object({
        kind: z.enum(GEOMETRY_KINDS),
        name: z.string().optional(),
        transform: transformInput.optional(),
        materialId: z.string().optional(),
      }),
      execute: async ({ kind, name, transform, materialId }) => {
        assertBaseState("add objects");
        if (materialId && !getDoc().materials[materialId]) {
          throw new Error(`No material with id "${materialId}"`);
        }
        const id = ai(() => addMeshNode(kind));
        if (!id) throw new Error("add_mesh was refused by the editor");
        if (name) ai(() => setNodeName(id, name));
        if (transform) applyTransform(id, transform);
        if (materialId) ai(() => assignMaterial(id, materialId));
        const node = getNodeOrThrow(getDoc(), id);
        return { nodeId: id, summary: `created ${kind} "${node.name}" (${id})` };
      },
    }),

    add_light: tool({
      description: "Add a light node (sensible preset), then optionally adjust.",
      inputSchema: z.object({
        kind: z.enum(LIGHT_KINDS),
        name: z.string().optional(),
        transform: transformInput.optional(),
        color: z.string().optional().describe("hex"),
        intensity: z.number().optional(),
      }),
      execute: async ({ kind, name, transform, color, intensity }) => {
        assertBaseState("add lights");
        const id = ai(() => addLightNode(kind));
        if (!id) throw new Error("add_light was refused by the editor");
        if (name) ai(() => setNodeName(id, name));
        if (transform) applyTransform(id, transform);
        if (color !== undefined || intensity !== undefined) {
          ai(() => setLightProp(id, defined({ color, intensity })));
        }
        const node = getNodeOrThrow(getDoc(), id);
        return { nodeId: id, summary: `created ${kind} light "${node.name}" (${id})` };
      },
    }),

    add_group: tool({
      description: "Add an empty group node.",
      inputSchema: z.object({
        name: z.string().optional(),
        transform: transformInput.optional(),
      }),
      execute: async ({ name, transform }) => {
        assertBaseState("add groups");
        const id = ai(() => addGroupNode());
        if (!id) throw new Error("add_group was refused by the editor");
        if (name) ai(() => setNodeName(id, name));
        if (transform) applyTransform(id, transform);
        return { nodeId: id, summary: `created group ${id}` };
      },
    }),

    remove_node: tool({
      description: "Delete a node and its whole subtree.",
      inputSchema: z.object({ nodeId: z.string() }),
      execute: async ({ nodeId }) => {
        assertBaseState("delete objects");
        const node = getNodeOrThrow(getDoc(), nodeId);
        ai(() => removeNode(nodeId));
        return { removed: nodeId, summary: `deleted "${node.name}"` };
      },
    }),

    duplicate_node: tool({
      description: "Duplicate a node (with subtree). Returns the new node id.",
      inputSchema: z.object({ nodeId: z.string() }),
      execute: async ({ nodeId }) => {
        assertBaseState("duplicate objects");
        getNodeOrThrow(getDoc(), nodeId);
        const id = ai(() => duplicateNode(nodeId));
        if (!id) throw new Error("duplicate_node was refused by the editor");
        return { nodeId: id, summary: `duplicated ${nodeId} -> ${id}` };
      },
    }),

    reparent_node: tool({
      description:
        "Move a node under a new parent (null = scene root) at the given child index.",
      inputSchema: z.object({
        nodeId: z.string(),
        newParentId: z.string().nullable(),
        index: z.number().int().min(0).default(0),
      }),
      execute: async ({ nodeId, newParentId, index }) => {
        assertBaseState("reparent objects");
        const doc = getDoc();
        getNodeOrThrow(doc, nodeId);
        if (newParentId) getNodeOrThrow(doc, newParentId);
        ai(() => reparentNode(nodeId, newParentId, index));
        return {
          nodeId,
          summary: `moved ${nodeId} under ${newParentId ?? "root"}`,
        };
      },
    }),

    group_node: tool({
      description:
        "Wrap a node in a new group (the group takes over its transform).",
      inputSchema: z.object({ nodeId: z.string() }),
      execute: async ({ nodeId }) => {
        assertBaseState("group objects");
        getNodeOrThrow(getDoc(), nodeId);
        const id = ai(() => groupNode(nodeId));
        if (!id) throw new Error("group_node was refused by the editor");
        return { groupId: id, summary: `grouped ${nodeId} into ${id}` };
      },
    }),

    set_transform: tool({
      description:
        "Set position/rotation/scale (any subset) of a node. Radians, [x,y,z].",
      inputSchema: z.object({
        nodeId: z.string(),
        position: vec3.optional(),
        rotation: vec3.optional(),
        scale: vec3.optional(),
      }),
      execute: async ({ nodeId, ...t }) => {
        applyTransform(nodeId, t);
        return { nodeId, summary: `transformed ${nodeId}` };
      },
    }),

    set_node_name: tool({
      description: "Rename a node.",
      inputSchema: z.object({ nodeId: z.string(), name: z.string().min(1) }),
      execute: async ({ nodeId, name }) => {
        getNodeOrThrow(getDoc(), nodeId);
        ai(() => setNodeName(nodeId, name));
        return { nodeId, summary: `renamed ${nodeId} to "${name}"` };
      },
    }),

    set_node_visible: tool({
      description: "Show or hide a node.",
      inputSchema: z.object({ nodeId: z.string(), visible: z.boolean() }),
      execute: async ({ nodeId, visible }) => {
        getNodeOrThrow(getDoc(), nodeId);
        ai(() => setNodeVisible(nodeId, visible));
        return { nodeId, summary: `${visible ? "showed" : "hid"} ${nodeId}` };
      },
    }),

    set_node_shadow: tool({
      description: "Toggle castShadow/receiveShadow on a mesh or model node.",
      inputSchema: z.object({
        nodeId: z.string(),
        key: z.enum(["castShadow", "receiveShadow"]),
        value: z.boolean(),
      }),
      execute: async ({ nodeId, key, value }) => {
        const node = getNodeOrThrow(getDoc(), nodeId);
        if (node.type !== "mesh" && node.type !== "model") {
          throw new Error(`${nodeId} is a ${node.type}; shadows apply to mesh/model nodes`);
        }
        ai(() => setNodeShadow(nodeId, key, value));
        return { nodeId, summary: `set ${key}=${value} on ${nodeId}` };
      },
    }),

    set_geometry_param: tool({
      description:
        "Set one geometry parameter of a mesh (see the node's geometry.params for keys).",
      inputSchema: z.object({
        nodeId: z.string(),
        key: z.string(),
        value: z.union([z.number(), z.string()]),
      }),
      execute: async ({ nodeId, key, value }) => {
        const node = getNodeOrThrow(getDoc(), nodeId);
        if (node.type !== "mesh") {
          throw new Error(`${nodeId} is a ${node.type}, not a mesh`);
        }
        if (node.geometry.kind === "editableMesh") {
          throw new Error(
            `${nodeId} is an editable-mesh cage, not a parametric primitive — it has no geometry params to set`,
          );
        }
        if (!(key in node.geometry.params)) {
          throw new Error(
            `"${key}" is not a param of ${node.geometry.kind} (has: ${Object.keys(node.geometry.params).join(", ")})`,
          );
        }
        ai(() => setGeometryParam(nodeId, key, value));
        return { nodeId, summary: `set ${key}=${value} on ${nodeId}` };
      },
    }),

    add_editable_mesh: tool({
      description:
        "Create a mesh from a hand-authored subdivision-surface control cage — for organic/bespoke shapes no primitive combination can make. Author a LOW-POLY cage (8-60 verts): flat positions [x,y,z,...] in local space, faces as polygon loops of vertex indices (quads preferred), each wound counter-clockwise seen from OUTSIDE, with neighboring faces sharing vertex indices (welded, watertight unless an open surface is wanted). Catmull-Clark smooths it at render time via subdivisions — never densify the cage by hand.",
      inputSchema: z.object({
        name: z.string().optional(),
        positions: z
          .array(z.number())
          .describe("flat [x,y,z,...] local-space vertex positions"),
        faces: z
          .array(z.array(z.number().int().min(0)).min(3))
          .min(1)
          .describe("polygon loops (quads preferred), CCW seen from outside"),
        subdivisions: z.number().int().min(0).max(4).default(1),
        transform: transformInput.optional(),
        materialId: z.string().optional(),
      }),
      execute: async ({ name, positions, faces, subdivisions, transform, materialId }) => {
        assertBaseState("add objects");
        if (positions.length < 9 || positions.length % 3 !== 0) {
          throw new Error(
            "positions must be a flat [x,y,z,...] array of at least 3 vertices (length divisible by 3)",
          );
        }
        const vertexCount = positions.length / 3;
        for (const face of faces) {
          for (const vi of face) {
            if (vi >= vertexCount) {
              throw new Error(
                `face [${face.join(",")}] references vertex ${vi} but there are only ${vertexCount} vertices`,
              );
            }
          }
          if (new Set(face).size !== face.length) {
            throw new Error(`face [${face.join(",")}] repeats a vertex`);
          }
        }
        if (materialId && !getDoc().materials[materialId]) {
          throw new Error(`No material with id "${materialId}"`);
        }
        const id = ai(() => addEditableMeshNode({ positions, faces }, subdivisions));
        if (!id) throw new Error("add_editable_mesh was refused by the editor");
        if (name) ai(() => setNodeName(id, name));
        if (transform) applyTransform(id, transform);
        if (materialId) ai(() => assignMaterial(id, materialId));
        return {
          nodeId: id,
          summary: `created editable mesh ${id} (${vertexCount}v/${faces.length}f, subdivisions ${subdivisions})`,
        };
      },
    }),

    convert_to_editable_mesh: tool({
      description:
        "Convert a parametric primitive mesh into an editable subdivision-surface cage (destructive: its geometry params are dropped, undo to revert). Works for box/plane/cylinder/cone/sphere/torus; capsule and text3d have no cage generator. The node keeps its transform/material; smoothing is controlled by set_subdivisions afterward.",
      inputSchema: z.object({ nodeId: z.string() }),
      execute: async ({ nodeId }) => {
        assertBaseState("convert to editable mesh");
        const node = getNodeOrThrow(getDoc(), nodeId);
        if (node.type !== "mesh") {
          throw new Error(`${nodeId} is a ${node.type}, not a mesh`);
        }
        if (node.geometry.kind === "editableMesh") {
          throw new Error(`${nodeId} is already an editable mesh`);
        }
        if (node.geometry.kind === "capsule" || node.geometry.kind === "text3d") {
          throw new Error(
            `${node.geometry.kind} has no cage generator — only box/plane/cylinder/cone/sphere/torus convert`,
          );
        }
        ai(() => convertToEditableMesh(nodeId));
        const after = getNodeOrThrow(getDoc(), nodeId);
        if (after.type !== "mesh" || after.geometry.kind !== "editableMesh") {
          throw new Error("conversion was refused by the editor");
        }
        return {
          nodeId,
          vertices: after.geometry.positions.length / 3,
          faces: after.geometry.faces.length,
          subdivisions: after.geometry.subdivisions,
          summary: `converted ${nodeId} to an editable-mesh cage`,
        };
      },
    }),

    set_subdivisions: tool({
      description:
        "Set the render-time Catmull-Clark subdivision level (0-4) of an editable-mesh node. 0 shows the faceted cage; 1-2 is usually enough for smooth organic shapes.",
      inputSchema: z.object({
        nodeId: z.string(),
        level: z.number().int().min(0).max(4),
      }),
      execute: async ({ nodeId, level }) => {
        const node = getNodeOrThrow(getDoc(), nodeId);
        if (node.type !== "mesh" || node.geometry.kind !== "editableMesh") {
          throw new Error(
            `${nodeId} is not an editable mesh — convert_to_editable_mesh first`,
          );
        }
        ai(() => setSubdivisions(nodeId, level));
        return { nodeId, summary: `set subdivisions=${level} on ${nodeId}` };
      },
    }),

    add_material: tool({
      description:
        "Create a new material (optionally assigning it to a mesh or split model part and setting props in one go). Prefer editing/reusing existing materials.",
      inputSchema: z.object({
        assignToNodeId: z.string().optional(),
        props: materialProps.optional(),
      }),
      execute: async ({ assignToNodeId, props }) => {
        assertBaseState("add materials");
        if (assignToNodeId) assertMaterialTarget(getDoc(), assignToNodeId);
        const id = ai(() => addMaterial(assignToNodeId));
        if (props) {
          ai(() => setMaterialProp(id, defined(props)));
        }
        return { materialId: id, summary: `created material ${id}` };
      },
    }),

    assign_material: tool({
      description:
        "Assign an existing material to a mesh node or a split model part. Pass materialId null on a part to restore its embedded GLB material.",
      inputSchema: z.object({ nodeId: z.string(), materialId: z.string().nullable() }),
      execute: async ({ nodeId, materialId }) => {
        assertBaseState("assign materials");
        const doc = getDoc();
        assertMaterialTarget(doc, nodeId);
        if (materialId === null) {
          if (doc.nodes[nodeId].type !== "model") {
            throw new Error("materialId null only clears a model part's override — meshes always need a material");
          }
        } else if (!doc.materials[materialId]) {
          throw new Error(`No material with id "${materialId}"`);
        }
        ai(() => assignMaterial(nodeId, materialId));
        return {
          nodeId,
          materialId,
          summary:
            materialId === null
              ? `restored embedded material on ${nodeId}`
              : `assigned ${materialId} to ${nodeId}`,
        };
      },
    }),

    set_material_props: tool({
      description:
        "Update properties of an existing material (batched). Affects every mesh using it.",
      inputSchema: z.object({ materialId: z.string(), props: materialProps }),
      execute: async ({ materialId, props }) => {
        if (!getDoc().materials[materialId]) {
          throw new Error(`No material with id "${materialId}"`);
        }
        const updates = defined(props);
        if (Object.keys(updates).length === 0) {
          throw new Error("props is empty — nothing to update");
        }
        ai(() => setMaterialProp(materialId, updates));
        return {
          materialId,
          summary: `updated ${Object.keys(updates).join(", ")} on ${materialId}`,
        };
      },
    }),

    set_environment: tool({
      description:
        "Update scene environment (background, preset, fog, shadows, exposure, tone mapping, postprocessing). Preset 'soft' is a built-in soft studio rig — pair with softShadows+contactShadows+ao, toneMapping 'neutral' and a warm background for a clay look.",
      inputSchema: z.object({
        background: z.string().optional().describe("hex color"),
        backgroundGradient: z
          .string()
          .nullable()
          .optional()
          .describe(
            "hex color; when set the background becomes a radial gradient from `background` at the center to this at the edges",
          ),
        preset: z.enum(ENVIRONMENT_PRESETS).nullable().optional(),
        fog: z
          .object({ color: z.string(), near: z.number(), far: z.number() })
          .nullable()
          .optional(),
        shadows: z.boolean().optional(),
        exposure: z.number().min(0.1).max(2.5).optional(),
        softShadows: z.boolean().optional().describe("softer filtered shadow edges"),
        contactShadows: z
          .boolean()
          .optional()
          .describe("soft ambient shadow plane under the scene"),
        toneMapping: z
          .enum(TONE_MAPPINGS)
          .optional()
          .describe("aces (filmic), neutral (keeps pastel colors true), agx (softest)"),
        ao: z
          .boolean()
          .optional()
          .describe("screen-space ambient occlusion — darkens crevices and contacts"),
        bloom: z.boolean().optional().describe("subtle glow on bright surfaces"),
        vignette: z.boolean().optional().describe("subtle edge darkening"),
      }),
      execute: async (input) => {
        const updates = defined(input);
        if (Object.keys(updates).length === 0) {
          throw new Error("nothing to update");
        }
        ai(() => setEnvironment(updates));
        return { summary: `updated environment ${Object.keys(updates).join(", ")}` };
      },
    }),

    set_document_name: tool({
      description: "Rename the scene/document.",
      inputSchema: z.object({ name: z.string().min(1) }),
      execute: async ({ name }) => {
        ai(() => setDocumentName(name));
        return { summary: `renamed document to "${name}"` };
      },
    }),
  };
}

// used by the chat UI for chips; write tools are the ones that touch the doc
export const READ_TOOL_NAMES = new Set([
  "get_scene",
  "get_node",
  "get_material",
  "find_nodes",
  "select_nodes",
]);
