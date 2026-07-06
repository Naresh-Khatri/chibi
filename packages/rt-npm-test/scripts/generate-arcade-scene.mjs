// Generates public/scenes/arcade.chibi.json: a toy arcade cabinet top-down
// playfield. Stress targets: the states/interactions engine — a 5x5 lights-out
// board of click-toggled tiles (25 states + material overrides), a 4-pad simon
// with hover + click layers on the same node, 9 whack-a-mole clips that can
// overlap the always-running pop loop, and a big lever with a 3-way toggle.
// Run with `node scripts/generate-arcade-scene.mjs`.
import { sceneBuilder, rng, TAU } from "./lib.mjs";

const b = sceneBuilder();
const rand = rng(1337);

// --- table ---------------------------------------------------------------------

b.mesh("Table", {
  geometry: { kind: "box", params: { width: 22, height: 0.6, depth: 14, radius: 0.2, smoothness: 6 } },
  materialId: b.material("Table felt", { color: "#1e3a2f", roughness: 0.95, metalness: 0 }),
  position: [0, -0.3, 0],
});
b.mesh("Trim", {
  geometry: { kind: "box", params: { width: 22.6, height: 0.25, depth: 14.6, radius: 0.12, smoothness: 6 } },
  materialId: b.material("Trim", { color: "#8a5a2b", roughness: 0.4, metalness: 0.3 }),
  position: [0, -0.62, 0],
});

// --- lights-out board: 5x5 click-toggle tiles -------------------------------------

const board = b.group("Lights-out board", { position: [-6.5, 0, 0] });
b.mesh("Board base", {
  geometry: { kind: "box", params: { width: 6.6, height: 0.3, depth: 6.6, radius: 0.1, smoothness: 4 } },
  materialId: b.material("Board base", { color: "#2b2135", roughness: 0.7 }),
  parent: board,
  position: [0, 0.15, 0],
});
const GRID = 5;
for (let r = 0; r < GRID; r++) {
  for (let c = 0; c < GRID; c++) {
    const x = (c - (GRID - 1) / 2) * 1.22;
    const z = (r - (GRID - 1) / 2) * 1.22;
    const startOn = (r + c) % 3 === 0;
    const mat = b.material(`Tile ${r + 1}-${c + 1}`, {
      color: startOn ? "#ffd166" : "#3a3348",
      emissive: startOn ? "#ffd166" : "#000000",
      emissiveIntensity: startOn ? 1.2 : 0,
      roughness: 0.5,
    });
    const tile = b.mesh(`Tile ${r + 1}-${c + 1}`, {
      geometry: { kind: "box", params: { width: 1.05, height: 0.28, depth: 1.05, radius: 0.09, smoothness: 5 } },
      materialId: mat,
      parent: board,
      position: [x, 0.44, z],
    });
    // two exclusive states + toggle: On lifts & glows, Off sinks & dims.
    // Base stays whatever the start pattern says, so On/Off overrides both
    // pin every managed key — a good exercise for state resolution.
    const on = b.state(tile, "On", {
      [tile]: { "transform.position": [x, 0.52, z] },
      [mat]: { color: "#ffd166", opacity: 1 },
    });
    const off = b.state(tile, "Off", {
      [tile]: { "transform.position": [x, 0.38, z] },
      [mat]: { color: "#3a3348", opacity: 1 },
    });
    b.clickToggle(tile, startOn ? on : off, startOn ? off : on, { duration: 0.15, ease: "easeOut" });
  }
}

// --- simon: 4 quarter pads with hover AND click on the same node -------------------

const simon = b.group("Simon", { position: [4.5, 0, -3.2] });
b.mesh("Simon base", {
  geometry: { kind: "cylinder", params: { radiusTop: 2.6, radiusBottom: 2.9, height: 0.5, radialSegments: 48 } },
  materialId: b.material("Simon base", { color: "#26232e", roughness: 0.6 }),
  parent: simon,
  position: [0, 0.25, 0],
});
const PADS = [
  { name: "Pad red", color: "#e63946", angle: 0 },
  { name: "Pad blue", color: "#457b9d", angle: TAU / 4 },
  { name: "Pad green", color: "#52b788", angle: TAU / 2 },
  { name: "Pad yellow", color: "#ffb703", angle: (3 * TAU) / 4 },
];
for (const pad of PADS) {
  const x = Math.cos(pad.angle + TAU / 8) * 1.35;
  const z = Math.sin(pad.angle + TAU / 8) * 1.35;
  const mat = b.material(pad.name, { color: pad.color, roughness: 0.45, emissive: "#000000", emissiveIntensity: 0 });
  const node = b.mesh(pad.name, {
    geometry: { kind: "cylinder", params: { radiusTop: 0.85, radiusBottom: 0.95, height: 0.45, radialSegments: 32 } },
    materialId: mat,
    parent: simon,
    position: [x, 0.72, z],
  });
  // hover arms the pad (slight rise), click latches it lit — layered triggers
  const armed = b.state(node, "Armed", {
    [node]: { "transform.position": [x, 0.86, z] },
  });
  const lit = b.state(node, "Lit", {
    [node]: { "transform.position": [x, 0.6, z], "transform.scale": [1, 0.7, 1] },
    [mat]: { color: "#ffffff" },
  });
  b.hoverState(node, armed, { inDuration: 0.1, outDuration: 0.3 });
  b.clickToggle(node, "base", lit, { duration: 0.1, ease: "easeOut" });
}

// --- whack-a-mole: 3x3, ambient pop loop + per-mole bonk clips ----------------------

const moleField = b.group("Mole field", { position: [4.5, 0, 3.6] });
const dirtMat = b.material("Dirt", { color: "#4a3728", roughness: 1 });
const moleMat = b.material("Mole fur", { color: "#8a6f5b", roughness: 0.85 });
const snoutMat = b.material("Mole snout", { color: "#d9a48f", roughness: 0.7 });
const popTracks = [];
for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 3; c++) {
    const i = r * 3 + c;
    const x = (c - 1) * 2.1;
    const z = (r - 1) * 2.1;
    b.mesh(`Hole ${i + 1}`, {
      geometry: { kind: "cylinder", params: { radiusTop: 0.75, radiusBottom: 0.85, height: 0.22, radialSegments: 24 } },
      materialId: dirtMat,
      parent: moleField,
      position: [x, 0.11, z],
    });
    const mole = b.group(`Mole ${i + 1}`, { parent: moleField, position: [x, -0.55, z] });
    const body = b.mesh("Body", {
      geometry: { kind: "sphere", params: { radius: 0.5, widthSegments: 18, heightSegments: 14 } },
      materialId: moleMat,
      parent: mole,
      position: [0, 0.45, 0],
      scale: [1, 1.25, 1],
    });
    b.mesh("Snout", {
      geometry: { kind: "sphere", params: { radius: 0.16, widthSegments: 10, heightSegments: 8 } },
      materialId: snoutMat,
      parent: mole,
      position: [0, 0.62, 0.42],
      castShadow: false,
    });

    // staggered ambient pop: up for ~1.6s somewhere inside an 9s loop
    const t0 = (i * 0.97 + rand() * 0.4) % 7;
    popTracks.push({
      targetId: mole,
      property: "transform.position",
      keyframes: [
        { t: 0, v: [x, -0.55, z] },
        { t: t0, v: [x, -0.55, z] },
        { t: t0 + 0.25, v: [x, 0.15, z], ease: "easeOut" },
        { t: t0 + 1.6, v: [x, 0.15, z] },
        { t: t0 + 1.9, v: [x, -0.55, z], ease: "easeIn" },
        { t: 9, v: [x, -0.55, z] },
      ],
    });

    // click bonk: a one-shot squash clip per mole, overlapping the pop loop
    const bonk = b.animation(`Bonk ${i + 1}`, {
      duration: 0.6,
      loop: false,
      tracks: [
        {
          targetId: body,
          property: "transform.scale",
          keyframes: [
            { t: 0, v: [1, 1.25, 1] },
            { t: 0.12, v: [1.45, 0.5, 1.45], ease: "easeOut" },
            { t: 0.6, v: [1, 1.25, 1], ease: "easeOut" },
          ],
        },
      ],
    });
    b.interaction({ type: "click", nodeId: body }, { type: "playAnimation", animationId: bonk });
  }
}
b.playOnStart(b.animation("Mole pops", { duration: 9, loop: true, tracks: popTracks }));

// --- big lever: chained hover + click on distinct parts ----------------------------

const lever = b.group("Lever", { position: [-6.5, 0, 5.2] });
b.mesh("Lever base", {
  geometry: { kind: "box", params: { width: 1.6, height: 0.5, depth: 1.0, radius: 0.1, smoothness: 4 } },
  materialId: b.material("Lever base", { color: "#33303c", roughness: 0.5, metalness: 0.4 }),
  parent: lever,
  position: [0, 0.25, 0],
});
const arm = b.group("Lever arm", { parent: lever, position: [0, 0.5, 0], rotation: [0, 0, 0.9] });
b.mesh("Shaft", {
  geometry: { kind: "cylinder", params: { radiusTop: 0.07, radiusBottom: 0.09, height: 1.7, radialSegments: 12 } },
  materialId: b.material("Shaft", { color: "#9aa0b4", roughness: 0.25, metalness: 0.9 }),
  parent: arm,
  position: [0, 0.85, 0],
});
const knobMat = b.material("Knob", { color: "#e63946", roughness: 0.35 });
const knob = b.mesh("Knob", {
  geometry: { kind: "sphere", params: { radius: 0.28, widthSegments: 24, heightSegments: 18 } },
  materialId: knobMat,
  parent: arm,
  position: [0, 1.75, 0],
});
// the arm's states live on the GROUP node — clicking the knob drives the parent
const left = b.state(arm, "Left", { [arm]: { "transform.rotation": [0, 0, 0.9] } });
const right = b.state(arm, "Right", { [arm]: { "transform.rotation": [0, 0, -0.9] } });
b.interaction(
  { type: "click", nodeId: knob },
  { type: "toggleStates", nodeId: arm, a: left, b: right, duration: 0.35, ease: "easeInOut" },
);
const knobHot = b.state(knob, "Hot", { [knobMat]: { color: "#ffd166" } });
b.hoverState(knob, knobHot, { inDuration: 0.08, outDuration: 0.3 });

// --- marquee ------------------------------------------------------------------------

const marqueeMat = b.material("Marquee", {
  color: "#ff6ad5", emissive: "#ff6ad5", emissiveIntensity: 2, roughness: 0.3,
});
b.mesh("Marquee", {
  geometry: { kind: "text3d", params: { text: "ARCADE", size: 1.1, depth: 0.25, bevel: 0.05 } },
  materialId: marqueeMat,
  position: [-3.1, 2.2, -6.5],
  castShadow: false,
});
b.playOnStart(
  b.animation("Marquee pulse", {
    duration: 2.4,
    loop: true,
    tracks: [
      {
        targetId: marqueeMat,
        property: "color",
        keyframes: [
          { t: 0, v: "#ff6ad5" },
          { t: 1.2, v: "#6ad5ff", ease: "easeInOut" },
          { t: 2.4, v: "#ff6ad5", ease: "easeInOut" },
        ],
      },
    ],
  }),
);

// --- lights -------------------------------------------------------------------------

b.light("Key", {
  light: { kind: "directional", color: "#fff4e0", intensity: 1.5, castShadow: true },
  position: [6, 9, 5],
});
b.light("Board glow", {
  light: { kind: "point", color: "#b49aff", intensity: 10, distance: 12, castShadow: false },
  position: [-6.5, 3, 0],
});
b.light("Simon spot", {
  light: { kind: "spot", color: "#cfe8ff", intensity: 20, distance: 14, angle: 0.5, penumbra: 0.6, castShadow: false },
  position: [4.5, 6, 0],
});

b.write("arcade", {
  name: "Arcade",
  camera: { position: [0, 11, 12], target: [0, 0, 0.5], fov: 42 },
  environment: { background: "#141019", preset: "city", fog: null, shadows: true },
  grid: false,
});
