import type { GeometryKind, GeometryParams } from "./types";

export type GeometryParamDef = {
  key: string;
  label: string;
  type: "number" | "text";
  default: number | string;
  min?: number;
  max?: number;
  step?: number;
};

export const GEOMETRY_DEFS: Record<
  GeometryKind,
  { label: string; params: GeometryParamDef[] }
> = {
  box: {
    label: "Box",
    params: [
      { key: "width", label: "Width", type: "number", default: 1, min: 0.01, step: 0.1 },
      { key: "height", label: "Height", type: "number", default: 1, min: 0.01, step: 0.1 },
      { key: "depth", label: "Depth", type: "number", default: 1, min: 0.01, step: 0.1 },
      { key: "radius", label: "Corner radius", type: "number", default: 0.05, min: 0, max: 0.5, step: 0.01 },
      { key: "smoothness", label: "Smoothness", type: "number", default: 4, min: 1, max: 16, step: 1 },
    ],
  },
  sphere: {
    label: "Sphere",
    params: [
      { key: "radius", label: "Radius", type: "number", default: 0.5, min: 0.01, step: 0.1 },
      { key: "widthSegments", label: "Segments W", type: "number", default: 32, min: 3, max: 128, step: 1 },
      { key: "heightSegments", label: "Segments H", type: "number", default: 16, min: 2, max: 64, step: 1 },
    ],
  },
  cylinder: {
    label: "Cylinder",
    params: [
      { key: "radiusTop", label: "Radius top", type: "number", default: 0.5, min: 0, step: 0.1 },
      { key: "radiusBottom", label: "Radius bottom", type: "number", default: 0.5, min: 0, step: 0.1 },
      { key: "height", label: "Height", type: "number", default: 1, min: 0.01, step: 0.1 },
      { key: "radialSegments", label: "Segments", type: "number", default: 32, min: 3, max: 128, step: 1 },
      { key: "fillet", label: "Edge fillet", type: "number", default: 0, min: 0, max: 0.5, step: 0.01 },
    ],
  },
  cone: {
    label: "Cone",
    params: [
      { key: "radius", label: "Radius", type: "number", default: 0.5, min: 0.01, step: 0.1 },
      { key: "height", label: "Height", type: "number", default: 1, min: 0.01, step: 0.1 },
      { key: "radialSegments", label: "Segments", type: "number", default: 32, min: 3, max: 128, step: 1 },
      { key: "fillet", label: "Base fillet", type: "number", default: 0, min: 0, max: 0.5, step: 0.01 },
    ],
  },
  capsule: {
    label: "Capsule",
    params: [
      { key: "radius", label: "Radius", type: "number", default: 0.3, min: 0.01, step: 0.05 },
      { key: "length", label: "Length", type: "number", default: 0.8, min: 0, step: 0.1 },
      { key: "capSegments", label: "Cap segments", type: "number", default: 8, min: 1, max: 32, step: 1 },
      { key: "radialSegments", label: "Segments", type: "number", default: 24, min: 3, max: 64, step: 1 },
    ],
  },
  torus: {
    label: "Torus",
    params: [
      { key: "radius", label: "Radius", type: "number", default: 0.5, min: 0.01, step: 0.1 },
      { key: "tube", label: "Tube", type: "number", default: 0.2, min: 0.01, step: 0.05 },
      { key: "radialSegments", label: "Segments R", type: "number", default: 16, min: 3, max: 64, step: 1 },
      { key: "tubularSegments", label: "Segments T", type: "number", default: 48, min: 3, max: 200, step: 1 },
    ],
  },
  plane: {
    label: "Plane",
    params: [
      { key: "width", label: "Width", type: "number", default: 2, min: 0.01, step: 0.1 },
      { key: "height", label: "Height", type: "number", default: 2, min: 0.01, step: 0.1 },
      { key: "cornerRadius", label: "Corner radius", type: "number", default: 0, min: 0, max: 1, step: 0.01 },
    ],
  },
  text3d: {
    label: "Text",
    params: [
      { key: "text", label: "Text", type: "text", default: "chibi" },
      { key: "size", label: "Size", type: "number", default: 0.5, min: 0.01, step: 0.1 },
      { key: "depth", label: "Depth", type: "number", default: 0.2, min: 0, step: 0.05 },
      { key: "bevel", label: "Bevel", type: "number", default: 0.01, min: 0, max: 0.1, step: 0.005 },
    ],
  },
};

export function defaultGeometryParams(kind: GeometryKind): GeometryParams {
  return Object.fromEntries(
    GEOMETRY_DEFS[kind].params.map((p) => [p.key, p.default]),
  );
}

export function numParam(
  params: GeometryParams,
  key: string,
  fallback: number,
): number {
  const v = params[key];
  return typeof v === "number" ? v : fallback;
}

export function strParam(
  params: GeometryParams,
  key: string,
  fallback: string,
): string {
  const v = params[key];
  return typeof v === "string" ? v : fallback;
}
