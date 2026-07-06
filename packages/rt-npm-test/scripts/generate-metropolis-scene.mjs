// Generates public/scenes/metropolis.chibi.json: a foggy night city.
// Stress targets: raw node count (~300 meshes), fog + shadow settings, spot
// lights with angle/penumbra, step-keyframe (visible) beacon blinks, and hover
// states on the tallest towers.
// Run with `node scripts/generate-metropolis-scene.mjs`.
import { sceneBuilder, rng, TAU } from "./lib.mjs";

const b = sceneBuilder();
const rand = rng(42);

const BLOCKS = 7; // 7x7 city blocks
const LOTS = 2; // 2x2 buildings per block
const LOT = 2.4; // lot pitch
const STREET = 1.8; // street width between blocks
const BLOCK_SPAN = LOTS * LOT;
const PITCH = BLOCK_SPAN + STREET;
const CITY_SPAN = BLOCKS * PITCH - STREET;

// --- ground -------------------------------------------------------------------

b.mesh("Ground", {
  geometry: { kind: "plane", params: { width: CITY_SPAN + 14, height: CITY_SPAN + 14 } },
  materialId: b.material("Asphalt", { color: "#14121c", roughness: 0.95, metalness: 0 }),
  rotation: [-Math.PI / 2, 0, 0],
  castShadow: false,
});

// --- buildings ------------------------------------------------------------------

const facadeMats = [
  b.material("Facade slate", { color: "#2a2d3e", roughness: 0.8, metalness: 0.15 }),
  b.material("Facade brick", { color: "#3d2f38", roughness: 0.9, metalness: 0.05 }),
  b.material("Facade steel", { color: "#3a4152", roughness: 0.45, metalness: 0.6 }),
  b.material("Facade concrete", { color: "#333644", roughness: 0.85, metalness: 0.05 }),
];
const windowMats = [
  b.material("Windows warm", { color: "#3a3226", emissive: "#ffb45e", emissiveIntensity: 1.1, roughness: 0.4 }),
  b.material("Windows cool", { color: "#26303a", emissive: "#7fd4ff", emissiveIntensity: 0.9, roughness: 0.4 }),
  b.material("Windows neon", { color: "#33263a", emissive: "#ff7ad9", emissiveIntensity: 1.2, roughness: 0.4 }),
];
const beaconMat = b.material("Beacon", { color: "#ff3355", emissive: "#ff3355", emissiveIntensity: 2.5, roughness: 0.3 });
const roofMat = b.material("Roof", { color: "#1c1e2a", roughness: 0.9 });

const city = b.group("City");
const beaconBlinks = [];
const towers = []; // tallest buildings, get hover states

for (let bx = 0; bx < BLOCKS; bx++) {
  for (let bz = 0; bz < BLOCKS; bz++) {
    const block = b.group(`Block ${bx + 1}-${bz + 1}`, {
      parent: city,
      position: [
        bx * PITCH - CITY_SPAN / 2 + BLOCK_SPAN / 2 - LOT / 2,
        0,
        bz * PITCH - CITY_SPAN / 2 + BLOCK_SPAN / 2 - LOT / 2,
      ],
    });
    for (let lx = 0; lx < LOTS; lx++) {
      for (let lz = 0; lz < LOTS; lz++) {
        // taller toward the center
        const cx = bx - (BLOCKS - 1) / 2;
        const cz = bz - (BLOCKS - 1) / 2;
        const centrality = 1 - Math.hypot(cx, cz) / Math.hypot((BLOCKS - 1) / 2, (BLOCKS - 1) / 2);
        const h = 1.2 + rand() * 2.5 + centrality * centrality * (6 + rand() * 8);
        const w = LOT * (0.55 + rand() * 0.3);
        const d = LOT * (0.55 + rand() * 0.3);
        const x = (lx - (LOTS - 1) / 2) * LOT;
        const z = (lz - (LOTS - 1) / 2) * LOT;

        const bld = b.group(`Building ${bx + 1}-${bz + 1}-${lx * LOTS + lz + 1}`, {
          parent: block,
          position: [x, 0, z],
        });
        b.mesh("Shell", {
          geometry: { kind: "box", params: { width: w, height: h, depth: d } },
          materialId: facadeMats[Math.floor(rand() * facadeMats.length)],
          parent: bld,
          position: [0, h / 2, 0],
        });
        // lit window band inset into the facade
        b.mesh("Windows", {
          geometry: { kind: "box", params: { width: w * 0.9, height: h * 0.82, depth: d * 1.02 } },
          materialId: windowMats[Math.floor(rand() * windowMats.length)],
          parent: bld,
          position: [0, h * 0.48, 0],
          castShadow: false,
          receiveShadow: false,
        });
        b.mesh("Roof slab", {
          geometry: { kind: "box", params: { width: w * 1.06, height: 0.12, depth: d * 1.06 } },
          materialId: roofMat,
          parent: bld,
          position: [0, h + 0.06, 0],
        });
        if (h > 8) {
          const beacon = b.mesh("Beacon", {
            geometry: { kind: "sphere", params: { radius: 0.09, widthSegments: 8, heightSegments: 6 } },
            materialId: beaconMat,
            parent: bld,
            position: [0, h + 0.55, 0],
            castShadow: false,
          });
          b.mesh("Antenna", {
            geometry: { kind: "cylinder", params: { radiusTop: 0.015, radiusBottom: 0.03, height: 0.8, radialSegments: 6 } },
            materialId: roofMat,
            parent: bld,
            position: [0, h + 0.4, 0],
            castShadow: false,
          });
          const phase = rand();
          beaconBlinks.push({
            targetId: beacon,
            property: "visible",
            keyframes: [
              { t: 0, v: phase > 0.5 },
              { t: 0.9 * phase + 0.1, v: phase <= 0.5 },
              { t: 1.1 + 0.8 * phase, v: phase > 0.5 },
              { t: 2, v: phase > 0.5 },
            ],
          });
          towers.push(bld);
        }
      }
    }
  }
}

// hover a tall tower: whole building group leans up out of the fog
for (const nodeId of towers) {
  const lifted = b.state(nodeId, "Lifted", {
    [nodeId]: { "transform.position": [
      b.doc.nodes[nodeId].transform.position[0],
      0.6,
      b.doc.nodes[nodeId].transform.position[2],
    ] },
  });
  b.hoverState(nodeId, lifted, { inDuration: 0.2, outDuration: 0.45 });
}

// --- street lamps ---------------------------------------------------------------

const poleMat = b.material("Lamp pole", { color: "#22242e", roughness: 0.6, metalness: 0.5 });
const bulbMat = b.material("Lamp bulb", { color: "#ffe6b0", emissive: "#ffd98a", emissiveIntensity: 2, roughness: 0.3 });
let lampShadowBudget = 2; // only a couple of shadow-casting spots
for (let i = 0; i < BLOCKS - 1; i++) {
  for (const j of [1, BLOCKS - 2]) {
    const x = (i + 0.5) * PITCH - CITY_SPAN / 2 + BLOCK_SPAN / 2 - LOT / 2 + BLOCK_SPAN / 2 + STREET / 2 - PITCH / 2;
    const z = j * PITCH - CITY_SPAN / 2 + BLOCK_SPAN / 2 - LOT / 2 + BLOCK_SPAN / 2 + STREET / 2;
    const lamp = b.group(`Lamp ${i + 1}-${j}`, { position: [x, 0, z] });
    b.mesh("Pole", {
      geometry: { kind: "cylinder", params: { radiusTop: 0.04, radiusBottom: 0.07, height: 2.6, radialSegments: 8 } },
      materialId: poleMat,
      parent: lamp,
      position: [0, 1.3, 0],
    });
    b.mesh("Bulb", {
      geometry: { kind: "sphere", params: { radius: 0.12, widthSegments: 10, heightSegments: 8 } },
      materialId: bulbMat,
      parent: lamp,
      position: [0, 2.65, 0],
      castShadow: false,
    });
    const castShadow = lampShadowBudget-- > 0;
    b.light("Lamp spot", {
      light: { kind: "spot", color: "#ffd98a", intensity: 14, distance: 9, angle: 0.65, penumbra: 0.7, castShadow },
      parent: lamp,
      position: [0, 2.6, 0],
    });
  }
}

// --- patrol blimp ------------------------------------------------------------------

const blimpPivot = b.group("Blimp pivot", { position: [0, 0, 0] });
const blimp = b.group("Blimp", { parent: blimpPivot, position: [10, 13, 0], rotation: [0, Math.PI / 2, 0] });
b.mesh("Envelope", {
  geometry: { kind: "sphere", params: { radius: 1.1, widthSegments: 20, heightSegments: 14 } },
  materialId: b.material("Blimp skin", { color: "#c8cfe8", roughness: 0.5, metalness: 0.1 }),
  parent: blimp,
  scale: [1, 0.55, 0.55],
  castShadow: false,
});
b.mesh("Gondola", {
  geometry: { kind: "box", params: { width: 0.5, height: 0.2, depth: 0.24 } },
  materialId: poleMat,
  parent: blimp,
  position: [0, -0.68, 0],
  castShadow: false,
});
b.mesh("Tail fin", {
  geometry: { kind: "box", params: { width: 0.5, height: 0.5, depth: 0.05 } },
  materialId: b.material("Blimp fin", { color: "#e85d75", roughness: 0.6 }),
  parent: blimp,
  position: [-1.0, 0.15, 0],
  rotation: [0, 0, 0.4],
  castShadow: false,
});
b.light("Searchlight", {
  light: { kind: "spot", color: "#cfe8ff", intensity: 30, distance: 22, angle: 0.32, penumbra: 0.5, castShadow: false },
  parent: blimp,
  position: [0, -0.75, 0],
});

// --- moon + sky lights ------------------------------------------------------------

b.light("Moon", {
  light: { kind: "directional", color: "#9db4d9", intensity: 0.7, castShadow: true },
  position: [12, 20, -8],
});
b.light("City glow", {
  light: { kind: "point", color: "#4a3f66", intensity: 8, distance: 0, castShadow: false },
  position: [0, 6, 0],
});

// --- animations -------------------------------------------------------------------

b.playOnStart(b.animation("Beacon blinks", { duration: 2, loop: true, tracks: beaconBlinks }));
b.playOnStart(
  b.animation("Blimp patrol", {
    duration: 45,
    loop: true,
    tracks: [
      {
        targetId: blimpPivot,
        property: "transform.rotation",
        keyframes: [{ t: 0, v: [0, 0, 0] }, { t: 45, v: [0, TAU, 0] }],
      },
      {
        targetId: blimp,
        property: "transform.position",
        keyframes: [
          { t: 0, v: [10, 13, 0] },
          { t: 22.5, v: [10, 11.5, 0], ease: "easeInOut" },
          { t: 45, v: [10, 13, 0], ease: "easeInOut" },
        ],
      },
    ],
  }),
);

b.write("metropolis", {
  name: "Metropolis",
  camera: { position: [16, 12, 24], target: [0, 3, 0], fov: 45 },
  environment: {
    background: "#0a0c16",
    preset: null,
    fog: { color: "#0a0c16", near: 14, far: 55 },
    shadows: true,
  },
  grid: false,
});
