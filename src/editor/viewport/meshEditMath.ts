// pure helpers for the mesh-edit gizmo — kept dependency-free of React/zustand
// so they're trivially unit-testable (matrix/set math only).
import { Matrix4, Vector3 } from "three";
import type { Topology } from "@/runtime/mesh";
import type { MeshSelection } from "../store/ui";

/**
 * Union of selected verts + selected edges' endpoints + selected faces'
 * verts — the exact vertex set the gizmo moves, regardless of which
 * element-mode picked them (an edge/face selection still drags its verts).
 *
 * `vertexCount` bounds-checks every candidate before it enters the result:
 * selection state (persisted in the ui store) can outlive the geometry it
 * was picked against — e.g. undoing a subdivision shrinks the vertex count
 * while a stale selection still references the old, larger indices.
 */
export function selectedVertexSet(
  selection: MeshSelection,
  topology: Pick<Topology, "edgeVerts">,
  faces: number[][],
  vertexCount: number,
): number[] {
  const set = new Set<number>();
  const addIfInRange = (vi: number) => {
    if (vi >= 0 && vi < vertexCount) set.add(vi);
  };
  for (const vi of selection.vertices) addIfInRange(vi);
  for (const key of selection.edges) {
    const pair = topology.edgeVerts.get(key);
    if (pair) {
      addIfInRange(pair[0]);
      addIfInRange(pair[1]);
    }
  }
  for (const faceIndex of selection.faces) {
    const face = faces[faceIndex];
    if (face) for (const vi of face) addIfInRange(vi);
  }
  return Array.from(set);
}

/** average local-space position of the given vertex indices (flat [x,y,z,...] array). */
export function centroidOf(positions: number[], vertexIndices: number[]): Vector3 {
  const c = new Vector3();
  if (vertexIndices.length === 0) return c;
  for (const vi of vertexIndices) {
    c.x += positions[vi * 3];
    c.y += positions[vi * 3 + 1];
    c.z += positions[vi * 3 + 2];
  }
  return c.divideScalar(vertexIndices.length);
}

/**
 * Carries local-space start positions through the gizmo proxy's drag delta:
 *   local -> world (node transform) -> proxy-start-relative -> world (proxy
 *   now) -> local (inverse node transform).
 * Works uniformly for translate/rotate/scale because all three
 * TransformControls modes pivot about the proxy's own origin, and the
 * proxy-start-relative step is exactly "undo the proxy's starting pose".
 */
export function applyProxyDeltaToLocal(
  localStart: number[],
  nodeMatrixWorld: Matrix4,
  nodeMatrixWorldInverse: Matrix4,
  proxyMatrixWorld: Matrix4,
  proxyMatrixWorldStartInverse: Matrix4,
): number[] {
  const out = new Array<number>(localStart.length);
  const v = new Vector3();
  for (let i = 0; i < localStart.length; i += 3) {
    v.set(localStart[i], localStart[i + 1], localStart[i + 2]);
    v.applyMatrix4(nodeMatrixWorld);
    v.applyMatrix4(proxyMatrixWorldStartInverse);
    v.applyMatrix4(proxyMatrixWorld);
    v.applyMatrix4(nodeMatrixWorldInverse);
    out[i] = v.x;
    out[i + 1] = v.y;
    out[i + 2] = v.z;
  }
  return out;
}
