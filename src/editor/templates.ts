import {
  BASE_STATE_ID,
  createMaterial,
  DEFAULT_MATERIAL_ID,
  validateDocument,
  type AnimationClip,
  type ChibiDocument,
  type ChibiMaterial,
  type ChibiNode,
  type GeometryKind,
  type GeometryParams,
  type Interaction,
  type Keyframe,
  type ObjectState,
  type PropertyValue,
  type Track,
  type Transform,
  type Vec3,
} from "@/runtime/schema";

// Landing-page scene templates: hand-authored documents that open straight in
// the editor — no AI call, no API key. All star Clawd, the Claude Code
// mascot, built in the clay house style (rounded primitives, warm pastel
// void, contact shadows). Static ids are fine: they only need to be unique
// within one document, and each build() returns a fresh copy.

export type SceneTemplate = {
  title: string;
  build: () => ChibiDocument;
};

const T = (
  position: Vec3,
  rotation: Vec3 = [0, 0, 0],
  scale: Vec3 = [1, 1, 1],
): Transform => ({ position, rotation, scale });

const box = (width: number, height: number, depth: number, radius = 0.06): GeometryParams =>
  ({ width, height, depth, radius, smoothness: 4 });
const cyl = (radiusTop: number, radiusBottom: number, height: number, fillet = 0.05): GeometryParams =>
  ({ radiusTop, radiusBottom, height, radialSegments: 32, fillet });
const sph = (radius: number): GeometryParams =>
  ({ radius, widthSegments: 32, heightSegments: 16 });
const cap = (radius: number, length: number): GeometryParams =>
  ({ radius, length, capSegments: 8, radialSegments: 24 });
const cone = (radius: number, height: number, fillet = 0.05): GeometryParams =>
  ({ radius, height, radialSegments: 32, fillet });
const torus = (radius: number, tube: number): GeometryParams =>
  ({ radius, tube, radialSegments: 16, tubularSegments: 48 });

function mesh(
  id: string,
  name: string,
  kind: GeometryKind,
  params: GeometryParams,
  materialId: string,
  transform: Transform,
  children: string[] = [],
): ChibiNode {
  return {
    id, name, type: "mesh", visible: true, transform, children,
    geometry: { kind, params }, materialId, castShadow: true, receiveShadow: true,
  };
}

function group(id: string, name: string, transform: Transform, children: string[]): ChibiNode {
  return { id, name, type: "group", visible: true, transform, children };
}

function light(
  id: string,
  name: string,
  kind: "directional" | "point",
  color: string,
  intensity: number,
  position: Vec3,
  castShadow: boolean,
): ChibiNode {
  return {
    id, name, type: "light", visible: true, transform: T(position), children: [],
    light: { kind, color, intensity, castShadow, ...(kind === "point" && { distance: 0 }) },
  };
}

// stepped/sprite-sheet clips: hold frame, snap to next over 1ms (invisible)
// -> no tweens, terminal vibes. loop wraps to frame 0 the same way.
function stepTrack(
  targetId: string,
  property: string,
  frames: Array<[number, PropertyValue]>,
): Track {
  const keyframes: Keyframe[] = [];
  frames.forEach(([t, v], i) => {
    if (i > 0) keyframes.push({ t: t - 0.001, v: frames[i - 1][1] });
    keyframes.push({ t, v });
  });
  return { targetId, property, keyframes };
}

function clip(id: string, name: string, duration: number, tracks: Track[]): AnimationClip {
  return { id, name, duration, loop: true, tracks };
}

type HoverPeek = { state: ObjectState; interactions: Interaction[] };

// hover -> scale pop. scale untouched by clips so it layers over the bob
// (clips win same-key vs state). hover bubbles child->group, so nodeId =
// group. duration 0 = snap.
function hoverPeek(nodeId: string, base: Vec3 = [1, 1, 1], factor = 1.14): HoverPeek {
  const sid = `st_${nodeId}_peek`;
  const snap = (to: string): Interaction["action"] => ({
    type: "transition",
    nodeId,
    to,
    duration: 0,
    ease: "linear",
  });
  return {
    state: {
      id: sid,
      nodeId,
      name: "Peek",
      overrides: {
        [nodeId]: {
          "transform.scale": [base[0] * factor, base[1] * factor, base[2] * factor],
        },
      },
    },
    interactions: [
      { id: `ix_${nodeId}_hi`, trigger: { type: "hoverEnter", nodeId }, action: snap(sid) },
      { id: `ix_${nodeId}_ho`, trigger: { type: "hoverExit", nodeId }, action: snap(BASE_STATE_ID) },
    ],
  };
}

/** assemble runtime bits: clips auto-play on start; each peek adds a hover state + its two triggers */
function interactivity(
  clips: AnimationClip[],
  peeks: HoverPeek[] = [],
): {
  animations: Record<string, AnimationClip>;
  states: Record<string, ObjectState>;
  interactions: Interaction[];
} {
  return {
    animations: Object.fromEntries(clips.map((c) => [c.id, c])),
    states: Object.fromEntries(peeks.map((p) => [p.state.id, p.state])),
    interactions: [
      ...clips.map((c) => ({
        id: `ix_${c.id}`,
        trigger: { type: "start" as const },
        action: { type: "playAnimation" as const, animationId: c.id },
      })),
      ...peeks.flatMap((p) => p.interactions),
    ],
  };
}

function clay(id: string, name: string, color: string, over: Partial<ChibiMaterial> = {}): ChibiMaterial {
  return {
    ...createMaterial(id, name),
    color,
    metalness: 0,
    roughness: 0.7,
    clearcoat: 0.35,
    clearcoatRoughness: 0.6,
    ...over,
  };
}

const clayEnv = (background: string, backgroundGradient: string, bloom = true) => ({
  background,
  backgroundGradient,
  preset: "soft" as const,
  fog: null,
  shadows: true,
  exposure: 1,
  softShadows: true,
  contactShadows: true,
  toneMapping: "neutral" as const,
  ao: true,
  bloom, // scenes with glowing bits (screen, flame, stars) turn this on
  vignette: false,
});

/** materials every template shares: the void clay, Clawd's orange, his eyes */
const clawdMaterials = (): Record<string, ChibiMaterial> => ({
  [DEFAULT_MATERIAL_ID]: clay(DEFAULT_MATERIAL_ID, "Default", "#d9cbb8"),
  mt_clawd: clay("mt_clawd", "Clawd orange", "#d97757"),
  mt_eye: clay("mt_eye", "Eye dark", "#2f2a26", { roughness: 0.6, clearcoat: 0.5 }),
});

// face = eyes only (flat dark blocks on front, no screen/mouth). emotion
// swaps eye geometry: squares=neutral, > <=joy, ^ ^=happy, one lid=wink,
// both lids low=sleepy
export type ClawdEmotion = "neutral" | "joy" | "happy" | "wink" | "sleepy";

const EYE_X = 0.21; // eye centers at (±EYE_X, EYE_Y), proud of the front face
const EYE_Y = 0.8;
const EYE_Z = 0.34;
const EYE_TILT = 0.55; // bar angle that makes the > < and ^ ^ chevrons

function eyeSquare(id: string, name: string, x: number): ChibiNode {
  return mesh(id, name, "box", box(0.12, 0.15, 0.06, 0), "mt_eye", T([x, EYE_Y, EYE_Z]));
}

function eyeBar(id: string, name: string, x: number, y: number, tilt: number): ChibiNode {
  return mesh(id, name, "box", box(0.16, 0.055, 0.06, 0), "mt_eye", T([x, y, EYE_Z], [0, 0, tilt]));
}

function clawdEyes(p: string, emotion: ClawdEmotion): ChibiNode[] {
  const A = EYE_TILT;
  switch (emotion) {
    case "neutral":
      return [eyeSquare(`${p}_eyeL`, "Eye L", -EYE_X), eyeSquare(`${p}_eyeR`, "Eye R", EYE_X)];
    case "joy": // > < — two bars per eye meeting at the inner point
      return [
        eyeBar(`${p}_eyeL1`, "Eye L top", -EYE_X, EYE_Y + 0.042, -A),
        eyeBar(`${p}_eyeL2`, "Eye L bottom", -EYE_X, EYE_Y - 0.042, A),
        eyeBar(`${p}_eyeR1`, "Eye R top", EYE_X, EYE_Y + 0.042, A),
        eyeBar(`${p}_eyeR2`, "Eye R bottom", EYE_X, EYE_Y - 0.042, -A),
      ];
    case "happy": // ^ ^ — two bars per eye meeting at the top
      return [
        eyeBar(`${p}_eyeL1`, "Eye L left", -EYE_X - 0.05, EYE_Y, A),
        eyeBar(`${p}_eyeL2`, "Eye L right", -EYE_X + 0.05, EYE_Y, -A),
        eyeBar(`${p}_eyeR1`, "Eye R left", EYE_X - 0.05, EYE_Y, A),
        eyeBar(`${p}_eyeR2`, "Eye R right", EYE_X + 0.05, EYE_Y, -A),
      ];
    case "wink":
      return [eyeSquare(`${p}_eyeL`, "Eye L", -EYE_X), eyeBar(`${p}_eyeR`, "Eye R (wink)", EYE_X, EYE_Y, 0)];
    case "sleepy": // half-lidded flat bars, dropped a touch
      return [
        eyeBar(`${p}_eyeL`, "Eye L (lid)", -EYE_X, EYE_Y - 0.03, 0),
        eyeBar(`${p}_eyeR`, "Eye R (lid)", EYE_X, EYE_Y - 0.03, 0),
      ];
  }
}

/**
 * Clawd, per the official mascot: wide orange box body, flat dark eyes, nub
 * arms, four stubby legs. every part radius 0 (hard corners) for pixel-art
 * look. ~1.05 units tall, feet at y=0. `wave` raises the right arm.
 */
function clawd(
  prefix: string,
  name: string,
  transform: Transform,
  emotion: ClawdEmotion = "neutral",
  wave = false,
): Record<string, ChibiNode> {
  const p = `nd_${prefix}`;
  const leg = (id: string, legName: string, x: number, z: number) =>
    mesh(`${p}_${id}`, legName, "box", box(0.15, 0.28, 0.15, 0), "mt_clawd", T([x, 0.14, z]));
  const kids = [
    mesh(`${p}_body`, "Body", "box", box(1.04, 0.78, 0.66, 0), "mt_clawd", T([0, 0.65, 0])),
    leg("legFL", "Leg front L", -0.28, 0.17),
    leg("legFR", "Leg front R", 0.28, 0.17),
    leg("legBL", "Leg back L", -0.28, -0.17),
    leg("legBR", "Leg back R", 0.28, -0.17),
    mesh(`${p}_armL`, "Arm L", "box", box(0.36, 0.27, 0.27, 0), "mt_clawd", T([-0.61, 0.68, 0])),
    wave
      ? mesh(`${p}_armR`, "Arm R (waving)", "box", box(0.36, 0.27, 0.27, 0), "mt_clawd", T([0.63, 0.95, 0], [0, 0, -0.9]))
      : mesh(`${p}_armR`, "Arm R", "box", box(0.36, 0.27, 0.27, 0), "mt_clawd", T([0.61, 0.68, 0])),
    ...clawdEyes(p, emotion),
  ];
  const nodes = [group(p, name, transform, kids.map((k) => k.id)), ...kids];
  return Object.fromEntries(nodes.map((n) => [n.id, n]));
}

const nodeMap = (nodes: ChibiNode[]): Record<string, ChibiNode> =>
  Object.fromEntries(nodes.map((n) => [n.id, n]));

/** Clawd at a chunky desk: laptop with a glowing terminal, coffee, a plant, and the Claude spark overhead. */
function buildTerminalScene(): ChibiDocument {
  const screenLines = [
    mesh("nd_line1", "Code line", "box", box(0.5, 0.04, 0.02, 0.01), "mt_glow", T([-0.12, 0.16, 0.035])),
    mesh("nd_line2", "Code line", "box", box(0.34, 0.04, 0.02, 0.01), "mt_cream", T([-0.2, 0.07, 0.035])),
    mesh("nd_line3", "Code line", "box", box(0.42, 0.04, 0.02, 0.01), "mt_cream", T([-0.16, -0.02, 0.035])),
    mesh("nd_cursor", "Cursor", "box", box(0.07, 0.09, 0.02, 0.01), "mt_glow", T([0.18, -0.13, 0.035])),
  ];
  const laptop = [
    mesh("nd_lp_base", "Laptop base", "box", box(0.9, 0.06, 0.62, 0.02), "mt_screen", T([0, 0.03, 0.05])),
    mesh("nd_lp_screen", "Laptop screen", "box", box(0.9, 0.6, 0.05, 0.02), "mt_screen",
      T([0, 0.32, -0.24], [-0.25, 0, 0]), screenLines.map((n) => n.id)),
  ];
  const mug = [
    mesh("nd_mug_body", "Mug", "cylinder", cyl(0.095, 0.095, 0.2, 0.05), "mt_leaf", T([0, 0.1, 0])),
    mesh("nd_mug_handle", "Handle", "torus", torus(0.06, 0.022), "mt_leaf", T([0.13, 0.1, 0])),
  ];
  const plant = [
    mesh("nd_pl_pot", "Pot", "cylinder", cyl(0.11, 0.085, 0.16, 0.04), "mt_terracotta", T([0, 0.08, 0])),
    mesh("nd_pl_leafL", "Leaf", "capsule", cap(0.045, 0.16), "mt_leaf", T([-0.06, 0.28, 0], [0, 0, 0.35])),
    mesh("nd_pl_leafM", "Leaf", "capsule", cap(0.045, 0.2), "mt_leaf", T([0, 0.3, 0])),
    mesh("nd_pl_leafR", "Leaf", "capsule", cap(0.045, 0.16), "mt_leaf", T([0.06, 0.28, 0], [0, 0, -0.35])),
  ];
  const deskKids = [
    mesh("nd_desk_top", "Desk top", "box", box(2.0, 0.14, 1.1, 0.06), "mt_wood", T([0, 0.82, 0])),
    mesh("nd_leg1", "Leg", "cylinder", cyl(0.07, 0.07, 0.75, 0.04), "mt_wood", T([-0.85, 0.375, -0.42])),
    mesh("nd_leg2", "Leg", "cylinder", cyl(0.07, 0.07, 0.75, 0.04), "mt_wood", T([0.85, 0.375, -0.42])),
    mesh("nd_leg3", "Leg", "cylinder", cyl(0.07, 0.07, 0.75, 0.04), "mt_wood", T([-0.85, 0.375, 0.42])),
    mesh("nd_leg4", "Leg", "cylinder", cyl(0.07, 0.07, 0.75, 0.04), "mt_wood", T([0.85, 0.375, 0.42])),
    group("nd_laptop", "Laptop", T([-0.03, 0.89, -0.08]), laptop.map((n) => n.id)),
    group("nd_mug", "Coffee mug", T([0.68, 0.89, 0.27]), mug.map((n) => n.id)),
    group("nd_plant", "Plant", T([-0.75, 0.89, -0.33]), plant.map((n) => n.id)),
  ];
  // the Claude spark: four crossed capsules make an eight-ray star
  const sparkRays = [0, 0.7854, 1.5708, 2.3562].map((rz, i) =>
    mesh(`nd_ray${i}`, "Ray", "capsule", cap(0.035, 0.16), "mt_glow", T([0, 0, 0], [0, 0, rz])),
  );
  // thin rug so its top face lands at y=0, flush with the desk/Clawd feet already tuned to that height
  const floor = mesh("nd_floor", "Floor", "box", box(4.6, 0.12, 3.2, 0.5), "mt_floor", T([0, -0.06, 0.1]));
  const roots = [
    floor,
    group("nd_desk", "Desk", T([0.65, 0, 0]), deskKids.map((n) => n.id)),
    group("nd_spark", "Claude spark", T([0.62, 2.1, -0.08]), sparkRays.map((n) => n.id)),
    light("nd_key", "Key light", "directional", "#fff3e4", 2, [4, 7, 4], true),
    light("nd_fill", "Fill light", "point", "#ffd9c0", 4, [-4, 3, -2], false),
  ];
  // neutral eyes = canonical mascot face
  const clawdNodes = clawd("clawd", "Clawd", T([-1.15, 0, 0.35], [0, 0.5, 0]), "neutral");

  const clips = [
    clip("an_cursor", "Cursor blink", 1.1, [
      stepTrack("nd_cursor", "visible", [[0, true], [0.55, false]]),
    ]),
    clip("an_bob", "Clawd bob", 0.9, [
      stepTrack("nd_clawd", "transform.position", [
        [0, [-1.15, 0, 0.35]],
        [0.45, [-1.15, 0.05, 0.35]],
      ]),
    ]),
    clip("an_blink", "Clawd blink", 3.6, [
      stepTrack("nd_clawd_eyeL", "visible", [[0, true], [3.3, false], [3.45, true]]),
      stepTrack("nd_clawd_eyeR", "visible", [[0, true], [3.3, false], [3.45, true]]),
    ]),
    // the 8-ray star is symmetric every 45°, so tick by 22.5° to read as motion
    clip("an_spark", "Spark spin", 1.6, [
      stepTrack(
        "nd_spark",
        "transform.rotation",
        [0, 1, 2, 3, 4, 5, 6, 7].map((i): [number, PropertyValue] => [i * 0.2, [0, 0, -i * 0.3927]]),
      ),
    ]),
  ];

  return validateDocument({
    chibi: 1,
    name: "Clawd at the terminal",
    root: ["nd_clawd", ...roots.map((n) => n.id)],
    nodes: {
      ...clawdNodes,
      ...nodeMap([...roots, ...deskKids, ...laptop, ...screenLines, ...mug, ...plant, ...sparkRays]),
    },
    materials: {
      ...clawdMaterials(),
      mt_screen: clay("mt_screen", "Terminal dark", "#38332e", { roughness: 0.6 }),
      mt_glow: clay("mt_glow", "Orange glow", "#ffb27a", { emissive: "#ff8a4d", emissiveIntensity: 1.8, roughness: 0.5 }),
      mt_cream: clay("mt_cream", "Cream", "#f2e7d9"),
      mt_wood: clay("mt_wood", "Warm wood", "#d99a62"),
      mt_terracotta: clay("mt_terracotta", "Terracotta", "#cd7a52"),
      mt_leaf: clay("mt_leaf", "Leaf green", "#6fbf5a"),
      mt_floor: clay("mt_floor", "Floor rug", "#c9ad86", { roughness: 0.85, clearcoat: 0.15 }),
    },
    assets: {},
    ...interactivity(clips, [hoverPeek("nd_clawd")]),
    environment: clayEnv("#ead9c4", "#dcc3a3"),
    camera: { position: [3.2, 2.3, 4.4], target: [0, 0.9, 0], fov: 40 },
    editor: { grid: true },
  });
}

/** Clawd waving a rocket off from a sand plinth at dusk: flame, smoke puffs, floating stars. */
function buildRocketScene(): ChibiDocument {
  const rocket = [
    mesh("nd_rk_body", "Rocket body", "cylinder", cyl(0.42, 0.42, 1.5, 0.12), "mt_cream", T([0, 1.95, 0])),
    mesh("nd_rk_nose", "Nose cone", "cone", cone(0.43, 0.6, 0.08), "mt_clawd", T([0, 3.0, 0])),
    mesh("nd_rk_ring", "Window ring", "torus", torus(0.15, 0.05), "mt_clawd", T([0, 2.15, 0.4])),
    mesh("nd_rk_glass", "Window", "sphere", sph(0.13), "mt_screen", T([0, 2.15, 0.38])),
    mesh("nd_rk_finL", "Fin L", "box", box(0.1, 0.55, 0.4, 0.05), "mt_clawd", T([-0.5, 1.35, 0])),
    mesh("nd_rk_finR", "Fin R", "box", box(0.1, 0.55, 0.4, 0.05), "mt_clawd", T([0.5, 1.35, 0])),
    mesh("nd_rk_finB", "Fin back", "box", box(0.4, 0.55, 0.1, 0.05), "mt_clawd", T([0, 1.35, -0.5])),
    mesh("nd_rk_flame", "Flame", "cone", cone(0.3, 0.7, 0), "mt_flame", T([0, 0.9, 0], [3.1416, 0, 0])),
    mesh("nd_rk_core", "Flame core", "cone", cone(0.16, 0.45, 0), "mt_flame_core", T([0, 0.78, 0], [3.1416, 0, 0])),
  ];
  const smoke = [
    mesh("nd_sm1", "Smoke", "sphere", sph(0.3), "mt_cream", T([0.65, 0.62, -0.4], [0, 0, 0], [1, 0.6, 1])),
    mesh("nd_sm2", "Smoke", "sphere", sph(0.24), "mt_cream", T([0.0, 0.6, 0.15], [0, 0, 0], [1, 0.65, 1])),
    mesh("nd_sm3", "Smoke", "sphere", sph(0.2), "mt_cream", T([1.3, 0.58, 0.1], [0, 0, 0], [1, 0.7, 1])),
  ];
  const stars = [
    mesh("nd_st1", "Star", "sphere", sph(0.05), "mt_glow", T([-1.9, 2.6, -1.2])),
    mesh("nd_st2", "Star", "sphere", sph(0.05), "mt_glow", T([1.9, 3.3, -1.5])),
    mesh("nd_st3", "Star", "sphere", sph(0.05), "mt_glow", T([-0.9, 3.6, -0.4])),
  ];
  const roots = [
    mesh("nd_plinth", "Sand plinth", "cylinder", cyl(2.0, 2.2, 0.5, 0.15), "mt_sand", T([0, 0.25, 0])),
    group("nd_rocket", "Rocket", T([0.6, 0, -0.3]), rocket.map((n) => n.id)),
    group("nd_smoke", "Smoke", T([0, 0, 0]), smoke.map((n) => n.id)),
    group("nd_stars", "Stars", T([0, 0, 0]), stars.map((n) => n.id)),
    light("nd_key", "Key light", "directional", "#ffe0bd", 2, [4, 5, 3], true),
    light("nd_fill", "Fill light", "point", "#ffb9a0", 4, [-4, 3, -2], false),
  ];
  // joy eyes + a wave: the sticker-sheet "> <" scrunch fits a launch
  const clawdNodes = clawd("clawd", "Clawd", T([-1.05, 0.5, 0.55], [0, -0.45, 0]), "joy", true);

  const clips = [
    // rocket idles low, then keeps blasting up and snapping back to relaunch
    clip("an_launch", "Rocket launch", 2.4, [
      stepTrack("nd_rocket", "transform.position", [
        [0, [0.6, 0, -0.3]],
        [0.5, [0.6, 0.15, -0.3]],
        [0.9, [0.6, 0.6, -0.3]],
        [1.3, [0.6, 1.6, -0.3]],
        [1.7, [0.6, 3.2, -0.3]],
      ]),
    ]),
    // flame flickers by toggling the two cones on alternating frames
    clip("an_flame", "Flame flicker", 0.36, [
      stepTrack("nd_rk_flame", "transform.scale", [[0, [1, 1, 1]], [0.18, [0.9, 1.25, 0.9]]]),
      stepTrack("nd_rk_core", "transform.scale", [[0, [1, 1.2, 1]], [0.18, [1.1, 0.85, 1.1]]]),
    ]),
    // Clawd's raised right arm waves side to side
    clip("an_wave", "Clawd wave", 0.7, [
      stepTrack("nd_clawd_armR", "transform.rotation", [
        [0, [0, 0, -0.9]],
        [0.35, [0, 0, -1.35]],
      ]),
    ]),
    clip("an_twinkle", "Star twinkle", 1.2, [
      stepTrack("nd_st1", "visible", [[0, true], [0.4, false], [0.6, true]]),
      stepTrack("nd_st2", "visible", [[0, false], [0.3, true], [0.9, false]]),
      stepTrack("nd_st3", "visible", [[0, true], [0.7, false], [1.0, true]]),
    ]),
  ];

  return validateDocument({
    chibi: 1,
    name: "Clawd's rocket launch",
    root: ["nd_clawd", ...roots.map((n) => n.id)],
    nodes: {
      ...clawdNodes,
      ...nodeMap([...roots, ...rocket, ...smoke, ...stars]),
    },
    materials: {
      ...clawdMaterials(),
      mt_screen: clay("mt_screen", "Window dark", "#38332e", { roughness: 0.6 }),
      mt_glow: clay("mt_glow", "Orange glow", "#ffb27a", { emissive: "#ff8a4d", emissiveIntensity: 1.8, roughness: 0.5 }),
      mt_cream: clay("mt_cream", "Cream", "#f2e7d9"),
      mt_sand: clay("mt_sand", "Sand", "#eccf96"),
      mt_flame: clay("mt_flame", "Flame", "#ffb347", { emissive: "#ff8a4d", emissiveIntensity: 2.5, roughness: 0.5 }),
      mt_flame_core: clay("mt_flame_core", "Flame core", "#ffd9a0", { emissive: "#ffc27a", emissiveIntensity: 3, roughness: 0.5 }),
    },
    assets: {},
    ...interactivity(clips, [hoverPeek("nd_clawd")]),
    environment: clayEnv("#e9c0ac", "#d29c88"),
    camera: { position: [4.4, 3.0, 5.0], target: [0, 1.5, 0], fov: 40 },
    editor: { grid: true },
  });
}

/** The whole emotion range at once: five Clawds on a stage, one per mood, including a baby (like the desk-buddy print). */
function buildMoodsScene(): ChibiDocument {
  const crew: Array<{
    prefix: string;
    name: string;
    t: Transform;
    emotion: ClawdEmotion;
    wave?: boolean;
  }> = [
    { prefix: "happy", name: "Clawd — happy", t: T([-1.3, 0.5, -0.5], [0, 0.4, 0]), emotion: "happy" },
    { prefix: "plain", name: "Clawd — neutral", t: T([-0.05, 0.5, 0.15], [0, 0.05, 0]), emotion: "neutral" },
    { prefix: "joy", name: "Clawd — joy", t: T([1.25, 0.5, -0.45], [0, -0.35, 0]), emotion: "joy", wave: true },
    { prefix: "wink", name: "Clawd — wink", t: T([-1.15, 0.5, 0.9], [0, 0.25, 0], [0.75, 0.75, 0.75]), emotion: "wink" },
    { prefix: "baby", name: "Clawd — sleepy (baby)", t: T([1.0, 0.5, 0.9], [0, -0.2, 0], [0.5, 0.5, 0.5]), emotion: "sleepy" },
  ];
  const clawds = crew.map((c) => clawd(c.prefix, c.name, c.t, c.emotion, c.wave));
  const roots = [
    mesh("nd_stage", "Stage", "cylinder", cyl(2.3, 2.5, 0.5, 0.15), "mt_stage", T([0, 0.25, 0])),
    light("nd_key", "Key light", "directional", "#fff3e4", 2, [4, 7, 4], true),
    light("nd_fill", "Fill light", "point", "#ffd9c0", 4, [-4, 3, -2], false),
  ];
  // per-clawd bob at staggered offset -> row not in lockstep; joy also waves
  const clips = crew.map((c, i) => {
    const [x, y, z] = c.t.position;
    const up = 0.06 * (c.t.scale?.[1] ?? 1);
    const phase = 0.15 * i; // stagger the low point down the line
    return clip(`an_bob_${c.prefix}`, `Bob — ${c.prefix}`, 1.0, [
      stepTrack(`nd_${c.prefix}`, "transform.position", [
        [0, [x, y, z]],
        [Math.max(0.001, phase), [x, y, z]],
        [phase + 0.25, [x, y + up, z]],
        [phase + 0.5, [x, y, z]],
      ]),
    ]);
  });
  clips.push(
    clip("an_wave_joy", "Joy wave", 0.7, [
      stepTrack("nd_joy_armR", "transform.rotation", [
        [0, [0, 0, -0.9]],
        [0.35, [0, 0, -1.35]],
      ]),
    ]),
  );

  return validateDocument({
    chibi: 1,
    name: "Clawd's moods",
    root: [...crew.map((c) => `nd_${c.prefix}`), ...roots.map((n) => n.id)],
    nodes: {
      ...Object.assign({}, ...clawds),
      ...nodeMap(roots),
    },
    materials: {
      ...clawdMaterials(),
      mt_stage: clay("mt_stage", "Stage sand", "#ebd5b4"),
    },
    assets: {},
    // each mood pops on its own hover, off its own resting scale
    ...interactivity(
      clips,
      crew.map((c) => hoverPeek(`nd_${c.prefix}`, c.t.scale ?? [1, 1, 1])),
    ),
    environment: clayEnv("#f0dcc4", "#e0c2a0", false), // nothing emissive here
    camera: { position: [2.4, 2.6, 5.6], target: [0, 0.7, 0], fov: 38 },
    editor: { grid: true },
  });
}

export const SCENE_TEMPLATES: SceneTemplate[] = [
  { title: "Clawd at the terminal", build: buildTerminalScene },
  { title: "Clawd's rocket launch", build: buildRocketScene },
  { title: "Clawd's moods", build: buildMoodsScene },
];
