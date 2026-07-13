import { buildTopology, edgeKey, type Cage } from "./topology";

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
  if (faces.length === 0) {
    return { positions: positions.slice(), faces: [], sharpEdges: [] };
  }

  const topo = buildTopology({ positions, faces });

  // creases: user-marked sharp edges + boundary (1 adj face) + non-manifold
  // (>2, treated boundary-like) — all share the same crease rules below, the
  // unification OpenSubdiv's boundary interpolation uses.
  const sharp = new Set<string>();
  if (cage.sharpEdges) {
    for (const k of cage.sharpEdges) if (topo.edgeVerts.has(k)) sharp.add(k);
  }
  const isCrease = (key: string) =>
    sharp.has(key) || (topo.edgeFaces.get(key)?.length ?? 0) !== 2;

  // face points: centroid of each face's verts
  const facePoints: Vec3[] = faces.map((f) => centroid(positions, f));

  // edge points: smooth interior -> avg(2 endpoints, 2 face points); crease -> midpoint
  const edgePointIndex = new Map<string, number>(); // edge key -> index into edgePoints
  const edgePoints: Vec3[] = [];
  for (const [key, [a, b]] of topo.edgeVerts) {
    const adjFaces = topo.edgeFaces.get(key) ?? [];
    const pt: Vec3 =
      isCrease(key)
        ? midpoint(positions, a, b)
        : avg3([
            getVec3(positions, a),
            getVec3(positions, b),
            facePoints[adjFaces[0]],
            facePoints[adjFaces[1]],
          ]);
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
    const creaseEdges = [...edges].filter(isCrease);
    if (creaseEdges.length <= 1) {
      // smooth vertex (a single crease = dart, also smooth):
      // (F_avg + 2*R_avg + (n-3)*P) / n
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
    } else if (creaseEdges.length === 2) {
      // crease vertex: blend only along the crease/boundary line so open
      // cages and sharp loops keep their borders — (A + 6P + B)/8 where A/B
      // are the far endpoints of the two crease edges
      const [A, B] = creaseEdges.map((k) => {
        const [a, b] = topo.edgeVerts.get(k)!;
        return getVec3(positions, a === v ? b : a);
      });
      vertexPoints[v] = [
        (A[0] + 6 * P[0] + B[0]) / 8,
        (A[1] + 6 * P[1] + B[1]) / 8,
        (A[2] + 6 * P[2] + B[2]) / 8,
      ];
    } else {
      // corner (3+ creases meet, e.g. a cube corner): pinned in place
      vertexPoints[v] = P;
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

  // sharpness propagates: both halves of a split sharp edge stay sharp, so a
  // creased loop survives every level (boundary edges need no marking — they
  // stay boundary in the child mesh)
  const newSharpEdges: string[] = [];
  for (const key of sharp) {
    const e = edgePointIndex.get(key);
    if (e === undefined) continue;
    const [a, b] = topo.edgeVerts.get(key)!;
    newSharpEdges.push(edgeKey(a, edgeOffset + e), edgeKey(b, edgeOffset + e));
  }

  return { positions: newPositions, faces: newFaces, sharpEdges: newSharpEdges };
}

/** standard Catmull-Clark, `levels` steps. same implementation powers the
 * render-time modifier and the destructive "increase base subdivision" bake. */
export function subdivideCatmullClark(cage: Cage, levels: number): Cage {
  const clamped = Math.max(0, Math.min(4, Math.round(levels)));
  let current: Cage = {
    positions: cage.positions.slice(),
    faces: cage.faces.map((f) => f.slice()),
    sharpEdges: cage.sharpEdges?.slice() ?? [],
  };
  for (let i = 0; i < clamped; i++) {
    current = subdivideOnce(current);
  }
  return current;
}
