// pure geometry — no editor/app imports (packages/runtime import boundary).
// extrude/delete are Cage-in/Cage-out, same "rebuild fresh, never mutate in
// place" contract as the rest of mesh/ — see topology.ts header.

import { edgeKey, type Cage, type Topology } from "./topology";

/** dedupe + drop out-of-range indices — stale UI selection must never throw */
function sanitizeFaceIndices(faceIndices: number[], faceCount: number): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const fi of faceIndices) {
    if (Number.isInteger(fi) && fi >= 0 && fi < faceCount && !seen.has(fi)) {
      seen.add(fi);
      out.push(fi);
    }
  }
  return out;
}

/**
 * Extrude a face region: duplicates every vertex the region touches at the
 * SAME position (distance 0 — the user pulls the cap out afterward with the
 * move gizmo, matching Blender/Spline's extrude-then-move), re-points the
 * selected faces to the duplicates (they become the moved "cap"), and walls
 * the region's boundary edges — edges used by exactly one selected face.
 * An edge shared by two selected faces is interior to the region and gets
 * no wall. Original non-selected faces keep referencing the original verts,
 * so the base of the mesh stays put.
 */
export function extrudeFaces(
  cage: Cage,
  faceIndices: number[],
): { cage: Cage; newFaceIndices: number[] } {
  const selected = sanitizeFaceIndices(faceIndices, cage.faces.length);
  if (selected.length === 0) {
    return {
      cage: { positions: cage.positions.slice(), faces: cage.faces.map((f) => f.slice()) },
      newFaceIndices: [],
    };
  }
  const selectedSet = new Set(selected);

  // boundary edges of the region, counted only among selected faces' own
  // edges (not the whole cage) — an edge two selected faces share is
  // interior and must NOT get a wall. Direction is kept per-edge so the
  // side quad winds consistently with the face that owns it.
  const edgeCount = new Map<string, number>();
  const edgeDirection = new Map<string, [number, number]>();
  for (const fi of selected) {
    const face = cage.faces[fi];
    const n = face.length;
    for (let i = 0; i < n; i++) {
      const a = face[i];
      const b = face[(i + 1) % n];
      const key = edgeKey(a, b);
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
      edgeDirection.set(key, [a, b]);
    }
  }

  // verts used by the selected region
  const usedVerts = new Set<number>();
  for (const fi of selected) for (const v of cage.faces[fi]) usedVerts.add(v);

  const positions = cage.positions.slice();
  const dupOf = new Map<number, number>();
  for (const v of usedVerts) {
    dupOf.set(v, positions.length / 3);
    positions.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
  }

  // cap faces: the selected faces, re-pointed to the duplicated verts — same
  // indices as before (only their vertex refs changed), so they're exactly
  // the indices to auto-select.
  const faces = cage.faces.map((face, fi) =>
    selectedSet.has(fi) ? face.map((v) => dupOf.get(v) ?? v) : face.slice(),
  );

  // side quad per boundary edge: [a, b, dup(b), dup(a)] — walking the edge
  // in the owning face's own loop direction keeps the wall's outward normal
  // consistent with the (now-duplicated) cap's normal.
  for (const [key, count] of edgeCount) {
    if (count !== 1) continue; // interior to the region — no wall
    const dir = edgeDirection.get(key);
    if (!dir) continue;
    const [a, b] = dir;
    const aDup = dupOf.get(a);
    const bDup = dupOf.get(b);
    if (aDup === undefined || bDup === undefined) continue;
    faces.push([a, b, bDup, aDup]);
  }

  return { cage: { positions, faces }, newFaceIndices: selected };
}

/**
 * Insert vertex `m` on edge (a,b) in every incident face (between its
 * endpoints, per that face's loop order) -> shared edge split, no T-junction.
 * Untouched faces returned as-is; first occurrence per face only.
 */
function insertOnEdge(faces: number[][], a: number, b: number, m: number): number[][] {
  return faces.map((face) => {
    const n = face.length;
    for (let i = 0; i < n; i++) {
      const x = face[i];
      const y = face[(i + 1) % n];
      if ((x === a && y === b) || (x === b && y === a)) {
        const out = face.slice();
        out.splice(i + 1, 0, m); // splice at n (last edge) appends -> wraps correctly
        return out;
      }
    }
    return face;
  });
}

/** cut `loop` into two halves at verts mA/mB (both must be present) */
function severFace(loop: number[], mA: number, mB: number): [number[], number[]] | null {
  const ia = loop.indexOf(mA);
  const ib = loop.indexOf(mB);
  if (ia === -1 || ib === -1) return null;
  const half = (start: number, end: number): number[] => {
    const out: number[] = [];
    for (let i = start; ; i = (i + 1) % loop.length) {
      out.push(loop[i]);
      if (i === end) break;
    }
    return out;
  };
  const first = half(ia, ib);
  const second = half(ib, ia);
  if (first.length < 3 || second.length < 3) return null;
  return [first, second];
}

/** the two opposite-edge slots a cut crosses through one quad of the ring */
export type EdgeLoop = {
  /** every edge key the cut passes through (dedup) */
  edges: string[];
  /** each ring quad + the two opposite edges the cut enters/exits by */
  faces: { faceIndex: number; inKey: string; outKey: string }[];
};

// endpoints live in the key itself ("min_max") — no topology lookup needed
function endpointsOf(edgeKeyStr: string): [number, number] {
  const [a, b] = edgeKeyStr.split("_").map(Number);
  return [a, b];
}

// ring only travels through quads — walk crossing each quad edge->opposite
// edge into the neighbour, until we wrap, hit a boundary, or leave quad land.
function walkLoop(
  topo: Topology,
  startFace: number,
  startEdgeIdx: number,
  out: Map<number, { inKey: string; outKey: string }>,
): void {
  let face = startFace;
  let edgeIdx = startEdgeIdx;
  // cages are low-poly; guard is just a runaway backstop
  for (let guard = 0; guard < 100000; guard++) {
    const keys = topo.faceEdges[face];
    if (!keys || keys.length !== 4) return;
    if (out.has(face)) return; // wrapped around / met the other direction
    const inKey = keys[edgeIdx];
    const outKey = keys[(edgeIdx + 2) % 4];
    out.set(face, { inKey, outKey });
    const adj = topo.edgeFaces.get(outKey) ?? [];
    const neighbor = adj.find((f) => f !== face);
    if (neighbor === undefined) return; // boundary — ring ends here
    const nKeys = topo.faceEdges[neighbor];
    if (!nKeys || nKeys.length !== 4) return; // neighbour not a quad
    const nIdx = nKeys.indexOf(outKey);
    if (nIdx < 0) return;
    face = neighbor;
    edgeIdx = nIdx;
  }
}

/**
 * Edge loop for a loop cut: from the seed quad, cross `startEdgeKey` + its
 * opposite, ride the quad ring both ways until it wraps or dead-ends at a
 * boundary/non-quad. Order-free (each quad cut independently) -> faces into a
 * map. null if seed face isn't a quad or edge isn't one of its sides.
 */
export function computeEdgeLoop(
  topo: Topology,
  startFace: number,
  startEdgeKey: string,
): EdgeLoop | null {
  const keys = topo.faceEdges[startFace];
  if (!keys || keys.length !== 4) return null;
  const startIdx = keys.indexOf(startEdgeKey);
  if (startIdx < 0) return null;

  const faceMap = new Map<number, { inKey: string; outKey: string }>();
  walkLoop(topo, startFace, startIdx, faceMap); // out direction
  // also walk the in direction: cross startFace's in-edge into its neighbour
  const inKey = keys[startIdx];
  const inAdj = (topo.edgeFaces.get(inKey) ?? []).find((f) => f !== startFace);
  if (inAdj !== undefined) {
    const nKeys = topo.faceEdges[inAdj];
    const nIdx = nKeys ? nKeys.indexOf(inKey) : -1;
    if (nIdx >= 0) walkLoop(topo, inAdj, nIdx, faceMap);
  }

  const edges = new Set<string>();
  const faces: EdgeLoop["faces"] = [];
  for (const [faceIndex, { inKey: ik, outKey: ok }] of faceMap) {
    edges.add(ik);
    edges.add(ok);
    faces.push({ faceIndex, inKey: ik, outKey: ok });
  }
  return { edges: [...edges], faces };
}

/**
 * Apply a loop cut: midpoint on every ring edge (shared into all incident
 * faces via insertOnEdge, incl. a non-quad dead-end neighbour -> no
 * T-junction), then sever each ring quad between its in/out midpoints.
 * Adjacent quads share a midpoint -> dividing edges chain into one loop.
 */
export function applyLoopCut(
  cage: Cage,
  loop: EdgeLoop,
): { cage: Cage; newEdgeKeys: string[] } {
  const positions = cage.positions.slice();
  const midOf = new Map<string, number>();
  for (const key of loop.edges) {
    const [a, b] = endpointsOf(key);
    if (a * 3 + 2 >= positions.length || b * 3 + 2 >= positions.length) continue;
    midOf.set(key, positions.length / 3);
    positions.push(
      (positions[a * 3] + positions[b * 3]) / 2,
      (positions[a * 3 + 1] + positions[b * 3 + 1]) / 2,
      (positions[a * 3 + 2] + positions[b * 3 + 2]) / 2,
    );
  }

  let faces = cage.faces.map((f) => f.slice());
  for (const key of loop.edges) {
    const m = midOf.get(key);
    if (m === undefined) continue;
    const [a, b] = endpointsOf(key);
    faces = insertOnEdge(faces, a, b, m);
  }

  const newEdgeKeys: string[] = [];
  for (const { faceIndex, inKey, outKey } of loop.faces) {
    const mIn = midOf.get(inKey);
    const mOut = midOf.get(outKey);
    if (mIn === undefined || mOut === undefined) continue;
    const parts = severFace(faces[faceIndex], mIn, mOut);
    if (!parts) continue;
    faces[faceIndex] = parts[0];
    faces.push(parts[1]);
    newEdgeKeys.push(edgeKey(mIn, mOut));
  }

  return { cage: { positions, faces }, newEdgeKeys };
}

/**
 * Delete faces: drops the selected faces, drops any vertex no longer
 * referenced by a surviving face, and compacts/remaps the remaining faces'
 * indices onto the new vertex list. Never leaves a dangling index — deleting
 * every face yields an empty (but valid) cage instead of throwing.
 */
export function deleteFaces(cage: Cage, faceIndices: number[]): Cage {
  const toDelete = new Set(sanitizeFaceIndices(faceIndices, cage.faces.length));
  const keptFaces = cage.faces.filter((_, fi) => !toDelete.has(fi));

  const usedVerts = new Set<number>();
  for (const face of keptFaces) for (const v of face) usedVerts.add(v);

  const vertexCount = cage.positions.length / 3;
  const remap = new Map<number, number>();
  const positions: number[] = [];
  for (let v = 0; v < vertexCount; v++) {
    if (!usedVerts.has(v)) continue;
    remap.set(v, positions.length / 3);
    positions.push(cage.positions[v * 3], cage.positions[v * 3 + 1], cage.positions[v * 3 + 2]);
  }

  const faces = keptFaces.map((face) => face.map((v) => remap.get(v)!));
  return { positions, faces };
}
