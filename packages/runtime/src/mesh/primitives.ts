// pure geometry — no editor/app imports (packages/runtime import boundary).
// low-poly control-cage generators for "convert to editable mesh": these are
// NOT tessellated render geometry (that's dense micro-tri garbage, e.g.
// RoundedBox smoothness=4) — cages stay editable, CC subdivision densifies
// them at render time. All quad faces are wound CCW (outward normal via
// right-hand rule) — verified numerically against Newell's-method face
// normals for every generator below before writing this file.

import { numParam, type GeometryKind, type GeometryParams } from "../schema";
import type { Cage } from "./topology";

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** 8 verts / 6 quads, centered on origin — matches RoundedBoxGeometry's box arm */
export function boxCage(width: number, height: number, depth: number): Cage {
  const w = width / 2;
  const h = height / 2;
  const d = depth / 2;
  const positions = [
    -w, -h, -d, // 0
    w, -h, -d, // 1
    w, h, -d, // 2
    -w, h, -d, // 3
    -w, -h, d, // 4
    w, -h, d, // 5
    w, h, d, // 6
    -w, h, d, // 7
  ];
  const faces = [
    [4, 5, 6, 7], // front  (+z)
    [0, 3, 2, 1], // back   (-z)
    [0, 4, 7, 3], // left   (-x)
    [1, 2, 6, 5], // right  (+x)
    [3, 7, 6, 2], // top    (+y)
    [0, 1, 5, 4], // bottom (-y)
  ];
  return { positions, faces };
}

/** 4 verts / 1 quad, in the XY plane facing +Z — matches three's planeGeometry */
export function planeCage(width: number, height: number): Cage {
  const w = width / 2;
  const h = height / 2;
  const positions = [
    -w, -h, 0, // 0 bottom-left
    w, -h, 0, // 1 bottom-right
    w, h, 0, // 2 top-right
    -w, h, 0, // 3 top-left
  ];
  return { positions, faces: [[0, 1, 2, 3]] };
}

/**
 * Ring+ring+side-quads cylinder/cone cage. Height centered on origin (y from
 * -h/2 to +h/2), matching three's cylinderGeometry. Cone = radiusTop 0.
 * A zero-radius end skips its cap face so the ring collapses into an apex
 * under Catmull-Clark instead of a degenerate cap polygon.
 */
export function cylinderCage(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  radialSegments: number,
): Cage {
  const segs = clamp(Math.round(radialSegments), 3, 12);
  const h2 = height / 2;
  const positions: number[] = [];
  for (let i = 0; i < segs; i++) {
    const theta = (i / segs) * Math.PI * 2;
    positions.push(radiusBottom * Math.cos(theta), -h2, radiusBottom * Math.sin(theta));
  }
  for (let i = 0; i < segs; i++) {
    const theta = (i / segs) * Math.PI * 2;
    positions.push(radiusTop * Math.cos(theta), h2, radiusTop * Math.sin(theta));
  }
  const faces: number[][] = [];
  for (let i = 0; i < segs; i++) {
    const ni = (i + 1) % segs;
    const b0 = i;
    const b1 = ni;
    const t0 = segs + i;
    const t1 = segs + ni;
    // [bottom(i), top(i), top(i+1), bottom(i+1)] — verified outward via Newell normal
    faces.push([b0, t0, t1, b1]);
  }
  if (radiusBottom > 0) {
    faces.push(Array.from({ length: segs }, (_, i) => i));
  }
  if (radiusTop > 0) {
    // reversed order flips the winding so the top cap's normal points +y
    faces.push(Array.from({ length: segs }, (_, i) => segs + (segs - 1 - i)));
  }
  return { positions, faces };
}

/** dedupe verts that land on (near-)identical positions, remapping face indices */
function weldByPosition(rawPositions: number[], rawFaces: number[][]): Cage {
  const key = (x: number, y: number, z: number) =>
    `${x.toFixed(5)}_${y.toFixed(5)}_${z.toFixed(5)}`;
  const seen = new Map<string, number>();
  const positions: number[] = [];
  const remap: number[] = new Array(rawPositions.length / 3);
  for (let i = 0; i < rawPositions.length / 3; i++) {
    const x = rawPositions[i * 3];
    const y = rawPositions[i * 3 + 1];
    const z = rawPositions[i * 3 + 2];
    const k = key(x, y, z);
    let idx = seen.get(k);
    if (idx === undefined) {
      idx = positions.length / 3;
      positions.push(x, y, z);
      seen.set(k, idx);
    }
    remap[i] = idx;
  }
  return { positions, faces: rawFaces.map((f) => f.map((v) => remap[v])) };
}

type Vec3 = [number, number, number];

// per cube face: outward normal axis + two tangent axes (u,v) s.t. u×v = normal —
// gives the (i,j),(i+1,j),(i+1,j+1),(i,j+1) quad an outward-facing winding
// (same rule verified for planeCage: increasing-u-then-v is CCW when u×v=normal).
const CUBE_FACES: { normal: Vec3; u: Vec3; v: Vec3 }[] = [
  { normal: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] }, // +x
  { normal: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] }, // -x
  { normal: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] }, // +y
  { normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] }, // -y
  { normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, // +z
  { normal: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] }, // -z
];

/** cube-sphere / quad-sphere: subdivide each of the 6 cube faces into a
 * segments×segments grid, normalize each vert to the sphere, scale by
 * radius, weld shared edge/corner verts — a closed manifold with no poles. */
export function sphereCage(radius: number, segments: number): Cage {
  const segs = clamp(Math.round(segments), 1, 8);
  const rawPositions: number[] = [];
  const rawFaces: number[][] = [];
  for (const { normal, u, v } of CUBE_FACES) {
    const base = rawPositions.length / 3;
    const idx = (i: number, j: number) => base + i * (segs + 1) + j;
    for (let i = 0; i <= segs; i++) {
      const uu = -1 + (2 * i) / segs;
      for (let j = 0; j <= segs; j++) {
        const vv = -1 + (2 * j) / segs;
        const x = normal[0] + u[0] * uu + v[0] * vv;
        const y = normal[1] + u[1] * uu + v[1] * vv;
        const z = normal[2] + u[2] * uu + v[2] * vv;
        const len = Math.sqrt(x * x + y * y + z * z) || 1;
        rawPositions.push((x / len) * radius, (y / len) * radius, (z / len) * radius);
      }
    }
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < segs; j++) {
        rawFaces.push([idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)]);
      }
    }
  }
  return weldByPosition(rawPositions, rawFaces);
}

/** radialSegments × tubularSegments quad grid wrapped in both directions —
 * fully closed, no poles. Position formula matches three's TorusGeometry
 * (big circle in XY, tube offset along Z) so convert doesn't visibly jump. */
export function torusCage(
  radius: number,
  tube: number,
  radialSegments: number,
  tubularSegments: number,
): Cage {
  const rSegs = clamp(Math.round(radialSegments), 3, 8);
  const tSegs = clamp(Math.round(tubularSegments), 3, 16);
  const positions: number[] = [];
  for (let i = 0; i < tSegs; i++) {
    const theta = (i / tSegs) * Math.PI * 2;
    for (let j = 0; j < rSegs; j++) {
      const phi = (j / rSegs) * Math.PI * 2;
      const r = radius + tube * Math.cos(phi);
      positions.push(r * Math.cos(theta), r * Math.sin(theta), tube * Math.sin(phi));
    }
  }
  const idx = (i: number, j: number) => (i % tSegs) * rSegs + (j % rSegs);
  const faces: number[][] = [];
  for (let i = 0; i < tSegs; i++) {
    for (let j = 0; j < rSegs; j++) {
      faces.push([idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)]);
    }
  }
  return { positions, faces };
}

/** convert-source dispatcher — null for kinds v1 doesn't support (capsule, text3d) */
export function cageFromGeometry(kind: GeometryKind, params: GeometryParams): Cage | null {
  switch (kind) {
    case "box":
      return boxCage(
        numParam(params, "width", 1),
        numParam(params, "height", 1),
        numParam(params, "depth", 1),
      );
    case "plane":
      return planeCage(numParam(params, "width", 2), numParam(params, "height", 2));
    case "cylinder":
      return cylinderCage(
        numParam(params, "radiusTop", 0.5),
        numParam(params, "radiusBottom", 0.5),
        numParam(params, "height", 1),
        numParam(params, "radialSegments", 32),
      );
    case "cone":
      return cylinderCage(
        0,
        numParam(params, "radius", 0.5),
        numParam(params, "height", 1),
        numParam(params, "radialSegments", 32),
      );
    case "sphere": {
      const widthSegments = numParam(params, "widthSegments", 32);
      // dense render-tessellation param -> a low, editable cage grid
      const segments = clamp(Math.round(widthSegments / 16), 2, 4);
      return sphereCage(numParam(params, "radius", 0.5), segments);
    }
    case "torus":
      return torusCage(
        numParam(params, "radius", 0.5),
        numParam(params, "tube", 0.2),
        numParam(params, "radialSegments", 16),
        numParam(params, "tubularSegments", 48),
      );
    case "capsule":
    case "text3d":
      return null;
    default:
      return null;
  }
}
