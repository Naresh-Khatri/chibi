// Typed registry of animatable properties (like GEOMETRY_DEFS for params).
// The sampler interpolates by value shape; this registry drives UI: the
// "+ Track" menu, row labels and per-kind keyframe value editors.

export type AnimatableKind = "vec3" | "color" | "scalar" | "step";

export type AnimatableDef = {
  /** Property path stored on the track, e.g. "transform.position". */
  property: string;
  label: string;
  kind: AnimatableKind;
  min?: number;
  max?: number;
};

export const NODE_ANIMATABLES: AnimatableDef[] = [
  { property: "transform.position", label: "Position", kind: "vec3" },
  { property: "transform.rotation", label: "Rotation", kind: "vec3" },
  { property: "transform.scale", label: "Scale", kind: "vec3" },
  { property: "visible", label: "Visible", kind: "step" },
];

export const MATERIAL_ANIMATABLES: AnimatableDef[] = [
  { property: "color", label: "Color", kind: "color" },
  { property: "opacity", label: "Opacity", kind: "scalar", min: 0, max: 1 },
];

export function nodeAnimatable(property: string): AnimatableDef | undefined {
  return NODE_ANIMATABLES.find((a) => a.property === property);
}

export function materialAnimatable(property: string): AnimatableDef | undefined {
  return MATERIAL_ANIMATABLES.find((a) => a.property === property);
}
