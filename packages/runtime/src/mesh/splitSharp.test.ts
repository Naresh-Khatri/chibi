import { describe, expect, it } from "vitest";
import { buildTopology, type Cage } from "./topology";
import { boxCage } from "./primitives";
import { splitVerticesAtSharpEdges } from "./splitSharp";

describe("splitVerticesAtSharpEdges", () => {
  it("returns the cage unchanged when there are no sharp edges", () => {
    const cage: Cage = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], faces: [[0, 1, 2]] };
    const out = splitVerticesAtSharpEdges(cage);
    expect(out.positions).toEqual(cage.positions);
    expect(out.faces).toEqual(cage.faces);
  });

  it("splits a fully creased cube into 6 disconnected quads (24 verts)", () => {
    const cage = boxCage(1, 1, 1); // ships with all 12 edges sharp
    const out = splitVerticesAtSharpEdges(cage);
    expect(out.positions.length / 3).toBe(24); // 4 per face, nothing shared
    expect(out.faces).toHaveLength(6);
    // every duplicated vert sits exactly where its original did
    for (let fi = 0; fi < 6; fi++) {
      for (let i = 0; i < 4; i++) {
        const nv = out.faces[fi][i];
        const ov = cage.faces[fi][i];
        expect([
          out.positions[nv * 3],
          out.positions[nv * 3 + 1],
          out.positions[nv * 3 + 2],
        ]).toEqual([
          cage.positions[ov * 3],
          cage.positions[ov * 3 + 1],
          cage.positions[ov * 3 + 2],
        ]);
      }
    }
  });

  it("splits only across the creased loop, keeping smooth fans shared", () => {
    const cage = boxCage(1, 1, 1);
    // crease only the top rim: top face separates, sides+bottom stay welded
    const topo = buildTopology(cage);
    const topRim = cage.faces[4].map((v, i, f) => {
      const [a, b] = [v, f[(i + 1) % f.length]];
      return `${Math.min(a, b)}_${Math.max(a, b)}`;
    });
    for (const k of topRim) expect(topo.edgeVerts.has(k)).toBe(true);
    const out = splitVerticesAtSharpEdges({ ...cage, sharpEdges: topRim });
    // the 4 top-rim verts each split once (top-face fan vs side fan)
    expect(out.positions.length / 3).toBe(8 + 4);
  });
});
