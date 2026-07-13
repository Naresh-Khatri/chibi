import {
  applyLoopCut,
  buildTopology,
  cageFromGeometry,
  computeEdgeLoop,
  deleteFaces,
  extrudeFaces,
  subdivideCatmullClark,
  type Cage,
} from "@/runtime/mesh";
import {
  DEFAULT_MATERIAL_ID,
  newId,
  type ChibiDocument,
  type MeshNode,
  type Vec3,
} from "@/runtime/schema";
import { useDoc, type DispatchOpts } from "./document";
import { useUI } from "./ui";
import { identityTransform, uniqueName } from "./commands";
import { requireBaseState } from "./stateCommands";

function dispatch(
  label: string,
  recipe: (draft: ChibiDocument) => void,
  opts?: DispatchOpts,
) {
  useDoc.getState().dispatch(label, recipe, opts);
}

/** parametric primitive -> low-poly cage, destructive like Spline's convert */
export function convertToEditableMesh(nodeId: string): void {
  if (!requireBaseState("convert to editable mesh")) return;
  const doc = useDoc.getState().doc;
  const node = doc?.nodes[nodeId];
  if (!node || node.type !== "mesh" || node.geometry.kind === "editableMesh") return;

  const cage = cageFromGeometry(node.geometry.kind, node.geometry.params);
  if (!cage) {
    useUI.getState().showToast(`Can't convert ${node.geometry.kind} to editable mesh`);
    return;
  }
  dispatch("Convert to editable mesh", (d) => {
    const n = d.nodes[nodeId];
    if (n?.type !== "mesh") return;
    n.geometry = {
      kind: "editableMesh",
      positions: cage.positions,
      faces: cage.faces,
      subdivisions: 1,
      // primitive creases (box edges, cylinder rims) -> converting doesn't
      // visibly change the shape; un-sharpen edges to opt into rounding
      sharpEdges: cage.sharpEdges ?? [],
    };
  });
}

/**
 * Create a mesh node directly from a hand-authored cage — the AI authoring
 * path (add_editable_mesh tool). Humans get cages via convertToEditableMesh;
 * there's no editor UI for raw cage input. Mirrors addMeshNode's shape.
 */
export function addEditableMeshNode(cage: Cage, subdivisions = 1): string | null {
  if (!requireBaseState("add objects")) return null;
  const id = newId("nd");
  const level = Math.max(0, Math.min(4, Math.round(subdivisions)));
  dispatch("Add editable mesh", (d) => {
    const node: MeshNode = {
      id,
      name: uniqueName(d, "Editable Mesh"),
      type: "mesh",
      geometry: {
        kind: "editableMesh",
        positions: cage.positions.slice(),
        faces: cage.faces.map((f) => f.slice()),
        subdivisions: level,
        sharpEdges: cage.sharpEdges?.slice() ?? [],
      },
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

/** render-time modifier level (slider) — merge-keyed for scrub */
export function setSubdivisions(
  nodeId: string,
  level: number,
  opts?: DispatchOpts,
): void {
  const clamped = Math.max(0, Math.min(4, Math.round(level)));
  dispatch(
    "Subdivision level",
    (d) => {
      const node = d.nodes[nodeId];
      if (node?.type !== "mesh" || node.geometry.kind !== "editableMesh") return;
      node.geometry.subdivisions = clamped;
    },
    opts,
  );
}

// Catmull-Clark runs synchronously on the main thread and each bake ~4x's
// the face count, so an unbounded chain of clicks freezes the tab.
const MAX_BAKED_FACES = 4096;

/**
 * destructive: bakes CC steps into the stored cage, base-only. Bakes
 * `geometry.subdivisions` steps at once (min 1) instead of a fixed single
 * step, so dragging the Level slider up and clicking once commits the whole
 * previewed amount — no more clicking once per level to "update" the base
 * subdivision to what's already being previewed.
 */
export function increaseBaseSubdivision(nodeId: string): void {
  if (!requireBaseState("increase base subdivision")) return;
  const doc = useDoc.getState().doc;
  const node = doc?.nodes[nodeId];
  if (!node || node.type !== "mesh" || node.geometry.kind !== "editableMesh") return;
  const steps = Math.max(1, node.geometry.subdivisions);
  if (node.geometry.faces.length * 4 ** steps > MAX_BAKED_FACES) {
    useUI.getState().showToast("Cage is too dense to subdivide further");
    return;
  }
  dispatch("Increase base subdivision", (d) => {
    const node = d.nodes[nodeId];
    if (node?.type !== "mesh" || node.geometry.kind !== "editableMesh") return;
    const geo = node.geometry;
    const baked = subdivideCatmullClark(
      { positions: geo.positions, faces: geo.faces, sharpEdges: geo.sharpEdges },
      steps,
    );
    geo.positions = baked.positions;
    geo.faces = baked.faces;
    geo.sharpEdges = baked.sharpEdges ?? [];
    // the modifier level already showed this smoothing live — consume the
    // baked steps so baking denser geometry doesn't also visibly
    // double-smooth the result
    geo.subdivisions = Math.max(0, geo.subdivisions - steps);
  });
}

/**
 * Mesh-edit gizmo commit — absolute-position write, single write path for
 * translate/rotate/scale alike (rotate/scale produce non-uniform per-vertex
 * deltas, so "absolute new position" is the only shape that fits all three).
 * vertexIndices/newLocalPositions are parallel arrays.
 */
export function setElementPositions(
  nodeId: string,
  vertexIndices: number[],
  newLocalPositions: Vec3[],
  opts?: DispatchOpts,
): void {
  if (!requireBaseState("edit mesh")) return;
  dispatch(
    "Edit mesh",
    (d) => {
      const node = d.nodes[nodeId];
      if (node?.type !== "mesh" || node.geometry.kind !== "editableMesh") return;
      const positions = node.geometry.positions;
      for (let i = 0; i < vertexIndices.length; i++) {
        const vi = vertexIndices[i];
        const p = newLocalPositions[i];
        if (!p || vi * 3 + 2 >= positions.length || vi < 0) continue;
        positions[vi * 3] = p[0];
        positions[vi * 3 + 1] = p[1];
        positions[vi * 3 + 2] = p[2];
      }
    },
    opts,
  );
}

/**
 * Face-mode extrude: duplicates every vertex the selected region touches at
 * the SAME position (distance 0 — the user drags the cap out afterward with
 * the existing move gizmo, matching Blender/Spline's extrude-then-move) and
 * walls the region's boundary edges. Reads the selection from the UI store
 * so the Inspector button / shortcut can call this with just a nodeId.
 * Auto-selects the new cap faces so the very next drag pulls the arm out.
 */
export function extrudeSelectedFaces(nodeId: string): void {
  if (!requireBaseState("extrude faces")) return;
  const doc = useDoc.getState().doc;
  const node = doc?.nodes[nodeId];
  if (!node || node.type !== "mesh" || node.geometry.kind !== "editableMesh") return;

  const faceIndices = [...useUI.getState().meshSelection.faces];
  if (faceIndices.length === 0) {
    useUI.getState().showToast("Select at least one face to extrude");
    return;
  }

  const { cage, newFaceIndices } = extrudeFaces(
    {
      positions: node.geometry.positions,
      faces: node.geometry.faces,
      sharpEdges: node.geometry.sharpEdges,
    },
    faceIndices,
  );
  dispatch("Extrude faces", (d) => {
    const n = d.nodes[nodeId];
    if (n?.type !== "mesh" || n.geometry.kind !== "editableMesh") return;
    n.geometry.positions = cage.positions;
    n.geometry.faces = cage.faces;
    n.geometry.sharpEdges = cage.sharpEdges ?? [];
  });
  useUI.getState().setMeshSelection({
    vertices: new Set(),
    edges: new Set(),
    faces: new Set(newFaceIndices),
  });
  // cap sits at distance 0 until dragged — without the move gizmo (hidden in
  // "select") the extrude is invisible, so force it on so the pull is possible
  if (useUI.getState().tool === "select") {
    useUI.getState().setTool("move");
  }
}

/**
 * Face-mode delete: removes the selected faces plus any vertex left
 * unreferenced, renumbering the rest. Clears the mesh selection afterward
 * since every surviving index just shifted underneath it.
 */
export function deleteSelectedFaces(nodeId: string): void {
  if (!requireBaseState("delete faces")) return;
  const doc = useDoc.getState().doc;
  const node = doc?.nodes[nodeId];
  if (!node || node.type !== "mesh" || node.geometry.kind !== "editableMesh") return;

  const faceIndices = [...useUI.getState().meshSelection.faces];
  if (faceIndices.length === 0) return;
  // schema requires faces.min(1) — an emptied cage fails validation on reload
  if (faceIndices.length >= node.geometry.faces.length) {
    useUI.getState().showToast("Can't delete every face — delete the object instead");
    return;
  }

  const cage = deleteFaces(
    {
      positions: node.geometry.positions,
      faces: node.geometry.faces,
      sharpEdges: node.geometry.sharpEdges,
    },
    faceIndices,
  );
  dispatch("Delete faces", (d) => {
    const n = d.nodes[nodeId];
    if (n?.type !== "mesh" || n.geometry.kind !== "editableMesh") return;
    n.geometry.positions = cage.positions;
    n.geometry.faces = cage.faces;
    n.geometry.sharpEdges = cage.sharpEdges ?? [];
  });
  useUI.getState().setMeshSelection({ vertices: new Set(), edges: new Set(), faces: new Set() });
}

/**
 * Loop cut: slice the quad ring seeded by `startEdgeKey`/`startFace` (edge
 * nearest the cursor). Cut tool previews the same ring, calls this on click.
 * Re-selects the new dividing edges (edge mode) and drops the cut tool so the
 * fresh cut is visible and immediately movable.
 */
export function loopCutMesh(nodeId: string, startFace: number, startEdgeKey: string): void {
  if (!requireBaseState("cut mesh")) return;
  const doc = useDoc.getState().doc;
  const node = doc?.nodes[nodeId];
  if (!node || node.type !== "mesh" || node.geometry.kind !== "editableMesh") return;

  const cage = {
    positions: node.geometry.positions,
    faces: node.geometry.faces,
    sharpEdges: node.geometry.sharpEdges,
  };
  const loop = computeEdgeLoop(buildTopology(cage), startFace, startEdgeKey);
  if (!loop || loop.faces.length === 0) {
    useUI.getState().showToast("Can't cut here — hover an edge of a quad face");
    return;
  }

  const { cage: out, newEdgeKeys } = applyLoopCut(cage, loop);
  dispatch("Loop cut", (d) => {
    const n = d.nodes[nodeId];
    if (n?.type !== "mesh" || n.geometry.kind !== "editableMesh") return;
    n.geometry.positions = out.positions;
    n.geometry.faces = out.faces;
    n.geometry.sharpEdges = out.sharpEdges ?? [];
  });

  const ui = useUI.getState();
  ui.setMeshCutActive(false);
  ui.setElementMode("edge"); // clears selection; show the new cut edges below
  ui.setMeshSelection({ vertices: new Set(), edges: new Set(newEdgeKeys), faces: new Set() });
}

/**
 * Edge-mode Sharp toggle: sharp (creased) edges resist Catmull-Clark
 * smoothing and stay crisp at any subdivision level. All-selected-sharp →
 * unmark, otherwise mark the whole selection. Reads the selection from the
 * UI store like extrude/delete do.
 */
export function toggleSelectedEdgesSharp(nodeId: string): void {
  if (!requireBaseState("edit sharp edges")) return;
  const doc = useDoc.getState().doc;
  const node = doc?.nodes[nodeId];
  if (!node || node.type !== "mesh" || node.geometry.kind !== "editableMesh") return;

  const topo = buildTopology({ positions: node.geometry.positions, faces: node.geometry.faces });
  // stale selection may hold keys a prior op renumbered away
  const valid = [...useUI.getState().meshSelection.edges].filter((k) => topo.edgeVerts.has(k));
  if (valid.length === 0) {
    useUI.getState().showToast("Select at least one edge to toggle sharp");
    return;
  }

  const current = new Set(node.geometry.sharpEdges);
  const allSharp = valid.every((k) => current.has(k));
  dispatch(allSharp ? "Clear sharp edges" : "Mark edges sharp", (d) => {
    const n = d.nodes[nodeId];
    if (n?.type !== "mesh" || n.geometry.kind !== "editableMesh") return;
    const set = new Set(n.geometry.sharpEdges);
    for (const k of valid) {
      if (allSharp) set.delete(k);
      else set.add(k);
    }
    n.geometry.sharpEdges = [...set];
  });
}
