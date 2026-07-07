import { z } from "zod";
import { migrateDocument } from "./migrate";

export const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof vec3Schema>;

// rotation is Euler XYZ in radians; UI converts to degrees
export const transformSchema = z.object({
  position: vec3Schema,
  rotation: vec3Schema,
  scale: vec3Schema,
});
export type Transform = z.infer<typeof transformSchema>;

export const GEOMETRY_KINDS = [
  "box",
  "sphere",
  "cylinder",
  "cone",
  "capsule",
  "torus",
  "plane",
  "text3d",
] as const;
export const geometryKindSchema = z.enum(GEOMETRY_KINDS);
export type GeometryKind = z.infer<typeof geometryKindSchema>;

export const geometryParamsSchema = z.record(
  z.string(),
  z.union([z.number(), z.string()]),
);
export type GeometryParams = z.infer<typeof geometryParamsSchema>;

const nodeBase = {
  id: z.string(),
  name: z.string(),
  visible: z.boolean(),
  transform: transformSchema,
  children: z.array(z.string()),
};

export const meshNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("mesh"),
  geometry: z.object({
    kind: geometryKindSchema,
    params: geometryParamsSchema,
  }),
  materialId: z.string(),
  castShadow: z.boolean(),
  receiveShadow: z.boolean(),
});
export type MeshNode = z.infer<typeof meshNodeSchema>;

export const groupNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("group"),
});
export type GroupNode = z.infer<typeof groupNodeSchema>;

export const LIGHT_KINDS = ["directional", "point", "spot"] as const;
export const lightKindSchema = z.enum(LIGHT_KINDS);
export type LightKind = z.infer<typeof lightKindSchema>;

export const lightNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("light"),
  light: z.object({
    kind: lightKindSchema,
    color: z.string(),
    intensity: z.number(),
    distance: z.number().optional(),
    angle: z.number().optional(),
    penumbra: z.number().optional(),
    castShadow: z.boolean(),
  }),
});
export type LightNode = z.infer<typeof lightNodeSchema>;

export const modelNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("model"),
  assetId: z.string(),
  castShadow: z.boolean(),
  receiveShadow: z.boolean(),
});
export type ModelNode = z.infer<typeof modelNodeSchema>;

export const nodeSchema = z.discriminatedUnion("type", [
  meshNodeSchema,
  groupNodeSchema,
  lightNodeSchema,
  modelNodeSchema,
]);
export type ChibiNode = z.infer<typeof nodeSchema>;

export const materialSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.literal("standard"),
  color: z.string(),
  metalness: z.number(),
  roughness: z.number(),
  emissive: z.string(),
  emissiveIntensity: z.number(),
  opacity: z.number(),
  transparent: z.boolean(),
  flatShading: z.boolean(),
  // soft-plastic / clay extras (MeshPhysicalMaterial); defaults keep old docs valid
  clearcoat: z.number().default(0),
  clearcoatRoughness: z.number().default(0.5),
  sheen: z.number().default(0),
  sheenColor: z.string().default("#ffffff"),
  maps: z.object({
    map: z.string().nullable(),
    normalMap: z.string().nullable(),
    roughnessMap: z.string().nullable(),
  }),
});
export type ChibiMaterial = z.infer<typeof materialSchema>;

export const assetSchema = z.object({
  id: z.string(),
  kind: z.enum(["glb", "texture"]),
  name: z.string(),
  hash: z.string(),
  size: z.number(),
});
export type ChibiAsset = z.infer<typeof assetSchema>;

export const easingSchema = z.enum([
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut",
]);
export type Easing = z.infer<typeof easingSchema>;

export const propertyValueSchema = z.union([
  z.number(),
  z.string(),
  z.boolean(),
  vec3Schema,
]);
export type PropertyValue = z.infer<typeof propertyValueSchema>;

export const keyframeSchema = z.object({
  t: z.number(),
  v: propertyValueSchema,
  ease: easingSchema.optional(),
});
export type Keyframe = z.infer<typeof keyframeSchema>;

export const trackSchema = z.object({
  targetId: z.string(),
  property: z.string(),
  keyframes: z.array(keyframeSchema),
});
export type Track = z.infer<typeof trackSchema>;

export const animationClipSchema = z.object({
  id: z.string(),
  name: z.string(),
  duration: z.number(),
  loop: z.boolean(),
  tracks: z.array(trackSchema),
});
export type AnimationClip = z.infer<typeof animationClipSchema>;

// per-object: a state belongs to a node. overrides may target the owner node
// (transform.*, visible) and its material (color, opacity)
export const objectStateSchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  name: z.string(),
  overrides: z.record(z.string(), z.record(z.string(), propertyValueSchema)),
});
export type ObjectState = z.infer<typeof objectStateSchema>;

export const triggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("click"), nodeId: z.string() }),
  z.object({ type: z.literal("hoverEnter"), nodeId: z.string() }),
  z.object({ type: z.literal("hoverExit"), nodeId: z.string() }),
]);
export type Trigger = z.infer<typeof triggerSchema>;

// state actions name the owner object; `to`/`a`/`b` are its state ids or "base"
export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("transition"),
    nodeId: z.string(),
    to: z.string(),
    duration: z.number(),
    ease: easingSchema,
  }),
  z.object({ type: z.literal("playAnimation"), animationId: z.string() }),
  z.object({
    type: z.literal("toggleStates"),
    nodeId: z.string(),
    a: z.string(),
    b: z.string(),
    duration: z.number(),
    ease: easingSchema,
  }),
]);
export type Action = z.infer<typeof actionSchema>;

export const interactionSchema = z.object({
  id: z.string(),
  trigger: triggerSchema,
  action: actionSchema,
});
export type Interaction = z.infer<typeof interactionSchema>;

// "soft" is chibi's built-in studio rig (no CDN fetch); the rest are drei HDRIs
export const ENVIRONMENT_PRESETS = [
  "soft",
  "city",
  "studio",
  "sunset",
  "dawn",
  "forest",
] as const;
// tone-mapping curves: aces = three's default filmic, neutral = Khronos
// PBR-neutral (keeps pastel hex colors true), agx = softest highlight rolloff
export const TONE_MAPPINGS = ["aces", "neutral", "agx"] as const;
export const environmentSchema = z.object({
  background: z.string(),
  preset: z.enum(ENVIRONMENT_PRESETS).nullable(),
  fog: z
    .object({ color: z.string(), near: z.number(), far: z.number() })
    .nullable(),
  shadows: z.boolean(),
  // look controls (defaults keep old docs valid)
  exposure: z.number().default(1),
  softShadows: z.boolean().default(false),
  contactShadows: z.boolean().default(false),
  // when set, the background becomes a screen-space radial gradient from
  // `background` at the center to this color at the edges
  backgroundGradient: z.string().nullable().default(null),
  toneMapping: z.enum(TONE_MAPPINGS).default("aces"),
  // postprocessing (any one of these mounts the effect composer)
  ao: z.boolean().default(false),
  bloom: z.boolean().default(false),
  vignette: z.boolean().default(false),
});
export type Environment = z.infer<typeof environmentSchema>;

export const cameraSchema = z.object({
  position: vec3Schema,
  target: vec3Schema,
  fov: z.number(),
});
export type CameraDef = z.infer<typeof cameraSchema>;

export const documentSchema = z.object({
  chibi: z.literal(1),
  name: z.string(),
  root: z.array(z.string()),
  nodes: z.record(z.string(), nodeSchema),
  materials: z.record(z.string(), materialSchema),
  assets: z.record(z.string(), assetSchema),
  animations: z.record(z.string(), animationClipSchema),
  states: z.record(z.string(), objectStateSchema),
  interactions: z.array(interactionSchema),
  environment: environmentSchema,
  camera: cameraSchema,
  editor: z.object({ grid: z.boolean() }),
});
export type ChibiDocument = z.infer<typeof documentSchema>;

export function validateDocument(data: unknown): ChibiDocument {
  return documentSchema.parse(migrateDocument(data));
}
