// pure geometry — no editor/app imports (packages/runtime import boundary).
// extrude/delete are Cage-in/Cage-out, same "rebuild fresh, never mutate in
// place" contract as the rest of mesh/ — see topology.ts header.

import { edgeKey, type Cage } from "./topology";

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
