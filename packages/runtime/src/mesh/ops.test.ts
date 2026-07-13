import { describe, expect, it } from "vitest";
import { buildTopology } from "./topology";
import { subdivideCatmullClark } from "./catmullClark";
import { boxCage } from "./primitives";
import { applyLoopCut, computeEdgeLoop, deleteFaces, extrudeFaces } from "./ops";
import { planeCage } from "./primitives";

describe("extrudeFaces", () => {
  it("extrudes a single box face: cap face + 4 side quads, verts duplicated at distance 0", () => {
    const cage = boxCage(1, 1, 1);
    const vertsBefore = cage.positions.length / 3;
    const { cage: out, newFaceIndices } = extrudeFaces(cage, [4]); // top face

    expect(newFaceIndices).toEqual([4]);
    // 4 verts used by the top face got duplicated
    expect(out.positions.length / 3).toBe(vertsBefore + 4);
    // original 6 faces + 4 side walls, cap face repoints (no new face for it)
    expect(out.faces.length).toBe(cage.faces.length + 4);

    // the cap (still at index 4) now references only newly-duplicated verts
    const cap = out.faces[4];
    expect(cap.every((v) => v >= vertsBefore)).toBe(true);
    // duplicated verts sit at the exact same position as their originals
    for (const v of cap) {
      const dupPos = [out.positions[v * 3], out.positions[v * 3 + 1], out.positions[v * 3 + 2]];
      // find an original vert at the same position among the top face's original verts
      const original = cage.faces[4].some((ov) => {
        const op = [cage.positions[ov * 3], cage.positions[ov * 3 + 1], cage.positions[ov * 3 + 2]];
        return op[0] === dupPos[0] && op[1] === dupPos[1] && op[2] === dupPos[2];
      });
      expect(original).toBe(true);
    }

    // non-selected faces are untouched — still index into original verts
    for (let fi = 0; fi < cage.faces.length; fi++) {
      if (fi === 4) continue;
      expect(out.faces[fi]).toEqual(cage.faces[fi]);
    }

    // side walls are quads
    const sideWalls = out.faces.slice(cage.faces.length);
    expect(sideWalls).toHaveLength(4);
    expect(sideWalls.every((f) => f.length === 4)).toBe(true);

    // downstream ops must not throw on the result
    expect(() => buildTopology(out)).not.toThrow();
    expect(() => subdivideCatmullClark(out, 1)).not.toThrow();
  });

  it("extrudes a 2-face region without walling the shared interior edge", () => {
    const cage = boxCage(1, 1, 1);
    // front (0) and top (4) share the edge between verts 6 and 7
    const { cage: out } = extrudeFaces(cage, [0, 4]);

    // union of both faces' verts = {4,5,6,7} u {3,7,6,2} = 6 unique verts
    expect(out.positions.length / 3).toBe(cage.positions.length / 3 + 6);

    // 8 face-edges total, minus the 2 occurrences of the shared edge = 6 boundary edges
    const sideWalls = out.faces.slice(cage.faces.length);
    expect(sideWalls).toHaveLength(6);

    expect(() => buildTopology(out)).not.toThrow();
    expect(() => subdivideCatmullClark(out, 1)).not.toThrow();
  });

  it("never throws on empty/out-of-range selection", () => {
    const cage = boxCage(1, 1, 1);
    expect(() => extrudeFaces(cage, [])).not.toThrow();
    const { cage: out, newFaceIndices } = extrudeFaces(cage, []);
    expect(newFaceIndices).toEqual([]);
    expect(out).toEqual(cage);
    expect(() => extrudeFaces(cage, [99, -1])).not.toThrow();
  });

  it("keeps surviving sharp edges and creases the cap where its source edges were sharp", () => {
    const cage = boxCage(1, 1, 1); // all 12 edges sharp
    const { cage: out } = extrudeFaces(cage, [4]); // top face
    const sharp = new Set(out.sharpEdges);
    // originals all survive: top-rim edges still exist between walls and sides
    for (const k of cage.sharpEdges!) expect(sharp.has(k)).toBe(true);
    // the 4 cap edges (between duplicated verts) inherit sharpness: 12 + 4
    expect(sharp.size).toBe(16);
    const edges = buildTopology(out).edgeVerts;
    for (const k of sharp) expect(edges.has(k)).toBe(true);
  });
});

describe("deleteFaces", () => {
  it("removes one box face, drops orphaned verts, and renumbers cleanly", () => {
    const cage = boxCage(1, 1, 1);
    const out = deleteFaces(cage, [4]); // top face

    expect(out.faces.length).toBe(5);
    // box is fully manifold — every vertex is shared by 3 faces, so removing
    // one face never orphans a vertex; all 8 verts survive
    expect(out.positions.length / 3).toBe(8);

    // every remaining face index is in range of the (possibly renumbered) verts
    const vertexCount = out.positions.length / 3;
    for (const f of out.faces) {
      for (const v of f) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(vertexCount);
      }
    }
    expect(() => subdivideCatmullClark(out, 1)).not.toThrow();
  });

  it("drops truly orphaned vertices and renumbers remaining faces to match", () => {
    // two disconnected quads — deleting one drops its 4 verts entirely
    const cage = {
      positions: [
        0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, // quad A: verts 0-3
        5, 0, 0, 6, 0, 0, 6, 1, 0, 5, 1, 0, // quad B: verts 4-7
      ],
      faces: [
        [0, 1, 2, 3],
        [4, 5, 6, 7],
      ],
    };
    const out = deleteFaces(cage, [0]);
    expect(out.faces.length).toBe(1);
    expect(out.positions.length / 3).toBe(4); // quad A's 4 verts dropped
    expect(out.faces[0]).toEqual([0, 1, 2, 3]); // quad B renumbered from 4-7 down to 0-3
  });

  it("deleting every face yields an empty cage without throwing", () => {
    const cage = boxCage(1, 1, 1);
    const out = deleteFaces(cage, cage.faces.map((_, i) => i));
    expect(out.faces).toEqual([]);
    expect(out.positions).toEqual([]);
    expect(() => buildTopology(out)).not.toThrow();
    expect(() => subdivideCatmullClark(out, 1)).not.toThrow();
  });

  it("never throws on out-of-range indices", () => {
    const cage = boxCage(1, 1, 1);
    expect(() => deleteFaces(cage, [99, -1])).not.toThrow();
  });

  it("remaps sharp edges through vertex renumbering and drops dangling ones", () => {
    // two disconnected quads, far edge of each sharp
    const cage = {
      positions: [
        0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, // quad A: verts 0-3
        5, 0, 0, 6, 0, 0, 6, 1, 0, 5, 1, 0, // quad B: verts 4-7
      ],
      faces: [
        [0, 1, 2, 3],
        [4, 5, 6, 7],
      ],
      sharpEdges: ["0_1", "6_7"],
    };
    const out = deleteFaces(cage, [0]);
    // quad A's key dies with its verts; quad B's remaps 6_7 -> 2_3
    expect(out.sharpEdges).toEqual(["2_3"]);
  });
});

describe("computeEdgeLoop + applyLoopCut", () => {
  it("cuts a full ring around a box (4 quads) into 8, adding 4 midpoints", () => {
    const cage = boxCage(1, 1, 1);
    const topo = buildTopology(cage);
    // any edge of any box quad seeds a closed 4-face ring
    const startEdge = topo.faceEdges[0][0];
    const loop = computeEdgeLoop(topo, 0, startEdge)!;

    expect(loop).not.toBeNull();
    expect(loop.faces.length).toBe(4); // front/right/back/left band
    expect(loop.edges.length).toBe(4); // 4 ring edges (closed)

    const { cage: out, newEdgeKeys } = applyLoopCut(cage, loop);
    expect(out.positions.length / 3).toBe(8 + 4); // 4 new midpoints
    expect(out.faces.length).toBe(6 + 4); // 4 quads each split in two
    expect(out.faces.every((f) => f.length === 4)).toBe(true); // stays all quads
    expect(newEdgeKeys.length).toBe(4);

    expect(() => buildTopology(out)).not.toThrow();
    expect(() => subdivideCatmullClark(out, 1)).not.toThrow();
  });

  it("cuts a lone quad (plane) in half — ring dead-ends at the boundary", () => {
    const cage = planeCage(1, 1);
    const topo = buildTopology(cage);
    const loop = computeEdgeLoop(topo, 0, topo.faceEdges[0][0])!;

    expect(loop.faces.length).toBe(1); // no quad neighbours -> just this face
    const { cage: out } = applyLoopCut(cage, loop);
    expect(out.faces.length).toBe(2);
    expect(out.positions.length / 3).toBe(4 + 2);
    expect(out.faces.every((f) => f.length === 4)).toBe(true);
    expect(() => subdivideCatmullClark(out, 1)).not.toThrow();
  });

  it("propagates the midpoint into a non-quad neighbour where the ring stops", () => {
    // quad (0-3) sharing edge (1,2) with a triangle (1,2,4). ring can't enter
    // the tri, but the cut still splits edge (1,2), so the tri must gain the
    // midpoint too or subdivision cracks along the seam.
    const cage = {
      positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 2, 0.5, 0],
      faces: [
        [0, 1, 2, 3], // quad
        [1, 4, 2], // triangle sharing edge (1,2)
      ],
    };
    const topo = buildTopology(cage);
    // cross edge (0,1)/(2,3) so the opposite pair includes shared edge (1,2)?
    // pick the edge whose opposite is the shared (1,2) edge:
    const shared = "1_2";
    const keys = topo.faceEdges[0];
    const startIdx = (keys.indexOf(shared) + 2) % 4; // enter opposite the shared edge
    const loop = computeEdgeLoop(topo, 0, keys[startIdx])!;
    expect(loop.edges).toContain(shared);

    const { cage: out } = applyLoopCut(cage, loop);
    const tri = out.faces.find((f) => f.includes(4))!;
    // the triangle grew a midpoint vertex (index >= 5, the originals were 0-4)
    // on the shared edge -> now a quad, no crack along the seam
    expect(tri.length).toBeGreaterThan(3);
    expect(tri.some((v) => v >= 5)).toBe(true);
    expect(() => subdivideCatmullClark(out, 1)).not.toThrow();
  });

  it("keeps both halves of a cut sharp edge sharp and leaves the new loop smooth", () => {
    const cage = boxCage(1, 1, 1); // all 12 edges sharp
    const topo = buildTopology(cage);
    const loop = computeEdgeLoop(topo, 0, topo.faceEdges[0][0])!;
    const { cage: out, newEdgeKeys } = applyLoopCut(cage, loop);

    // 4 ring edges split into 2 sharp halves each: 12 - 4 + 8
    expect(out.sharpEdges).toHaveLength(16);
    const sharp = new Set(out.sharpEdges);
    for (const k of newEdgeKeys) expect(sharp.has(k)).toBe(false);
    const edges = buildTopology(out).edgeVerts;
    for (const k of sharp) expect(edges.has(k)).toBe(true);
  });

  it("returns null when the start face isn't a quad or edge isn't on it", () => {
    const tri = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], faces: [[0, 1, 2]] };
    const topo = buildTopology(tri);
    expect(computeEdgeLoop(topo, 0, "0_1")).toBeNull(); // triangle, no opposite edge
    const box = buildTopology(boxCage(1, 1, 1));
    expect(computeEdgeLoop(box, 0, "99_100")).toBeNull(); // edge not on face 0
  });
});
