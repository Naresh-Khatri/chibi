import type { Cage } from "./topology";

export type Triangulated = {
  positions: number[];
  index: number[];
  /** triangleToFace[triIndex] = source cage face index — lets a raycast
   * intersection.faceIndex map back to the cage face it hit (face picking) */
  triangleToFace: number[];
};

/** fan-triangulate every polygon (n-2 tris per n-gon); positions pass through
 * untouched so BufferGeometry can index straight into the cage's own array */
export function triangulate(cage: Cage): Triangulated {
  const index: number[] = [];
  const triangleToFace: number[] = [];
  cage.faces.forEach((face, fi) => {
    if (face.length < 3) return; // degenerate — skip, never throw
    for (let i = 1; i < face.length - 1; i++) {
      index.push(face[0], face[i], face[i + 1]);
      triangleToFace.push(fi);
    }
  });
  return { positions: cage.positions, index, triangleToFace };
}
