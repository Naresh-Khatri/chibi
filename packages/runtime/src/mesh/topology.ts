// pure geometry — no editor/app imports (packages/runtime import boundary).
// cages are low-poly and rebuilt fresh from positions+faces on every dispatch
// (immer replaces whole arrays), so an O(F) rebuild is cheap; no half-edge
// structure needed until incremental topology (loop-cut etc.) lands.

/** control cage: flat [x,y,z,...] positions + polygon loops (tri/quad/n-gon) */
export type Cage = {
  positions: number[];
  faces: number[][];
};

export type Topology = {
  /** edge key -> its two endpoint vertex indices */
  edgeVerts: Map<string, [number, number]>;
  /** edge key -> incident face indices. 1 = boundary, 2 = interior, >2 = non-manifold */
  edgeFaces: Map<string, number[]>;
  /** per-face edge keys, in loop order (faceEdges[f][i] = edge from face[f][i] to face[f][i+1]) */
  faceEdges: string[][];
  /** vertex index -> incident face indices */
  vertexFaces: Map<number, number[]>;
  /** vertex index -> incident edge keys */
  vertexEdges: Map<number, Set<string>>;
};

/** canonical edge key — order-independent so both winding directions share it */
export function edgeKey(a: number, b: number): string {
  return `${Math.min(a, b)}_${Math.max(a, b)}`;
}

export function buildTopology(cage: Cage): Topology {
  const edgeVerts = new Map<string, [number, number]>();
  const edgeFaces = new Map<string, number[]>();
  const faceEdges: string[][] = [];
  const vertexFaces = new Map<number, number[]>();
  const vertexEdges = new Map<number, Set<string>>();

  cage.faces.forEach((face, fi) => {
    const n = face.length;
    const edges: string[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = face[i];
      const b = face[(i + 1) % n];
      const key = edgeKey(a, b);
      edges[i] = key;

      if (!edgeVerts.has(key)) edgeVerts.set(key, [a, b]);
      const ef = edgeFaces.get(key);
      if (ef) ef.push(fi);
      else edgeFaces.set(key, [fi]);

      const vf = vertexFaces.get(a);
      if (vf) vf.push(fi);
      else vertexFaces.set(a, [fi]);

      const veA = vertexEdges.get(a);
      if (veA) veA.add(key);
      else vertexEdges.set(a, new Set([key]));
      const veB = vertexEdges.get(b);
      if (veB) veB.add(key);
      else vertexEdges.set(b, new Set([key]));
    }
    faceEdges.push(edges);
  });

  return { edgeVerts, edgeFaces, faceEdges, vertexFaces, vertexEdges };
}
