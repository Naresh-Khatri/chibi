// pure geometry — no editor/app imports (packages/runtime import boundary).

import { buildTopology, type Cage } from "./topology";

/**
 * Duplicate every vertex that sits on a sharp edge, once per fan of faces
 * connected through its NON-sharp incident edges — so indexed
 * computeVertexNormals can't average normals across a crease (a creased cube
 * would otherwise shade like a beveled one even though its geometry is
 * crisp). Render-prep only, run AFTER subdivision: the output drops
 * sharpEdges since vertex renumbering invalidates the keys.
 */
export function splitVerticesAtSharpEdges(cage: Cage): Cage {
  const sharp = new Set(cage.sharpEdges ?? []);
  if (sharp.size === 0) return { positions: cage.positions, faces: cage.faces };

  const topo = buildTopology(cage);
  const positions = cage.positions.slice();
  const faces = cage.faces.map((f) => f.slice());
  const vertexCount = cage.positions.length / 3;

  for (let v = 0; v < vertexCount; v++) {
    const incidentEdges = topo.vertexEdges.get(v);
    if (!incidentEdges) continue;
    let touchesSharp = false;
    for (const k of incidentEdges) {
      if (sharp.has(k)) {
        touchesSharp = true;
        break;
      }
    }
    if (!touchesSharp) continue;

    // union-find over v's incident faces: faces sharing a non-sharp incident
    // edge shade smoothly together, so they must keep sharing the vertex
    const parent = new Map<number, number>();
    for (const fi of topo.vertexFaces.get(v) ?? []) parent.set(fi, fi);
    const find = (x: number): number => {
      let r = x;
      while (parent.get(r) !== r) r = parent.get(r)!;
      parent.set(x, r);
      return r;
    };
    for (const k of incidentEdges) {
      if (sharp.has(k)) continue;
      const adj = (topo.edgeFaces.get(k) ?? []).filter((f) => parent.has(f));
      for (let i = 1; i < adj.length; i++) {
        parent.set(find(adj[i]), find(adj[0]));
      }
    }

    const clusters = new Map<number, number[]>();
    for (const fi of parent.keys()) {
      const root = find(fi);
      const c = clusters.get(root);
      if (c) c.push(fi);
      else clusters.set(root, [fi]);
    }
    if (clusters.size <= 1) continue;

    let first = true;
    for (const clusterFaces of clusters.values()) {
      if (first) {
        first = false; // first cluster keeps the original index
        continue;
      }
      const nv = positions.length / 3;
      positions.push(
        cage.positions[v * 3],
        cage.positions[v * 3 + 1],
        cage.positions[v * 3 + 2],
      );
      for (const fi of clusterFaces) {
        const face = faces[fi];
        for (let i = 0; i < face.length; i++) {
          if (face[i] === v) face[i] = nv;
        }
      }
    }
  }

  return { positions, faces };
}
