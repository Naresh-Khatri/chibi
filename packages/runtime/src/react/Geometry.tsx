"use client";

import { useEffect, useMemo } from "react";
import { LatheGeometry, Shape, ShapeGeometry, Vector2 } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { numParam, type GeometryKind, type GeometryParams } from "../schema";

/** host app must ship this font in public/ (text3d meshes) */
export const FONT_URL = "/fonts/helvetiker_regular.typeface.json";

function RoundedBoxGeom({ params }: { params: GeometryParams }) {
  const width = numParam(params, "width", 1);
  const height = numParam(params, "height", 1);
  const depth = numParam(params, "depth", 1);
  const radius = Math.min(
    numParam(params, "radius", 0),
    Math.min(width, height, depth) / 2,
  );
  const smoothness = Math.round(numParam(params, "smoothness", 4));
  const geo = useMemo(
    () =>
      radius > 0
        ? new RoundedBoxGeometry(width, height, depth, smoothness, radius)
        : null,
    [width, height, depth, smoothness, radius],
  );
  useEffect(() => () => geo?.dispose(), [geo]);
  if (!geo) return <boxGeometry args={[width, height, depth]} />;
  return <primitive object={geo} attach="geometry" />;
}

function RoundedPlaneGeom({ params }: { params: GeometryParams }) {
  const width = numParam(params, "width", 2);
  const height = numParam(params, "height", 2);
  const radius = Math.min(
    numParam(params, "cornerRadius", 0),
    Math.min(width, height) / 2,
  );
  const geo = useMemo(() => {
    if (radius <= 0) return null;
    const w = width / 2;
    const h = height / 2;
    const r = radius;
    const shape = new Shape();
    shape.moveTo(-w + r, -h);
    shape.lineTo(w - r, -h);
    shape.absarc(w - r, -h + r, r, -Math.PI / 2, 0, false);
    shape.lineTo(w, h - r);
    shape.absarc(w - r, h - r, r, 0, Math.PI / 2, false);
    shape.lineTo(-w + r, h);
    shape.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(-w, -h + r);
    shape.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
    const g = new ShapeGeometry(shape, 8);
    // ShapeGeometry UVs are in shape units; remap to 0..1 like planeGeometry
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) / width + 0.5, uv.getY(i) / height + 0.5);
    }
    return g;
  }, [width, height, radius]);
  useEffect(() => () => geo?.dispose(), [geo]);
  if (!geo) return <planeGeometry args={[width, height]} />;
  return <primitive object={geo} attach="geometry" />;
}

/**
 * Rounds the corner at `corner` (between segments prev→corner→next) with a
 * circular arc of radius ≤ r, clamped so the tangent points stay inside both
 * segments. Returns the arc as a point list (replaces the sharp corner).
 */
function filletCorner(
  prev: Vector2,
  corner: Vector2,
  next: Vector2,
  r: number,
  segs = 6,
): Vector2[] {
  const v1 = prev.clone().sub(corner);
  const v2 = next.clone().sub(corner);
  const l1 = v1.length();
  const l2 = v2.length();
  if (r <= 0 || l1 === 0 || l2 === 0) return [corner.clone()];
  v1.divideScalar(l1);
  v2.divideScalar(l2);
  const angle = Math.acos(Math.min(1, Math.max(-1, v1.dot(v2))));
  if (angle < 1e-3 || Math.PI - angle < 1e-3) return [corner.clone()];
  const half = angle / 2;
  const t = Math.min(r / Math.tan(half), l1 * 0.49, l2 * 0.49);
  const radius = t * Math.tan(half);
  const p1 = corner.clone().addScaledVector(v1, t);
  const p2 = corner.clone().addScaledVector(v2, t);
  const center = corner
    .clone()
    .addScaledVector(v1.clone().add(v2).normalize(), radius / Math.sin(half));
  const a1 = Math.atan2(p1.y - center.y, p1.x - center.x);
  let sweep = Math.atan2(p2.y - center.y, p2.x - center.x) - a1;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;
  const pts: Vector2[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = a1 + (sweep * i) / segs;
    pts.push(
      new Vector2(center.x + radius * Math.cos(a), center.y + radius * Math.sin(a)),
    );
  }
  return pts;
}

/** cylinder/cone (frustum) with filleted rim edges, as a lathe profile */
function FilletedFrustumGeom({
  radiusBottom,
  radiusTop,
  height,
  fillet,
  radialSegments,
}: {
  radiusBottom: number;
  radiusTop: number;
  height: number;
  fillet: number;
  radialSegments: number;
}) {
  const geo = useMemo(() => {
    const h = height / 2;
    const bottomAxis = new Vector2(0, -h);
    const topAxis = new Vector2(0, h);
    const bottomRim = new Vector2(radiusBottom, -h);
    const topRim = new Vector2(radiusTop, h);
    const profile: Vector2[] = [
      bottomAxis,
      ...filletCorner(bottomAxis, bottomRim, topRim, fillet),
      ...(radiusTop > 0
        ? filletCorner(bottomRim, topRim, topAxis, fillet)
        : []),
      topAxis,
    ];
    return new LatheGeometry(profile, radialSegments);
  }, [radiusBottom, radiusTop, height, fillet, radialSegments]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <primitive object={geo} attach="geometry" />;
}

/** parametric geometry for a mesh node; shared by editor + runtime */
export function GeometryElement({
  kind,
  params,
}: {
  kind: GeometryKind;
  params: GeometryParams;
}) {
  const n = (key: string, fallback: number) => numParam(params, key, fallback);
  switch (kind) {
    case "box":
      return <RoundedBoxGeom params={params} />;
    case "sphere":
      return (
        <sphereGeometry
          args={[n("radius", 0.5), n("widthSegments", 32), n("heightSegments", 16)]}
        />
      );
    case "cylinder": {
      const fillet = n("fillet", 0);
      if (fillet > 0) {
        return (
          <FilletedFrustumGeom
            radiusBottom={n("radiusBottom", 0.5)}
            radiusTop={n("radiusTop", 0.5)}
            height={n("height", 1)}
            fillet={fillet}
            radialSegments={n("radialSegments", 32)}
          />
        );
      }
      return (
        <cylinderGeometry
          args={[
            n("radiusTop", 0.5),
            n("radiusBottom", 0.5),
            n("height", 1),
            n("radialSegments", 32),
          ]}
        />
      );
    }
    case "cone": {
      const fillet = n("fillet", 0);
      if (fillet > 0) {
        return (
          <FilletedFrustumGeom
            radiusBottom={n("radius", 0.5)}
            radiusTop={0}
            height={n("height", 1)}
            fillet={fillet}
            radialSegments={n("radialSegments", 32)}
          />
        );
      }
      return (
        <coneGeometry
          args={[n("radius", 0.5), n("height", 1), n("radialSegments", 32)]}
        />
      );
    }
    case "capsule":
      return (
        <capsuleGeometry
          args={[
            n("radius", 0.3),
            n("length", 0.8),
            Math.max(1, Math.round(n("capSegments", 8))),
            Math.max(3, Math.round(n("radialSegments", 24))),
          ]}
        />
      );
    case "torus":
      return (
        <torusGeometry
          args={[
            n("radius", 0.5),
            n("tube", 0.2),
            n("radialSegments", 16),
            n("tubularSegments", 48),
          ]}
        />
      );
    case "plane":
      return <RoundedPlaneGeom params={params} />;
    default:
      return null;
  }
}
