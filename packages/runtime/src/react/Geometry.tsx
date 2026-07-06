"use client";

import { useEffect, useMemo } from "react";
import { Shape, ShapeGeometry } from "three";
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
    case "cylinder":
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
    case "cone":
      return (
        <coneGeometry
          args={[n("radius", 0.5), n("height", 1), n("radialSegments", 32)]}
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
