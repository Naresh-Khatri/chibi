import {
  createMaterial,
  DEFAULT_MATERIAL_ID,
  validateDocument,
  type ChibiDocument,
  type ChibiNode,
  type GeometryKind,
  type GeometryParams,
  type PropertyValue,
  type Transform,
  type Vec3,
} from "@/runtime/schema";

export const GARDEN_FLOWERS = ["nd_garden_pink", "nd_garden_lilac", "nd_garden_gold"] as const;
export const GARDEN_RABBIT = "nd_garden_rabbit";
export const GARDEN_BUTTERFLY = "nd_garden_butterfly";
export const GARDEN_FLIGHT = "an_garden_flight";
export const GARDEN_DISCOVERIES = [...GARDEN_FLOWERS, GARDEN_RABBIT, GARDEN_BUTTERFLY];

const transform = (
  position: Vec3 = [0, 0, 0],
  scale: Vec3 = [1, 1, 1],
  rotation: Vec3 = [0, 0, 0],
): Transform => ({ position, rotation, scale });

// Fixed IDs make the bundled template deterministic; each build returns a fresh document.
export function buildGardenScene(): ChibiDocument {
  const nodes: Record<string, ChibiNode> = {};
  const root: string[] = [];
  const mesh = (
    key: string, name: string, kind: GeometryKind, params: GeometryParams,
    materialId: string, pose: Transform,
  ) => {
    const id = `nd_garden_${key}`;
    nodes[id] = { id, name, type: "mesh", geometry: { kind, params }, materialId,
      transform: pose, visible: true, children: [], castShadow: true, receiveShadow: true };
    return id;
  };
  const sphere = (key: string, name: string, material: string, pose: Transform, faceted = false) =>
    mesh(key, name, "sphere", { radius: 1, widthSegments: faceted ? 10 : 20, heightSegments: faceted ? 7 : 12 }, material, pose);
  const capsule = (key: string, name: string, material: string, radius: number, length: number, pose: Transform) =>
    mesh(key, name, "capsule", { radius, length, radialSegments: 12, capSegments: 5 }, material, pose);
  const group = (key: string, name: string, children: string[], pose = transform()) => {
    const id = `nd_garden_${key}`;
    nodes[id] = { id, name, type: "group", children, transform: pose, visible: true };
    return id;
  };

  root.push(
    mesh("island", "Terracotta island", "cylinder", { radiusTop: 2, radiusBottom: 1.8, height: 0.5, radialSegments: 48, fillet: 0.15 }, "mt_garden_earth", transform([0, -0.3, 0], [1.08, 1, 0.88])),
    mesh("grass", "Soft moss", "cylinder", { radiusTop: 1.95, radiusBottom: 2, height: 0.18, radialSegments: 48, fillet: 0.075 }, "mt_garden_moss", transform([0, 0, 0], [1.08, 1, 0.88])),
  );

  const pond = [
    sphere("water", "Still water", "mt_garden_water", transform([0, 0.1, 0], [0.73, 0.035, 0.51])),
    mesh("pond_rim", "Pond rim", "torus", { radius: 0.62, tube: 0.065, radialSegments: 8, tubularSegments: 36 }, "mt_garden_rim", transform([0, 0.09, 0], [1.17, 0.84, 1], [-Math.PI / 2, 0, 0])),
    sphere("lily_a", "Lily pad", "mt_garden_leaf", transform([-0.2, 0.145, 0.1], [0.16, 0.017, 0.13])),
    sphere("lily_b", "Lily pad", "mt_garden_leaf", transform([0.16, 0.145, -0.1], [0.12, 0.017, 0.1])),
  ];
  root.push(group("pond", "Little pond", pond, transform([-0.85, 0, 0.65], [1, 1, 1], [0, -0.3, 0])));

  const path: string[] = [];
  for (let i = 0; i < 5; i++) {
    path.push(mesh(`path_${i}`, "Stepping stone", "box", { width: 0.3, height: 0.09, depth: 0.25, radius: 0.045, smoothness: 3 }, "mt_garden_cream",
      transform([-0.05 + Math.sin(i * 0.6) * 0.3, 0.1, 1.43 - i * 0.33], [1, 1, 1], [0, i * 0.23, 0])));
  }
  root.push(group("path", "Winding path", path));

  const tree = [
    capsule("trunk", "Tree trunk", "mt_garden_wood", 0.14, 1.05, transform([0, 0.66, 0], [1, 1, 1], [0, 0, -0.1])),
    capsule("branch", "Small branch", "mt_garden_wood", 0.07, 0.48, transform([0.18, 1.05, 0], [1, 1, 1], [0, 0, -0.7])),
    sphere("crown_a", "Tree crown", "mt_garden_tree", transform([-0.25, 1.64, 0], [0.62, 0.67, 0.56]), true),
    sphere("crown_b", "Tree crown", "mt_garden_tree", transform([0.28, 1.52, 0.05], [0.57, 0.53, 0.48]), true),
    sphere("crown_c", "Tree crown", "mt_garden_tree_light", transform([0.05, 1.98, -0.02], [0.52, 0.55, 0.48]), true),
  ];
  root.push(group("tree", "Pocket tree", tree, transform([-0.93, 0.04, -0.65])));

  const flowers: Array<[string, string, string, Vec3, number]> = [
    ["pink", "Peach flower", "mt_garden_pink", [-1.55, 0.08, -0.03], -0.14],
    ["lilac", "Lilac flower", "mt_garden_lilac", [0.94, 0.08, -0.7], 0.18],
    ["gold", "Golden flower", "mt_garden_gold", [1.25, 0.08, 0.72], -0.2],
  ];
  for (const [key, name, material, position, lean] of flowers) {
    const petals: string[] = [];
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 + Math.PI / 2;
      petals.push(sphere(`${key}_petal_${i}`, "Petal", material,
        transform([Math.cos(a) * 0.23, Math.sin(a) * 0.23, 0], [0.17, 0.24, 0.1], [0, 0, a - Math.PI / 2])));
    }
    petals.push(sphere(`${key}_center`, "Flower center", "mt_garden_gold", transform([0, 0, 0.09], [0.13, 0.13, 0.08])));
    const parts = [
      capsule(`${key}_stem`, "Stem", "mt_garden_leaf", 0.035, 0.73, transform([0, 0.4, 0])),
      sphere(`${key}_leaf_a`, "Leaf", "mt_garden_leaf", transform([-0.14, 0.35, 0], [0.2, 0.07, 0.08], [0, 0, -0.4])),
      sphere(`${key}_leaf_b`, "Leaf", "mt_garden_leaf", transform([0.13, 0.5, 0], [0.19, 0.07, 0.08], [0, 0, 0.4])),
      group(`${key}_head`, "Flower head", petals, transform([0, 0.9, 0], [1, 1, 1], [-0.28, 0.22, lean])),
    ];
    root.push(group(key, name, parts, transform(position, [0.72, 0.72, 0.72])));
  }

  const rabbitHead = [
    sphere("rabbit_face", "Rabbit face", "mt_garden_cream", transform([0, 0.76, 0.06], [0.31, 0.3, 0.27])),
    capsule("ear_left", "Left ear", "mt_garden_cream", 0.075, 0.35, transform([-0.13, 1.1, 0], [1, 1, 1], [0, 0, 0.2])),
    capsule("ear_right", "Right ear", "mt_garden_cream", 0.075, 0.35, transform([0.13, 1.1, 0], [1, 1, 1], [0, 0, -0.2])),
    capsule("ear_left_inner", "Pink ear", "mt_garden_pink", 0.035, 0.27, transform([-0.13, 1.1, 0.055], [1, 1, 1], [0, 0, 0.2])),
    capsule("ear_right_inner", "Pink ear", "mt_garden_pink", 0.035, 0.27, transform([0.13, 1.1, 0.055], [1, 1, 1], [0, 0, -0.2])),
    sphere("eye_left", "Left sleepy eye", "mt_garden_ink", transform([-0.105, 0.79, 0.304], [0.035, 0.01, 0.018])),
    sphere("eye_right", "Right sleepy eye", "mt_garden_ink", transform([0.105, 0.79, 0.304], [0.035, 0.01, 0.018])),
    sphere("nose", "Tiny nose", "mt_garden_pink", transform([0, 0.7, 0.32], [0.035, 0.025, 0.017])),
    sphere("cheek_left", "Rosy cheek", "mt_garden_pink", transform([-0.17, 0.71, 0.285], [0.05, 0.025, 0.012])),
    sphere("cheek_right", "Rosy cheek", "mt_garden_pink", transform([0.17, 0.71, 0.285], [0.05, 0.025, 0.012])),
  ];
  const rabbit = [
    sphere("rabbit_body", "Rabbit body", "mt_garden_cream", transform([0, 0.37, -0.025], [0.29, 0.36, 0.26])),
    sphere("foot_left", "Left paw", "mt_garden_cream", transform([-0.17, 0.14, 0.15], [0.13, 0.1, 0.17])),
    sphere("foot_right", "Right paw", "mt_garden_cream", transform([0.17, 0.14, 0.15], [0.13, 0.1, 0.17])),
    sphere("tail", "Cotton tail", "mt_garden_cream", transform([0.21, 0.31, -0.2], [0.13, 0.13, 0.13])),
    group("rabbit_head", "Rabbit head", rabbitHead, transform([0, -0.04, 0], [1, 1, 1], [0.08, 0, 0])),
  ];
  root.push(group("rabbit", "Sleepy rabbit", rabbit, transform([0.32, 0.06, 0.12], [0.85, 0.85, 0.85], [0, 0.2, 0])));

  const butterfly = [
    capsule("butterfly_body", "Butterfly body", "mt_garden_ink", 0.025, 0.16, transform()),
    sphere("wing_left", "Left wing", "mt_garden_lilac", transform([-0.1, 0.045, 0], [0.14, 0.13, 0.035], [0, 0.3, -0.3])),
    sphere("wing_right", "Right wing", "mt_garden_lilac", transform([0.1, 0.045, 0], [0.14, 0.13, 0.035], [0, -0.3, 0.3])),
    sphere("wing_left_low", "Lower wing", "mt_garden_pink", transform([-0.075, -0.08, 0], [0.085, 0.08, 0.03])),
    sphere("wing_right_low", "Lower wing", "mt_garden_pink", transform([0.075, -0.08, 0], [0.085, 0.08, 0.03])),
  ];
  root.push(group("butterfly", "Resting butterfly", butterfly, transform([0.48, 1.54, -0.17], [1, 1, 1], [0, 0.25, -0.2])));

  const stones: Array<[Vec3, Vec3]> = [
    [[-1.35, 0.17, -0.93], [0.27, 0.18, 0.23]],
    [[1.55, 0.16, -0.2], [0.28, 0.14, 0.2]],
    [[-1.28, 0.14, 1.05], [0.15, 0.08, 0.11]],
    [[0.54, 0.14, -1.31], [0.24, 0.1, 0.16]],
  ];
  stones.forEach(([position, scale], i) => root.push(sphere(`stone_${i}`, "Garden pebble", "mt_garden_stone", transform(position, scale, [0.1, i * 0.7, 0.1]), true)));
  const tufts: Vec3[] = [[-1.55, 0.1, 0.55], [0.82, 0.1, 1.18], [1.42, 0.1, -0.88], [-0.23, 0.1, -1.35]];
  tufts.forEach((position, i) => {
    const blades = [-1, 0, 1].map((side) => capsule(`tuft_${i}_${side + 1}`, "Grass blade", "mt_garden_leaf", 0.025, 0.15,
      transform([side * 0.045, 0.1, 0], [1, 1, 1], [0.12, 0, -side * 0.32])));
    root.push(group(`tuft_${i}`, "Little grass tuft", blades, transform(position)));
  });

  const lightId = "nd_garden_sunlight";
  nodes[lightId] = { id: lightId, name: "Afternoon light", type: "light", visible: true,
    transform: transform([-3, 6, 4]), children: [],
    light: { kind: "directional", color: "#fff2dc", intensity: 2.2, castShadow: true } };
  root.push(lightId);

  const doc = validateDocument({
    chibi: 1, name: "A little garden", root, nodes,
    materials: Object.fromEntries([
      [DEFAULT_MATERIAL_ID, "Default", "#eee3ce"],
      ["mt_garden_earth", "Terracotta", "#c69e84"],
      ["mt_garden_moss", "Moss cushion", "#89aa87"],
      ["mt_garden_rim", "Pond edge", "#6d947b"],
      ["mt_garden_leaf", "Leaf green", "#548265"],
      ["mt_garden_tree", "Sage canopy", "#9bb98b"],
      ["mt_garden_tree_light", "Light canopy", "#b3c897"],
      ["mt_garden_water", "Pond blue", "#87bec6"],
      ["mt_garden_wood", "Warm wood", "#b88f70"],
      ["mt_garden_pink", "Peach petals", "#eead9d"],
      ["mt_garden_lilac", "Lilac petals", "#b6a4d7"],
      ["mt_garden_gold", "Butter yellow", "#f2ce83"],
      ["mt_garden_cream", "Warm porcelain", "#f1e6d2"],
      ["mt_garden_ink", "Ink", "#3d3b44"],
      ["mt_garden_stone", "Soft stone", "#b5b2a7"],
    ].map(([id, name, color]) => [id, { ...createMaterial(id, name), color,
      metalness: 0, roughness: id === "mt_garden_water" ? 0.2 : 0.68,
      clearcoat: 0.15, clearcoatRoughness: 0.6, flatShading: id === "mt_garden_stone" }])),
    assets: {}, animations: {}, states: {}, interactions: [],
    environment: { background: "#0b0b0f", preset: "soft", shadows: true, softShadows: true,
      contactShadows: false, toneMapping: "neutral", ao: true, bloom: false, vignette: false, fog: null },
    camera: { position: [3.3, 2.8, 5.6], target: [0, 0.65, 0], fov: 37, parallax: 0.055 },
    editor: { grid: false },
  });

  const toggle = (key: string, triggerId: string, nodeId: string, overrides: Record<string, PropertyValue>, name: string) => {
    const id = `st_garden_${key}`;
    doc.states[id] = { id, name, nodeId, overrides: { [nodeId]: overrides } };
    doc.interactions.push({ id: `ix_garden_${key}`, trigger: { type: "click", nodeId: triggerId },
      action: { type: "toggleStates", nodeId, a: "base", b: id, duration: 0.65, ease: "easeInOut" } });
  };
  GARDEN_FLOWERS.forEach((id, i) => toggle(`bloom_${i}`, id, id, { "transform.scale": [1.08, 1.08, 1.08] }, "Bloom"));
  toggle("wake", GARDEN_RABBIT, GARDEN_RABBIT, { "transform.scale": [0.95, 0.98, 0.95], "transform.rotation": [0, 0.35, 0] }, "Awake");
  toggle("head", GARDEN_RABBIT, "nd_garden_rabbit_head", { "transform.position": [0, 0, 0], "transform.rotation": [-0.07, 0, -0.08] }, "Look up");
  for (const side of ["left", "right"]) toggle(`eye_${side}`, GARDEN_RABBIT, `nd_garden_eye_${side}`, { "transform.scale": [0.024, 0.033, 0.018] }, "Open eye");

  const rest: Vec3 = [0.48, 1.54, -0.17];
  doc.animations[GARDEN_FLIGHT] = {
    id: GARDEN_FLIGHT, name: "Butterfly flight", duration: 3.2, loop: false,
    tracks: [{ targetId: GARDEN_BUTTERFLY, property: "transform.position", keyframes: [
      { t: 0, v: rest, ease: "easeInOut" }, { t: 0.8, v: [1.15, 2.05, 0.2], ease: "easeInOut" },
      { t: 1.6, v: [0.15, 2.35, 0.7], ease: "easeInOut" }, { t: 2.4, v: [-0.5, 1.9, 0.05], ease: "easeInOut" }, { t: 3.2, v: rest },
    ] }, ...["left", "right"].map((side, index) => ({
      targetId: `nd_garden_wing_${side}`, property: "transform.rotation",
      keyframes: Array.from({ length: 17 }, (_, i) => ({ t: i * 0.2, v: [0, (index ? -1 : 1) * (i % 2 ? 1.1 : 0.3), index ? 0.3 : -0.3] as Vec3, ease: "easeInOut" as const })),
    }))],
  };
  doc.interactions.push({ id: "ix_garden_flight", trigger: { type: "click", nodeId: GARDEN_BUTTERFLY }, action: { type: "playAnimation", animationId: GARDEN_FLIGHT } });
  return validateDocument(doc);
}
