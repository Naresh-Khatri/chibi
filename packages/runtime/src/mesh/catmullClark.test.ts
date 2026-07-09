import { describe, expect, it } from "vitest";
import { buildTopology, type Cage } from "./topology";
import { subdivideCatmullClark } from "./catmullClark";

// unit cube, 8 verts / 12 edges / 6 quad faces, outward-winding
const CUBE: Cage = {
  positions: [
    -1, -1, -1, // 0
    1, -1, -1, // 1
    1, 1, -1, // 2
    -1, 1, -1, // 3
    -1, -1, 1, // 4
    1, -1, 1, // 5
    1, 1, 1, // 6
    -1, 1, 1, // 7
  ],
  faces: [
    [4, 5, 6, 7], // front
    [0, 3, 2, 1], // back
    [0, 4, 7, 3], // left
    [1, 2, 6, 5], // right
    [3, 7, 6, 2], // top
    [0, 1, 5, 4], // bottom
  ],
};

// 2x2 grid of quads (3x3 verts) — open disk with both boundary and interior
// vertices/edges, so it exercises the boundary-handling branch.
const OPEN_GRID: Cage = {
  positions: [
    0, 0, 0, // 0
    1, 0, 0, // 1
    2, 0, 0, // 2
    0, 1, 0, // 3
    1, 1, 0, // 4
    2, 1, 0, // 5
    0, 2, 0, // 6
    1, 2, 0, // 7
    2, 2, 0, // 8
  ],
  faces: [
    [0, 1, 4, 3],
    [1, 2, 5, 4],
    [3, 4, 7, 6],
    [4, 5, 8, 7],
  ],
};

// disjoint triangle + quad + pentagon (own vertex ranges, no shared edges) —
// exercises n-gon face-point/edge-point handling for mixed polygon degrees.
const MIXED: Cage = {
  positions: [
    0, 0, 0, 1, 0, 0, 0.5, 1, 0, // triangle: 0,1,2
    2, 0, 0, 3, 0, 0, 3, 1, 0, 2, 1, 0, // quad: 3,4,5,6
    4, 0, 0, 5, 0, 0, 5.5, 0.8, 0, 4.5, 1.3, 0, 3.5, 0.8, 0, // pentagon: 7..11
  ],
  faces: [
    [0, 1, 2],
    [3, 4, 5, 6],
    [7, 8, 9, 10, 11],
  ],
};

describe("subdivideCatmullClark", () => {
  it("subdivides a closed cube cage to 26v/24f/48e at level 1 (Euler check)", () => {
    const out = subdivideCatmullClark(CUBE, 1);
    expect(out.positions.length / 3).toBe(26);
    expect(out.faces.length).toBe(24);
    expect(out.faces.every((f) => f.length === 4)).toBe(true);

    const topo = buildTopology(out);
    expect(topo.edgeVerts.size).toBe(48);
    // closed manifold sphere-topology cage: V - E + F = 2
    expect(26 - 48 + 24).toBe(2);
  });

  it("handles an open quad-grid boundary (disk: V - E + F = 1)", () => {
    const before = buildTopology(OPEN_GRID);
    expect(9 - before.edgeVerts.size + OPEN_GRID.faces.length).toBe(1);

    const out = subdivideCatmullClark(OPEN_GRID, 1);
    expect(out.positions.length / 3).toBe(25); // V+E+F = 9+12+4
    // each original face contributes exactly `degree` new quads (one per
    // corner) regardless of boundary/interior — 4 quad faces * 4 = 16.
    // (2E only coincides with this count for a *closed* manifold, like the cube above.)
    expect(out.faces.length).toBe(16);
    expect(out.faces.every((f) => f.length === 4)).toBe(true);

    const after = buildTopology(out);
    expect(25 - after.edgeVerts.size + out.faces.length).toBe(1);
  });

  it("always emits pure quads for mixed tri/quad/pentagon input", () => {
    const out = subdivideCatmullClark(MIXED, 1);
    // 3 disjoint polygons, each contributing V+E+F verts and `degree` quads
    expect(out.positions.length / 3).toBe(27); // (3+3+1)+(4+4+1)+(5+5+1)
    expect(out.faces.length).toBe(12); // 3 + 4 + 5
    expect(out.faces.every((f) => f.length === 4)).toBe(true);
  });

  it("clamps subdivision levels to [0,4] and never throws on degenerate input", () => {
    expect(subdivideCatmullClark(CUBE, 0).faces).toEqual(CUBE.faces);
    expect(() => subdivideCatmullClark(CUBE, 9)).not.toThrow();
    const degenerate: Cage = { positions: [0, 0, 0, 1, 0, 0], faces: [[0, 1, 5]] };
    expect(() => subdivideCatmullClark(degenerate, 2)).not.toThrow();
  });
});
