import { describe, expect, it } from "vitest";
import { Matrix4, Quaternion, Vector3 } from "three";
import { buildTopology, edgeKey } from "@/runtime/mesh";
import type { MeshSelection } from "../store/ui";
import { applyProxyDeltaToLocal, centroidOf, selectedVertexSet } from "./meshEditMath";

function emptySelection(): MeshSelection {
  return { vertices: new Set(), edges: new Set(), faces: new Set() };
}

// single quad, verts 0..3 CCW
const QUAD = {
  positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
  faces: [[0, 1, 2, 3]],
};
const QUAD_VERTEX_COUNT = QUAD.positions.length / 3;

describe("selectedVertexSet", () => {
  it("unions raw vertex picks with edge endpoints, deduped", () => {
    const topo = buildTopology(QUAD);
    const sel: MeshSelection = {
      ...emptySelection(),
      vertices: new Set([0]),
      edges: new Set([edgeKey(1, 2)]),
    };
    const verts = selectedVertexSet(sel, topo, QUAD.faces, QUAD_VERTEX_COUNT).sort();
    expect(verts).toEqual([0, 1, 2]);
  });

  it("expands a face pick to all of its verts", () => {
    const topo = buildTopology(QUAD);
    const sel: MeshSelection = { ...emptySelection(), faces: new Set([0]) };
    const verts = selectedVertexSet(sel, topo, QUAD.faces, QUAD_VERTEX_COUNT).sort();
    expect(verts).toEqual([0, 1, 2, 3]);
  });

  it("returns empty for an empty selection", () => {
    const topo = buildTopology(QUAD);
    expect(selectedVertexSet(emptySelection(), topo, QUAD.faces, QUAD_VERTEX_COUNT)).toEqual([]);
  });

  it("ignores a stale edge key or out-of-range face index (defensive)", () => {
    const topo = buildTopology(QUAD);
    const sel: MeshSelection = {
      vertices: new Set(),
      edges: new Set(["99_100"]),
      faces: new Set([7]),
    };
    expect(selectedVertexSet(sel, topo, QUAD.faces, QUAD_VERTEX_COUNT)).toEqual([]);
  });

  it("drops selected vertices left out of range by geometry shrinking underneath a stale selection (e.g. undo)", () => {
    const topo = buildTopology(QUAD);
    const sel: MeshSelection = {
      ...emptySelection(),
      vertices: new Set([0, 99]),
    };
    const verts = selectedVertexSet(sel, topo, QUAD.faces, QUAD_VERTEX_COUNT).sort();
    expect(verts).toEqual([0]);
    expect(centroidOf(QUAD.positions, verts).toArray().every(Number.isFinite)).toBe(true);
  });
});

describe("centroidOf", () => {
  it("averages the given vertex positions", () => {
    const c = centroidOf(QUAD.positions, [0, 1, 2, 3]);
    expect(c.toArray()).toEqual([0.5, 0.5, 0]);
  });

  it("averages a subset, not all verts", () => {
    const c = centroidOf(QUAD.positions, [0, 1]);
    expect(c.toArray()).toEqual([0.5, 0, 0]);
  });

  it("returns the origin for an empty index list", () => {
    const c = centroidOf(QUAD.positions, []);
    expect(c.toArray()).toEqual([0, 0, 0]);
  });
});

describe("applyProxyDeltaToLocal", () => {
  const identity = new Matrix4();

  it("pure translate: identity node transform, delta passes through unchanged", () => {
    const proxyStart = new Matrix4().makeTranslation(2, 0, 0);
    const proxyNow = new Matrix4().makeTranslation(3, 2, 3);
    const out = applyProxyDeltaToLocal(
      [0, 0, 0],
      identity,
      identity,
      proxyNow,
      proxyStart.clone().invert(),
    );
    expect(out[0]).toBeCloseTo(1);
    expect(out[1]).toBeCloseTo(2);
    expect(out[2]).toBeCloseTo(3);
  });

  it("moves multiple verts independently in one call", () => {
    const proxyStart = new Matrix4(); // origin
    const proxyNow = new Matrix4().makeTranslation(5, 0, 0);
    const out = applyProxyDeltaToLocal(
      [0, 0, 0, 1, 1, 1],
      identity,
      identity,
      proxyNow,
      proxyStart.clone().invert(),
    );
    expect(out).toHaveLength(6);
    expect(out.slice(0, 3).map((n) => Math.round(n))).toEqual([5, 0, 0]);
    expect(out.slice(3, 6).map((n) => Math.round(n))).toEqual([6, 1, 1]);
  });

  it("respects a rotated node transform when converting world delta to local", () => {
    // node rotated 90deg about Y; a pure world-space +X proxy translation
    // must come out as local +Z (rotationY(90).inverse() maps +X -> +Z).
    const nodeMatrixWorld = new Matrix4().makeRotationY(Math.PI / 2);
    const nodeMatrixWorldInverse = nodeMatrixWorld.clone().invert();
    const proxyStart = new Matrix4(); // world origin, no rotation
    const proxyNow = new Matrix4().makeTranslation(1, 0, 0);
    const out = applyProxyDeltaToLocal(
      [0, 0, 0],
      nodeMatrixWorld,
      nodeMatrixWorldInverse,
      proxyNow,
      proxyStart.clone().invert(),
    );
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(0);
    expect(out[2]).toBeCloseTo(1);
  });

  it("rotate mode pivots about the proxy's own origin (centroid), not the world origin", () => {
    // proxy centered at (1,0,0); vertex sits 1 unit further out at (2,0,0).
    // after a 90deg-about-Y rotate-in-place drag, the centroid stays put and
    // the vertex swings to the other side: (1,0,-1).
    const proxyStart = new Matrix4().makeTranslation(1, 0, 0);
    const rotated = new Matrix4().compose(
      new Vector3(1, 0, 0),
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2),
      new Vector3(1, 1, 1),
    );
    const out = applyProxyDeltaToLocal(
      [2, 0, 0],
      identity,
      identity,
      rotated,
      proxyStart.clone().invert(),
    );
    expect(out[0]).toBeCloseTo(1);
    expect(out[1]).toBeCloseTo(0);
    expect(out[2]).toBeCloseTo(-1);
  });
});
