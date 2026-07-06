// Generates public/scenes/keyboard.chibi.json: a cute lowpoly keyboard where
// every key presses in on hover. Run with `node scripts/generate-keyboard-scene.mjs`.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { validateDocument } from "@chibi3d/runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));

let seq = 0;
const id = (prefix) => `${prefix}_${(++seq).toString(36)}`;

const nodes = {};
const materials = {};
const states = {};
const interactions = [];
const animations = {};
const root = [];

function material(name, props) {
  const matId = id("mt");
  materials[matId] = {
    id: matId,
    name,
    type: "standard",
    color: "#b8b8c4",
    metalness: 0.1,
    roughness: 0.5,
    emissive: "#000000",
    emissiveIntensity: 0,
    opacity: 1,
    transparent: false,
    flatShading: false,
    maps: { map: null, normalMap: null, roughnessMap: null },
    ...props,
  };
  return matId;
}

function mesh(name, { geometry, materialId, position, rotation = [0, 0, 0], scale = [1, 1, 1], castShadow = true, receiveShadow = true }) {
  const nodeId = id("nd");
  nodes[nodeId] = {
    id: nodeId,
    name,
    type: "mesh",
    geometry,
    materialId,
    transform: { position, rotation, scale },
    visible: true,
    castShadow,
    receiveShadow,
    children: [],
  };
  root.push(nodeId);
  return nodeId;
}

function light(name, { light, position }) {
  const nodeId = id("nd");
  nodes[nodeId] = {
    id: nodeId,
    name,
    type: "light",
    light,
    transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
    visible: true,
    children: [],
  };
  root.push(nodeId);
  return nodeId;
}

// --- layout -----------------------------------------------------------

const KEY_W = 0.8;
const KEY_D = 0.8;
const KEY_H = 0.4;
const GAP = 0.15;
const PITCH = KEY_W + GAP;
const COLS = 10;
const ROWS = 4;
const PRESS_DEPTH = 0.13;

/** x-centers for a row of `widths` (with GAP between), span centered at 0 */
function rowCenters(widths) {
  const span = widths.reduce((a, b) => a + b, 0) + GAP * (widths.length - 1);
  let x = -span / 2;
  const centers = [];
  for (const w of widths) {
    centers.push(x + w / 2);
    x += w + GAP;
  }
  return centers;
}

const rowZ = [0, 1, 2, 3].map((i) => (i - (ROWS - 1) / 2) * PITCH);
const rowPastel = ["#ff8fab", "#ffbf69", "#7fdb9a", "#6fd0e0"];

const keyboardWidth = COLS * PITCH - GAP;
const keyboardDepth = ROWS * PITCH - GAP;
const MARGIN = 0.6;
const BASE_W = keyboardWidth + MARGIN * 2;
const BASE_D = keyboardDepth + MARGIN * 2;
const BASE_H = 0.7;
const BASE_TOP_Y = BASE_H;
const KEY_BASE_Y = BASE_TOP_Y + KEY_H / 2;

const rowMaterials = rowPastel.map((color, i) =>
  material(`Key row ${i + 1}`, { color, roughness: 0.55, metalness: 0.05 }),
);

function addKey(name, matId, x, z, width = KEY_W) {
  const nodeId = mesh(name, {
    geometry: { kind: "box", params: { width, height: KEY_H, depth: KEY_D } },
    materialId: matId,
    position: [x, KEY_BASE_Y, z],
  });
  const pressedId = id("st");
  states[pressedId] = {
    id: pressedId,
    nodeId,
    name: "Pressed",
    overrides: {
      [nodeId]: {
        "transform.position": [x, KEY_BASE_Y - PRESS_DEPTH, z],
        "transform.scale": [1, 0.7, 1],
      },
    },
  };
  interactions.push(
    {
      id: id("ix"),
      trigger: { type: "hoverEnter", nodeId },
      action: { type: "transition", nodeId, to: pressedId, duration: 0.12, ease: "easeOut" },
    },
    {
      id: id("ix"),
      trigger: { type: "hoverExit", nodeId },
      action: { type: "transition", nodeId, to: "base", duration: 0.18, ease: "easeOut" },
    },
  );
  return nodeId;
}

// rows 0-2: 10 regular keys
for (let r = 0; r < 3; r++) {
  const centers = rowCenters(Array(COLS).fill(KEY_W));
  centers.forEach((x, c) => addKey(`Key r${r}c${c}`, rowMaterials[r], x, rowZ[r]));
}

// row 3: ctrl, alt, spacebar, alt, ctrl
{
  const sideW = KEY_W;
  const spaceW = keyboardWidth - sideW * 4 - GAP * 4;
  const widths = [sideW, sideW, spaceW, sideW, sideW];
  const centers = rowCenters(widths);
  const names = ["Ctrl L", "Alt L", "Space", "Alt R", "Ctrl R"];
  centers.forEach((x, c) => addKey(names[c], rowMaterials[3], x, rowZ[3], widths[c]));
}

// --- case, feet, face, ground ------------------------------------------

const caseMat = material("Case", { color: "#f2e2cd", roughness: 0.5, metalness: 0.05 });
mesh("Case", {
  geometry: { kind: "box", params: { width: BASE_W, height: BASE_H, depth: BASE_D } },
  materialId: caseMat,
  position: [0, BASE_H / 2, 0],
});

const footMat = material("Foot", { color: "#ffffff", roughness: 0.3, metalness: 0.05 });
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    mesh("Foot", {
      geometry: { kind: "cylinder", params: { radiusTop: 0.28, radiusBottom: 0.28, height: 0.3, radialSegments: 16 } },
      materialId: footMat,
      position: [sx * (BASE_W / 2 - 0.4), 0.15, sz * (BASE_D / 2 - 0.4)],
    });
  }
}

const faceZ = BASE_D / 2;
const faceY = BASE_H * 0.6;
const faceMat = material("Face", { color: "#2b2d42", roughness: 0.25, metalness: 0.1 });
const cheekMat = material("Cheek", { color: "#ffb4c6", roughness: 0.6, transparent: true, opacity: 0.6 });

const eyeL = mesh("Eye L", {
  geometry: { kind: "sphere", params: { radius: 0.22, widthSegments: 20, heightSegments: 16 } },
  materialId: faceMat,
  position: [-0.9, faceY, faceZ],
});
const eyeR = mesh("Eye R", {
  geometry: { kind: "sphere", params: { radius: 0.22, widthSegments: 20, heightSegments: 16 } },
  materialId: faceMat,
  position: [0.9, faceY, faceZ],
});
for (const sx of [-1, 1]) {
  mesh("Cheek", {
    geometry: { kind: "sphere", params: { radius: 0.35, widthSegments: 16, heightSegments: 12 } },
    materialId: cheekMat,
    position: [sx * 1.7, faceY - 0.2, faceZ - 0.08],
    scale: [1, 0.6, 0.4],
    castShadow: false,
  });
}
mesh("Mouth", {
  geometry: { kind: "box", params: { width: 0.55, height: 0.08, depth: 0.05 } },
  materialId: faceMat,
  position: [0, faceY - 0.4, faceZ],
  castShadow: false,
});

const ledMat = material("LED", { color: "#7bf1a8", emissive: "#7bf1a8", emissiveIntensity: 1.8, roughness: 0.3 });
mesh("LED", {
  geometry: { kind: "sphere", params: { radius: 0.12, widthSegments: 16, heightSegments: 12 } },
  materialId: ledMat,
  position: [BASE_W / 2 - 0.5, BASE_TOP_Y + 0.05, -BASE_D / 2 + 0.35],
  castShadow: false,
});

const groundMat = material("Ground", { color: "#1c1826", roughness: 0.9, metalness: 0 });
mesh("Ground", {
  geometry: { kind: "plane", params: { width: 26, height: 26 } },
  materialId: groundMat,
  position: [0, 0, 0],
  rotation: [-Math.PI / 2, 0, 0],
  castShadow: false,
});

// --- lights --------------------------------------------------------------

light("Key light", {
  light: { kind: "directional", color: "#fff6e8", intensity: 1.6, castShadow: true },
  position: [4, 6, 3],
});
light("Fill light", {
  light: { kind: "point", color: "#ffd6e8", intensity: 4, distance: 0, castShadow: false },
  position: [-4, 3, 3],
});
light("Rim light", {
  light: { kind: "point", color: "#8fe8ff", intensity: 4, distance: 0, castShadow: false },
  position: [0, 3, -4],
});

// --- idle blink animation --------------------------------------------------

const blinkId = id("an");
animations[blinkId] = {
  id: blinkId,
  name: "Blink",
  duration: 3,
  loop: true,
  tracks: [
    { targetId: eyeL, property: "transform.scale", keyframes: [
      { t: 0, v: [1, 1, 1] },
      { t: 2.6, v: [1, 1, 1] },
      { t: 2.75, v: [1, 0.15, 1], ease: "easeIn" },
      { t: 2.9, v: [1, 1, 1], ease: "easeOut" },
    ] },
    { targetId: eyeR, property: "transform.scale", keyframes: [
      { t: 0, v: [1, 1, 1] },
      { t: 2.6, v: [1, 1, 1] },
      { t: 2.75, v: [1, 0.15, 1], ease: "easeIn" },
      { t: 2.9, v: [1, 1, 1], ease: "easeOut" },
    ] },
  ],
};
interactions.push({
  id: id("ix"),
  trigger: { type: "start" },
  action: { type: "playAnimation", animationId: blinkId },
});

// --- assemble --------------------------------------------------------------

const doc = {
  chibi: 1,
  name: "Cute keyboard",
  root,
  nodes,
  materials,
  assets: {},
  animations,
  states,
  interactions,
  environment: { background: "#100e18", preset: "city", fog: null, shadows: true },
  camera: { position: [0, 4.6, 7], target: [0, 0.7, 0.6], fov: 40 },
  editor: { grid: true },
};

validateDocument(doc);

const outPath = resolve(__dirname, "../public/scenes/keyboard.chibi.json");
writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n");
console.log(`wrote ${outPath}`);
console.log(`keys: ${Object.keys(states).length}, nodes: ${Object.keys(nodes).length}, materials: ${Object.keys(materials).length}`);
