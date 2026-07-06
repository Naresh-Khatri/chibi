"use client";

import { numParam, type GeometryKind, type GeometryParams } from "../schema";

/** host app must ship this font in public/ (text3d meshes) */
export const FONT_URL = "/fonts/helvetiker_regular.typeface.json";

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
      return <boxGeometry args={[n("width", 1), n("height", 1), n("depth", 1)]} />;
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
      return <planeGeometry args={[n("width", 2), n("height", 2)]} />;
    default:
      return null;
  }
}
