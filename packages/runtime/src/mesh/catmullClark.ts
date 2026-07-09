import { buildTopology, type Cage } from "./topology";

type Vec3 = [number, number, number];

function getVec3(positions: number[], v: number): Vec3 {
  return [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
}

function centroid(positions: number[], verts: number[]): Vec3 {
  let x = 0, y = 0, z = 0;
  for (const v of verts) {
    x += positions[v * 3];
    y += positions[v * 3 + 1];
    z += positions[v * 3 + 2];
  }
  const n = verts.length || 1;
  return [x / n, y / n, z / n];
}

function midpoint(positions: number[], a: number, b: number): Vec3 {
  const pa = getVec3(positions, a);
  const pb = getVec3(positions, b);
  return [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
}

function avg3(points: Vec3[]): Vec3 {
  let x = 0, y = 0, z = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n = points.length || 1;
  return [x / n, y / n, z / n];
}

// drop faces that can't be topologically sound instead of crashing on them —
// degenerate/non-manifold cages come from hand-authored docs or future
// extrude/delete ops, this must never throw.
function sanitizeFaces(faces: number[][], vertexCount: number): number[][] {
  return faces.filter(
    (f) =>
      f.length >= 3 &&
      f.every((v) => Number.isInteger(v) && v >= 0 && v < vertexCount),
  );
}

/** one Catmull-Clark step: face points -> edge points -> vertex points -> pure-quad refine */
function subdivideOnce(cage: Cage): Cage {
  const { positions } = cage;
  const vertexCount = positions.length / 3;
  const faces = sanitizeFaces(cage.faces, vertexCount);
  if (faces.length === 0) return { positions: positions.slice(), faces: [] };

  const topo = buildTopology({ positions, faces });

  // face points: centroid of each face's verts
  const facePoints: Vec3[] = faces.map((f) => centroid(positions, f));

  // edge points: interior (2 adj faces) -> avg(2 endpoints, 2 face points);
  // boundary (1 adj) or non-manifold (>2 adj, treated as boundary-like) -> midpoint
  const edgePointIndex = new Map<string, number>(); // edge key -> index into edgePoints
  const edgePoints: Vec3[] = [];
  for (const [key, [a, b]] of topo.edgeVerts) {
    const adjFaces = topo.edgeFaces.get(key) ?? [];
    const pt: Vec3 =
      adjFaces.length === 2
        ? avg3([
            getVec3(positions, a),
            getVec3(positions, b),
            facePoints[adjFaces[0]],
            facePoints[adjFaces[1]],
          ])
        : midpoint(positions, a, b);
    edgePointIndex.set(key, edgePoints.length);
    edgePoints.push(pt);
  }

  // vertex points
  const vertexPoints: Vec3[] = new Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) {
    const P = getVec3(positions, v);
    const edges = topo.vertexEdges.get(v);
    if (!edges || edges.size === 0) {
      vertexPoints[v] = P; // isolated vertex — nothing to average, keep as-is
      continue;
    }
    const boundaryEdges = [...edges].filter(
      (k) => (topo.edgeFaces.get(k)?.length ?? 0) !== 2,
    );
    if (boundaryEdges.length === 0) {
      // interior vertex: (F_avg + 2*R_avg + (n-3)*P) / n
      // F_avg = avg adjacent face points, R_avg = avg ORIGINAL edge midpoints
      const faceIds = topo.vertexFaces.get(v) ?? [];
      const n = edges.size;
      const Favg = avg3(faceIds.map((fi) => facePoints[fi]));
      const Ravg = avg3(
        [...edges].map((k) => {
          const [a, b] = topo.edgeVerts.get(k)!;
          return midpoint(positions, a, b);
        }),
      );
      vertexPoints[v] = [
        (Favg[0] + 2 * Ravg[0] + (n - 3) * P[0]) / n,
        (Favg[1] + 2 * Ravg[1] + (n - 3) * P[1]) / n,
        (Favg[2] + 2 * Ravg[2] + (n - 3) * P[2]) / n,
      ];
    } else {
      // boundary vertex: blend only along the boundary loop (ignore interior
      // faces) so open cages keep sharp borders. defensive avg over however
      // many boundary-like edges are present — a manifold boundary loop has
      // exactly 2, but never assume it.
      const midpoints = boundaryEdges.map((k) => {
        const [a, b] = topo.edgeVerts.get(k)!;
        return midpoint(positions, a, b);
      });
      vertexPoints[v] = avg3([P, ...midpoints]);
    }
  }

  // assemble new positions: [vertexPoints..., edgePoints..., facePoints...]
  const edgeOffset = vertexPoints.length;
  const faceOffset = edgeOffset + edgePoints.length;
  const newPositions: number[] = new Array(
    (faceOffset + facePoints.length) * 3,
  );
  [...vertexPoints, ...edgePoints, ...facePoints].forEach((p, i) => {
    newPositions[i * 3] = p[0];
    newPositions[i * 3 + 1] = p[1];
    newPositions[i * 3 + 2] = p[2];
  });

  // new faces: for each original n-gon face with face point F, emit n quads
  // [vertexPoint(v), edgePoint(v->next), F, edgePoint(prev->v)] — preserves
  // the original loop's winding so normals stay outward-consistent. always
  // pure quads regardless of input degree.
  const newFaces: number[][] = [];
  faces.forEach((face, fi) => {
    const n = face.length;
    const fpIdx = faceOffset + fi;
    for (let i = 0; i < n; i++) {
      const vIdx = face[i]; // vertex points keep their original index (0-based, unshifted)
      const nextEdgeIdx = edgeOffset + edgePointIndex.get(topo.faceEdges[fi][i])!;
      const prevEdgeIdx =
        edgeOffset + edgePointIndex.get(topo.faceEdges[fi][(i - 1 + n) % n])!;
      newFaces.push([vIdx, nextEdgeIdx, fpIdx, prevEdgeIdx]);
    }
  });

  return { positions: newPositions, faces: newFaces };
}

/** standard Catmull-Clark, `levels` steps. same implementation powers the
 * render-time modifier and the destructive "increase base subdivision" bake. */
export function subdivideCatmullClark(cage: Cage, levels: number): Cage {
  const clamped = Math.max(0, Math.min(4, Math.round(levels)));
  let current: Cage = {
    positions: cage.positions.slice(),
    faces: cage.faces.map((f) => f.slice()),
  };
  for (let i = 0; i < clamped; i++) {
    current = subdivideOnce(current);
  }
  return current;
}
