import { describe, expect, it } from "vitest";
import { buildTopology } from "./topology";
import { subdivideCatmullClark } from "./catmullClark";
import {
  boxCage,
  cageFromGeometry,
  cylinderCage,
  planeCage,
  sphereCage,
  torusCage,
} from "./primitives";

function assertIndicesInRange(faces: number[][], vertexCount: number) {
  for (const f of faces) {
    for (const v of f) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(vertexCount);
    }
  }
}

// Euler characteristic for a closed, genus-0 (sphere-topology) manifold is 2;
// a closed genus-1 (torus-topology) manifold is 0 — this is a topological
// fact, not a style choice, so torus is checked against 0 below (deviates
// from the plan's literal "==2 for box/sphere/torus/capped-cylinder" wording,
// which doesn't hold for an actual donut).
function eulerCharacteristic(cage: { positions: number[]; faces: number[][] }): number {
  const v = cage.positions.length / 3;
  const f = cage.faces.length;
  const e = buildTopology(cage).edgeVerts.size;
  return v - e + f;
}

describe("boxCage", () => {
  it("8 verts / 6 quads, closed manifold (Euler 2)", () => {
    const cage = boxCage(2, 3, 4);
    expect(cage.positions.length / 3).toBe(8);
    expect(cage.faces.length).toBe(6);
    expect(cage.faces.every((f) => f.length === 4)).toBe(true);
    assertIndicesInRange(cage.faces, 8);
    expect(eulerCharacteristic(cage)).toBe(2);
  });

  it("creases all 12 edges so a converted cube stays a cube under CC", () => {
    const cage = boxCage(2, 2, 2);
    const topo = buildTopology(cage);
    expect(cage.sharpEdges).toHaveLength(12);
    for (const k of cage.sharpEdges!) expect(topo.edgeVerts.has(k)).toBe(true);

    const out = subdivideCatmullClark(cage, 2);
    for (let i = 0; i < out.positions.length / 3; i++) {
      const m = Math.max(
        Math.abs(out.positions[i * 3]),
        Math.abs(out.positions[i * 3 + 1]),
        Math.abs(out.positions[i * 3 + 2]),
      );
      expect(m).toBeCloseTo(1, 10); // half-extent 1 -> every vert on the surface
    }
  });
});

describe("planeCage", () => {
  it("4 verts / 1 quad in the XY plane", () => {
    const cage = planeCage(2, 3);
    expect(cage.positions.length / 3).toBe(4);
    expect(cage.faces).toEqual([[0, 1, 2, 3]]);
    const zs = [0, 1, 2, 3].map((i) => cage.positions[i * 3 + 2]);
    expect(zs).toEqual([0, 0, 0, 0]); // flat in XY, facing +Z
    assertIndicesInRange(cage.faces, 4);
  });
});

describe("cylinderCage", () => {
  it("capped cylinder: ring+ring, quad sides, n-gon caps, closed (Euler 2)", () => {
    const segs = 8;
    const cage = cylinderCage(1, 1, 2, segs);
    expect(cage.positions.length / 3).toBe(segs * 2);
    // segs side quads + 2 n-gon caps
    expect(cage.faces.length).toBe(segs + 2);
    const sideFaces = cage.faces.slice(0, segs);
    const capFaces = cage.faces.slice(segs);
    expect(sideFaces.every((f) => f.length === 4)).toBe(true);
    expect(capFaces).toHaveLength(2);
    for (const cap of capFaces) expect(cap.length).toBe(segs); // n-gon, not a quad
    assertIndicesInRange(cage.faces, segs * 2);
    expect(eulerCharacteristic(cage)).toBe(2);
  });

  it("clamps radialSegments to [3,12]", () => {
    expect(cylinderCage(1, 1, 1, 1).positions.length / 3).toBe(6); // 3*2
    expect(cylinderCage(1, 1, 1, 100).positions.length / 3).toBe(24); // 12*2
  });

  it("cone (radiusTop=0) skips the degenerate top cap so the apex collapses cleanly", () => {
    const segs = 6;
    const cage = cylinderCage(0, 1, 2, segs);
    expect(cage.positions.length / 3).toBe(segs * 2);
    // segs side quads + 1 bottom n-gon cap only (no top cap)
    expect(cage.faces.length).toBe(segs + 1);
    const capFace = cage.faces[cage.faces.length - 1];
    expect(capFace.length).toBe(segs);
    assertIndicesInRange(cage.faces, segs * 2);
  });

  it("creases capped rims only: cylinder both rings, cone just the base", () => {
    const segs = 8;
    const cyl = cylinderCage(1, 1, 2, segs);
    expect(cyl.sharpEdges).toHaveLength(segs * 2);
    const topo = buildTopology(cyl);
    for (const k of cyl.sharpEdges!) expect(topo.edgeVerts.has(k)).toBe(true);
    // creased rims keep the caps flat AT the original height: rim vertex/edge
    // points + cap face point all stay on y=1 (uncreased, everything sinks)
    const out = subdivideCatmullClark(cyl, 1);
    const atTop = (cage: { positions: number[] }) => {
      let n = 0;
      for (let i = 0; i < cage.positions.length / 3; i++) {
        if (Math.abs(cage.positions[i * 3 + 1] - 1) < 1e-9) n++;
      }
      return n;
    };
    expect(atTop(out)).toBe(segs * 2 + 1);
    // uncreased, only the cap's face point (a pure centroid) stays — the
    // rim vertex/edge points all sink
    expect(atTop(subdivideCatmullClark({ ...cyl, sharpEdges: [] }, 1))).toBe(1);

    expect(cylinderCage(0, 1, 2, segs).sharpEdges).toHaveLength(segs);
  });
});

describe("sphereCage", () => {
  it("cube-sphere: no poles, closed manifold (Euler 2)", () => {
    const cage = sphereCage(1, 2);
    expect(cage.positions.length / 3).toBe(26); // 8 corners + 12 edge-mids + 6 face-centers
    expect(cage.faces.length).toBe(24); // 6 faces * 2*2 grid
    expect(cage.faces.every((f) => f.length === 4)).toBe(true);
    assertIndicesInRange(cage.faces, 26);
    expect(eulerCharacteristic(cage)).toBe(2);
    // every vertex actually lands on the sphere
    for (let i = 0; i < cage.positions.length / 3; i++) {
      const x = cage.positions[i * 3];
      const y = cage.positions[i * 3 + 1];
      const z = cage.positions[i * 3 + 2];
      expect(Math.sqrt(x * x + y * y + z * z)).toBeCloseTo(1, 5);
    }
  });

  it("welds shared edges/corners between the 6 cube faces (no duplicate verts)", () => {
    // a naive (unwelded) build would have 6 * (segments+1)^2 raw verts
    const cage = sphereCage(1, 3);
    expect(cage.positions.length / 3).toBeLessThan(6 * (3 + 1) ** 2);
  });
});

describe("torusCage", () => {
  it("radial x tubular quad grid, closed genus-1 manifold (Euler 0)", () => {
    const rSegs = 6;
    const tSegs = 10;
    const cage = torusCage(2, 0.5, rSegs, tSegs);
    expect(cage.positions.length / 3).toBe(rSegs * tSegs);
    expect(cage.faces.length).toBe(rSegs * tSegs);
    expect(cage.faces.every((f) => f.length === 4)).toBe(true);
    assertIndicesInRange(cage.faces, rSegs * tSegs);
    // torus is genus 1, not genus 0 — Euler characteristic is 0, not 2
    expect(eulerCharacteristic(cage)).toBe(0);
  });

  it("clamps segment counts to sane low ranges", () => {
    const cage = torusCage(2, 0.5, 100, 200);
    expect(cage.positions.length / 3).toBe(8 * 16); // radial clamped to 8, tubular to 16
  });
});

describe("cageFromGeometry", () => {
  it("returns null for unsupported convert sources", () => {
    expect(cageFromGeometry("capsule", {})).toBeNull();
    expect(cageFromGeometry("text3d", {})).toBeNull();
  });

  it("builds a cage for every supported primitive kind", () => {
    expect(cageFromGeometry("box", { width: 1, height: 1, depth: 1 })).not.toBeNull();
    expect(cageFromGeometry("plane", { width: 1, height: 1 })).not.toBeNull();
    expect(cageFromGeometry("cylinder", {})).not.toBeNull();
    expect(cageFromGeometry("cone", {})).not.toBeNull();
    expect(cageFromGeometry("sphere", {})).not.toBeNull();
    expect(cageFromGeometry("torus", {})).not.toBeNull();
  });

  it("leaves smooth-by-design cages (sphere, torus) uncreased", () => {
    expect(cageFromGeometry("sphere", {})?.sharpEdges ?? []).toHaveLength(0);
    expect(cageFromGeometry("torus", {})?.sharpEdges ?? []).toHaveLength(0);
  });
});

describe("primitives feed Catmull-Clark cleanly", () => {
  it("subdividing a unit box cage once yields 26 verts (sanity oracle)", () => {
    const out = subdivideCatmullClark(boxCage(1, 1, 1), 1);
    expect(out.positions.length / 3).toBe(26);
  });
});
