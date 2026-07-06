// Generates public/scenes/hyrule.chibi.json: a low-poly Zelda-style overworld.
// Everything is flat-shaded primitives: a sword-in-pedestal hill (click the
// sword to draw it — a one-shot clip), a windmill village, a korok forest, a
// glowing shrine gate, spinning collectible rupees (click = one-way collect,
// since a scale-0 node can't be clicked again), a treasure chest whose lid is
// a pivot group, drifting clouds and bobbing fairies.
// Run with `node scripts/generate-hyrule-scene.mjs`.
import { sceneBuilder, rng, TAU } from "./lib.mjs";

const b = sceneBuilder();
const rand = rng(2017);

// --- palette ---------------------------------------------------------------------

const mats = {
  grass: b.material("Grass", { color: "#7cb75a", roughness: 0.95, flatShading: true }),
  grassDark: b.material("Grass dark", { color: "#5f9c48", roughness: 0.95, flatShading: true }),
  dirt: b.material("Dirt", { color: "#a5793f", roughness: 1, flatShading: true }),
  rock: b.material("Rock", { color: "#8d8577", roughness: 0.95, flatShading: true }),
  rockDark: b.material("Rock dark", { color: "#6e675c", roughness: 1, flatShading: true }),
  trunk: b.material("Trunk", { color: "#7a5230", roughness: 0.95, flatShading: true }),
  leaf: b.material("Leaves", { color: "#4e9b4e", roughness: 0.9, flatShading: true }),
  leafLight: b.material("Leaves light", { color: "#6cb865", roughness: 0.9, flatShading: true }),
  water: b.material("Water", { color: "#4fa8d8", roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.75, flatShading: true }),
  sand: b.material("Sand", { color: "#dbc491", roughness: 1, flatShading: true }),
  wall: b.material("Plaster", { color: "#e8dcc4", roughness: 0.9, flatShading: true }),
  roof: b.material("Roof", { color: "#c05b4a", roughness: 0.85, flatShading: true }),
  wood: b.material("Wood", { color: "#8a6238", roughness: 0.9, flatShading: true }),
  blade: b.material("Blade", { color: "#dfe8f2", roughness: 0.15, metalness: 0.95, flatShading: true }),
  hilt: b.material("Hilt", { color: "#4d5fc1", roughness: 0.4, metalness: 0.3, flatShading: true }),
  gold: b.material("Gold", { color: "#e8b93e", roughness: 0.3, metalness: 0.8, flatShading: true }),
  shrineStone: b.material("Shrine stone", { color: "#5b5f6e", roughness: 0.9, flatShading: true }),
  shrineGlow: b.material("Shrine glow", { color: "#ff9d45", emissive: "#ff8a2a", emissiveIntensity: 1.8, roughness: 0.4 }),
  cloud: b.material("Cloud", { color: "#ffffff", roughness: 1, flatShading: true, transparent: true, opacity: 0.92 }),
  fairy: b.material("Fairy", { color: "#ffe9f6", emissive: "#ff9de0", emissiveIntensity: 2.2, roughness: 0.3 }),
};
const rupeeMats = [
  b.material("Rupee green", { color: "#3fd06b", emissive: "#1f8f42", emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.3, flatShading: true }),
  b.material("Rupee blue", { color: "#3f8fd0", emissive: "#1f5a8f", emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.3, flatShading: true }),
  b.material("Rupee red", { color: "#d04f3f", emissive: "#8f2a1f", emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.3, flatShading: true }),
];

// --- ground & lake ------------------------------------------------------------------

b.mesh("Meadow", {
  geometry: { kind: "cylinder", params: { radiusTop: 24, radiusBottom: 26, height: 1.6, radialSegments: 14 } },
  materialId: mats.grass,
  position: [0, -0.8, 0],
  receiveShadow: true,
});
b.mesh("Underside", {
  geometry: { kind: "cylinder", params: { radiusTop: 26, radiusBottom: 12, height: 7, radialSegments: 14 } },
  materialId: mats.rockDark,
  position: [0, -5.1, 0],
  castShadow: false,
});

const lake = b.group("Lake", { position: [-11, 0, 10] });
b.mesh("Lake bed", {
  geometry: { kind: "cylinder", params: { radiusTop: 7, radiusBottom: 5.4, height: 0.8, radialSegments: 12 } },
  materialId: mats.sand,
  parent: lake,
  position: [0, -0.38, 0],
  castShadow: false,
});
const waterMesh = b.mesh("Water", {
  geometry: { kind: "cylinder", params: { radiusTop: 6.6, radiusBottom: 6.6, height: 0.18, radialSegments: 12 } },
  materialId: mats.water,
  parent: lake,
  position: [0, -0.06, 0],
  castShadow: false,
});

// --- sword hill (center) -------------------------------------------------------------

const hill = b.group("Sword hill", { position: [0, 0, -1] });
for (const [r, h, y] of [[5.2, 1.4, 0.7], [3.9, 1.3, 1.9], [2.7, 1.2, 3.0]]) {
  b.mesh("Tier", {
    geometry: { kind: "cylinder", params: { radiusTop: r * 0.82, radiusBottom: r, height: h, radialSegments: 9 } },
    materialId: mats.grassDark,
    parent: hill,
    position: [0, y, 0],
  });
}
b.mesh("Pedestal", {
  geometry: { kind: "cylinder", params: { radiusTop: 0.8, radiusBottom: 1.05, height: 0.7, radialSegments: 8 } },
  materialId: mats.rock,
  parent: hill,
  position: [0, 3.9, 0],
});

const sword = b.group("Master sword", { parent: hill, position: [0, 4.1, 0] });
b.mesh("Blade", {
  geometry: { kind: "box", params: { width: 0.16, height: 1.7, depth: 0.05 } },
  materialId: mats.blade,
  parent: sword,
  position: [0, 0.55, 0],
});
b.mesh("Guard", {
  geometry: { kind: "box", params: { width: 0.75, height: 0.14, depth: 0.14, radius: 0.05, smoothness: 4 } },
  materialId: mats.hilt,
  parent: sword,
  position: [0, 1.42, 0],
});
b.mesh("Grip", {
  geometry: { kind: "cylinder", params: { radiusTop: 0.06, radiusBottom: 0.07, height: 0.5, radialSegments: 8 } },
  materialId: mats.hilt,
  parent: sword,
  position: [0, 1.74, 0],
});
b.mesh("Pommel", {
  geometry: { kind: "sphere", params: { radius: 0.09, widthSegments: 8, heightSegments: 6 } },
  materialId: mats.gold,
  parent: sword,
  position: [0, 2.02, 0],
});

// click the sword: a one-shot draw clip — rises, wiggles free, settles back
const drawClip = b.animation("Draw sword", {
  duration: 2.2,
  loop: false,
  tracks: [
    {
      targetId: sword,
      property: "transform.position",
      keyframes: [
        { t: 0, v: [0, 4.1, 0] },
        { t: 0.3, v: [0, 4.25, 0], ease: "easeOut" },
        { t: 0.5, v: [0, 4.15, 0], ease: "easeIn" },
        { t: 0.8, v: [0, 5.6, 0], ease: "easeOut" },
        { t: 1.5, v: [0, 5.6, 0] },
        { t: 2.2, v: [0, 4.1, 0], ease: "easeInOut" },
      ],
    },
    {
      targetId: sword,
      property: "transform.rotation",
      keyframes: [
        { t: 0, v: [0, 0, 0] },
        { t: 0.35, v: [0, 0, 0.12], ease: "easeInOut" },
        { t: 0.55, v: [0, 0, -0.12], ease: "easeInOut" },
        { t: 0.8, v: [0, 0, 0], ease: "easeOut" },
        { t: 1.1, v: [0, TAU, 0], ease: "easeInOut" },
        { t: 2.2, v: [0, TAU, 0] },
      ],
    },
  ],
});
for (const part of b.doc.nodes[sword].children) {
  b.interaction({ type: "click", nodeId: part }, { type: "playAnimation", animationId: drawClip });
}

// --- village (east) -------------------------------------------------------------------

const village = b.group("Village", { position: [12, 0, 4], rotation: [0, -0.5, 0] });
function house(name, x, z, w, d, h, rotY) {
  const g = b.group(name, { parent: village, position: [x, 0, z], rotation: [0, rotY, 0] });
  b.mesh("Walls", {
    geometry: { kind: "box", params: { width: w, height: h, depth: d } },
    materialId: mats.wall,
    parent: g,
    position: [0, h / 2, 0],
  });
  b.mesh("Roof", {
    geometry: { kind: "cone", params: { radius: Math.max(w, d) * 0.78, height: h * 0.9, radialSegments: 4 } },
    materialId: mats.roof,
    parent: g,
    position: [0, h + h * 0.45, 0],
    rotation: [0, Math.PI / 4, 0],
  });
  b.mesh("Door", {
    geometry: { kind: "box", params: { width: 0.5, height: 0.9, depth: 0.08 } },
    materialId: mats.wood,
    parent: g,
    position: [0, 0.45, d / 2 + 0.03],
    castShadow: false,
  });
  return g;
}
house("House 1", 0, 0, 2.2, 2.0, 1.6, 0.15);
house("House 2", 3.1, 1.4, 1.8, 1.8, 1.4, -0.4);
house("House 3", -2.6, 2.0, 1.9, 1.7, 1.3, 0.7);

// windmill
const mill = b.group("Windmill", { parent: village, position: [1.2, 0, -3.4] });
b.mesh("Tower", {
  geometry: { kind: "cylinder", params: { radiusTop: 0.7, radiusBottom: 1.1, height: 3.6, radialSegments: 6 } },
  materialId: mats.wall,
  parent: mill,
  position: [0, 1.8, 0],
});
b.mesh("Cap", {
  geometry: { kind: "cone", params: { radius: 0.95, height: 1, radialSegments: 6 } },
  materialId: mats.roof,
  parent: mill,
  position: [0, 4.1, 0],
});
const hub = b.group("Blades", { parent: mill, position: [0, 3.4, 1.05] });
for (let i = 0; i < 4; i++) {
  b.mesh(`Blade ${i + 1}`, {
    geometry: { kind: "box", params: { width: 0.34, height: 2.2, depth: 0.06 } },
    materialId: mats.wood,
    parent: hub,
    position: [Math.sin((i * TAU) / 4) * 1.1, Math.cos((i * TAU) / 4) * 1.1, 0],
    rotation: [0, 0, -(i * TAU) / 4],
    castShadow: false,
  });
}

// treasure chest: lid is a pivot group at the hinge, click toggles open/closed
const chest = b.group("Chest", { parent: village, position: [-1.2, 0, -1.6], rotation: [0, 0.9, 0] });
const chestBase = b.mesh("Chest base", {
  geometry: { kind: "box", params: { width: 1.0, height: 0.55, depth: 0.7, radius: 0.06, smoothness: 4 } },
  materialId: mats.wood,
  parent: chest,
  position: [0, 0.28, 0],
});
const lid = b.group("Lid pivot", { parent: chest, position: [0, 0.55, -0.35] });
b.mesh("Lid", {
  geometry: { kind: "box", params: { width: 1.0, height: 0.3, depth: 0.7, radius: 0.1, smoothness: 4 } },
  materialId: mats.wood,
  parent: lid,
  position: [0, 0.15, 0.35],
});
b.mesh("Clasp", {
  geometry: { kind: "box", params: { width: 0.16, height: 0.2, depth: 0.06 } },
  materialId: mats.gold,
  parent: lid,
  position: [0, 0.1, 0.72],
  castShadow: false,
});
const treasure = b.mesh("Treasure", {
  geometry: { kind: "sphere", params: { radius: 0.16, widthSegments: 8, heightSegments: 6 } },
  materialId: mats.gold,
  parent: chest,
  position: [0, 0.5, 0],
  visible: true,
  castShadow: false,
});
const lidOpen = b.state(lid, "Open", { [lid]: { "transform.rotation": [-1.9, 0, 0] } });
const treasureUp = b.state(treasure, "Revealed", { [treasure]: { "transform.position": [0, 1.05, 0] } });
b.interaction(
  { type: "click", nodeId: chestBase },
  { type: "toggleStates", nodeId: lid, a: "base", b: lidOpen, duration: 0.4, ease: "easeOut" },
);
b.interaction(
  { type: "click", nodeId: chestBase },
  { type: "toggleStates", nodeId: treasure, a: "base", b: treasureUp, duration: 0.5, ease: "easeOut" },
);

// --- korok forest (north-west) ---------------------------------------------------------

const forest = b.group("Forest", { position: [-9, 0, -9] });
for (let i = 0; i < 16; i++) {
  const a = rand() * TAU;
  const r = 1.5 + rand() * 6;
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r * 0.8;
  const s = 0.7 + rand() * 0.9;
  const tree = b.group(`Tree ${i + 1}`, { parent: forest, position: [x, 0, z], scale: [s, s, s], rotation: [0, rand() * TAU, 0] });
  b.mesh("Trunk", {
    geometry: { kind: "cylinder", params: { radiusTop: 0.14, radiusBottom: 0.22, height: 1.2, radialSegments: 6 } },
    materialId: mats.trunk,
    parent: tree,
    position: [0, 0.6, 0],
  });
  const layers = 2 + Math.floor(rand() * 2);
  for (let l = 0; l < layers; l++) {
    b.mesh(`Canopy ${l + 1}`, {
      geometry: { kind: "cone", params: { radius: 1.0 - l * 0.28, height: 1.1 - l * 0.15, radialSegments: 7 } },
      materialId: l % 2 ? mats.leafLight : mats.leaf,
      parent: tree,
      position: [0, 1.35 + l * 0.7, 0],
    });
  }
}
// the great deku-ish tree
const deku = b.group("Great tree", { parent: forest, position: [0, 0, -1] });
b.mesh("Great trunk", {
  geometry: { kind: "cylinder", params: { radiusTop: 0.8, radiusBottom: 1.5, height: 3.4, radialSegments: 8 } },
  materialId: mats.trunk,
  parent: deku,
  position: [0, 1.7, 0],
});
b.mesh("Great canopy", {
  geometry: { kind: "sphere", params: { radius: 3.1, widthSegments: 8, heightSegments: 6 } },
  materialId: mats.leaf,
  parent: deku,
  position: [0, 5, 0],
  scale: [1, 0.75, 1],
});

// --- shrine (north-east) ----------------------------------------------------------------

const shrine = b.group("Shrine", { position: [10, 0, -9], rotation: [0, 0.6, 0] });
b.mesh("Plinth", {
  geometry: { kind: "box", params: { width: 4.6, height: 0.5, depth: 4.6, radius: 0.08, smoothness: 4 } },
  materialId: mats.shrineStone,
  parent: shrine,
  position: [0, 0.25, 0],
});
for (const sx of [-1, 1]) {
  b.mesh("Pillar", {
    geometry: { kind: "box", params: { width: 0.55, height: 3.2, depth: 0.55 } },
    materialId: mats.shrineStone,
    parent: shrine,
    position: [sx * 1.5, 2.1, 0],
    rotation: [0, 0, sx * -0.12],
  });
}
b.mesh("Lintel", {
  geometry: { kind: "box", params: { width: 4.4, height: 0.45, depth: 0.7 } },
  materialId: mats.shrineStone,
  parent: shrine,
  position: [0, 3.85, 0],
  rotation: [0, 0, 0.04],
});
const gate = b.mesh("Gate ring", {
  geometry: { kind: "torus", params: { radius: 0.9, tube: 0.12, radialSegments: 5, tubularSegments: 24 } },
  materialId: mats.shrineGlow,
  parent: shrine,
  position: [0, 2.0, 0],
  castShadow: false,
});
const eye = b.mesh("Shrine eye", {
  geometry: { kind: "sphere", params: { radius: 0.34, widthSegments: 10, heightSegments: 8 } },
  materialId: mats.shrineGlow,
  parent: shrine,
  position: [0, 2.0, 0],
  castShadow: false,
});
b.light("Shrine light", {
  light: { kind: "point", color: "#ff9d45", intensity: 12, distance: 10, castShadow: false },
  parent: shrine,
  position: [0, 2.2, 1],
});
// hover the eye: the whole ring flares
const flared = b.state(eye, "Flared", {
  [eye]: { "transform.scale": [1.5, 1.5, 1.5] },
});
b.hoverState(eye, flared, { inDuration: 0.12, outDuration: 0.5 });

// --- rupees: octahedron = sphere with 4x2 segments; click to collect (one-way) ----------

const rupees = b.group("Rupees");
const rupeeSpinTracks = [];
const RUPEE_SPOTS = [
  [4.5, 0, 6.5], [-4, 0, 7.5], [6.5, 0, -3], [-6, 0, 1.5], [1.5, 0, 10.5],
  [-13, 0, -1], [14, 0, -3.5], [3, 0, -8.5],
];
RUPEE_SPOTS.forEach((pos, i) => {
  const spot = b.group(`Rupee ${i + 1}`, { parent: rupees, position: pos });
  const gem = b.mesh("Gem", {
    geometry: { kind: "sphere", params: { radius: 0.34, widthSegments: 4, heightSegments: 2 } },
    materialId: rupeeMats[i % rupeeMats.length],
    parent: spot,
    position: [0, 0.9, 0],
    scale: [0.62, 1, 0.62],
    castShadow: false,
  });
  rupeeSpinTracks.push({
    targetId: spot,
    property: "transform.rotation",
    keyframes: [{ t: 0, v: [0, (i / RUPEE_SPOTS.length) * TAU, 0] }, { t: 5, v: [0, (i / RUPEE_SPOTS.length) * TAU + TAU, 0] }],
  });
  const collected = b.state(gem, "Collected", {
    [gem]: { "transform.scale": [0.01, 0.01, 0.01], "transform.position": [0, 2.2, 0] },
  });
  b.interaction(
    { type: "click", nodeId: gem },
    { type: "transition", nodeId: gem, to: collected, duration: 0.35, ease: "easeIn" },
  );
});

// --- scatter: rocks + grass tufts ---------------------------------------------------------

const scatter = b.group("Scatter");
for (let i = 0; i < 22; i++) {
  const a = rand() * TAU;
  const r = 6 + rand() * 16;
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  if (Math.hypot(x + 11, z - 10) < 7.5) continue; // keep out of the lake
  if (rand() > 0.5) {
    b.mesh(`Rock ${i + 1}`, {
      geometry: { kind: "sphere", params: { radius: 0.3 + rand() * 0.5, widthSegments: 5, heightSegments: 4 } },
      materialId: mats.rock,
      parent: scatter,
      position: [x, 0.15, z],
      scale: [1, 0.65, 1],
      rotation: [0, rand() * TAU, 0],
    });
  } else {
    b.mesh(`Tuft ${i + 1}`, {
      geometry: { kind: "cone", params: { radius: 0.22, height: 0.5 + rand() * 0.3, radialSegments: 5 } },
      materialId: mats.grassDark,
      parent: scatter,
      position: [x, 0.25, z],
      rotation: [rand() * 0.2, 0, rand() * 0.2],
      castShadow: false,
    });
  }
}

// --- clouds + fairies ------------------------------------------------------------------------

const sky = b.group("Sky");
const cloudDriftTracks = [];
for (let i = 0; i < 5; i++) {
  const cloud = b.group(`Cloud ${i + 1}`, {
    parent: sky,
    position: [(rand() - 0.5) * 30, 10 + rand() * 4, (rand() - 0.5) * 30],
  });
  for (let p = 0; p < 3; p++) {
    b.mesh("Puff", {
      geometry: { kind: "sphere", params: { radius: 0.9 - p * 0.2, widthSegments: 7, heightSegments: 5 } },
      materialId: mats.cloud,
      parent: cloud,
      position: [p * 1.1 - 1.1, (p % 2) * 0.3, 0],
      scale: [1.4, 0.7, 1],
      castShadow: false,
      receiveShadow: false,
    });
  }
  const [cx, cy, cz] = b.doc.nodes[cloud].transform.position;
  cloudDriftTracks.push({
    targetId: cloud,
    property: "transform.position",
    keyframes: [
      { t: 0, v: [cx, cy, cz] },
      { t: 20, v: [cx + 4, cy + 0.4, cz - 2], ease: "easeInOut" },
      { t: 40, v: [cx, cy, cz], ease: "easeInOut" },
    ],
  });
}

const fairyBobTracks = [];
for (let i = 0; i < 4; i++) {
  const fx = -11 + Math.cos((i / 4) * TAU) * 3;
  const fz = 10 + Math.sin((i / 4) * TAU) * 3;
  const fairy = b.mesh(`Fairy ${i + 1}`, {
    geometry: { kind: "sphere", params: { radius: 0.12, widthSegments: 8, heightSegments: 6 } },
    materialId: mats.fairy,
    parent: sky,
    position: [fx, 1.1, fz],
    castShadow: false,
    receiveShadow: false,
  });
  const ph = i * 0.9;
  fairyBobTracks.push({
    targetId: fairy,
    property: "transform.position",
    keyframes: [
      { t: 0, v: [fx, 1.1 + Math.sin(ph) * 0.3, fz] },
      { t: 1.8, v: [fx + 0.5, 1.7, fz - 0.4], ease: "easeInOut" },
      { t: 3.6, v: [fx - 0.4, 0.9, fz + 0.5], ease: "easeInOut" },
      { t: 5.4, v: [fx, 1.1 + Math.sin(ph) * 0.3, fz], ease: "easeInOut" },
    ],
  });
}

// --- lights -----------------------------------------------------------------------------------

b.light("Sun", {
  light: { kind: "directional", color: "#fff2d8", intensity: 1.7, castShadow: true },
  position: [14, 18, 8],
});
b.light("Sky bounce", {
  light: { kind: "point", color: "#bfd8ff", intensity: 14, distance: 0, castShadow: false },
  position: [-8, 12, -6],
});

// --- ambient animations -------------------------------------------------------------------------

b.playOnStart(
  b.animation("World idle", {
    duration: 40,
    loop: true,
    tracks: [
      ...cloudDriftTracks,
      {
        targetId: hub,
        property: "transform.rotation",
        keyframes: [{ t: 0, v: [0, 0, 0] }, { t: 40, v: [0, 0, TAU * 5] }],
      },
      {
        targetId: waterMesh,
        property: "transform.position",
        keyframes: [
          { t: 0, v: [0, -0.06, 0] },
          { t: 20, v: [0, 0.06, 0], ease: "easeInOut" },
          { t: 40, v: [0, -0.06, 0], ease: "easeInOut" },
        ],
      },
    ],
  }),
);
b.playOnStart(b.animation("Rupee spin", { duration: 5, loop: true, tracks: rupeeSpinTracks }));
b.playOnStart(b.animation("Fairy bob", { duration: 5.4, loop: true, tracks: fairyBobTracks }));
b.playOnStart(
  b.animation("Shrine hum", {
    duration: 3,
    loop: true,
    tracks: [
      {
        targetId: gate,
        property: "transform.rotation",
        keyframes: [{ t: 0, v: [0, 0, 0] }, { t: 3, v: [0, 0, TAU] }],
      },
      {
        targetId: mats.shrineGlow,
        property: "color",
        keyframes: [
          { t: 0, v: "#ff9d45" },
          { t: 1.5, v: "#ffc98a", ease: "easeInOut" },
          { t: 3, v: "#ff9d45", ease: "easeInOut" },
        ],
      },
    ],
  }),
);

b.write("hyrule", {
  name: "Lowpoly Hyrule",
  camera: { position: [15, 12, 20], target: [0, 2, 0], fov: 42 },
  environment: { background: "#a8d8ea", preset: "dawn", fog: { color: "#a8d8ea", near: 30, far: 70 }, shadows: true },
  grid: false,
});
